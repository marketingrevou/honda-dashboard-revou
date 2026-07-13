/**
 * Update engine — the single committed script the GitHub Actions workflow runs.
 *
 * Consolidates the scrape + classify pipeline into one process that runs the
 * three phases end-to-end against the LIVE scrape-enabled account list:
 *
 *   Phase 1 — Scrape   (Apify discovery actor → upsert instagram_posts, NO classify)
 *   Phase 2 — Refresh  (Apify api scraper → refresh likes/comments/views + thumbnail)
 *   Phase 3 — Classify (OpenAI gpt-4o-mini combined-vision → caption-ai fallback)
 *
 * It runs on GitHub Actions (6h timeout, single process), so unlike the Supabase
 * Edge Functions it needs no chunk cursor and never hits the 546 WORKER_LIMIT.
 * Results are written INTO Supabase via the service-role key exactly as before.
 *
 * Config comes from process.env (GitHub injects secrets as env vars — this
 * script does NOT read .env files):
 *   APIFY_TOKEN, OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *   NEXT_SUPABASE_SERVICE_ROLE_KEY, and (optional) NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   TRIGGER ('manual' | 'schedule'), GITHUB_RUN_ID.
 *
 * Progress is streamed into a public.update_runs row (phase, counts, appended
 * log) so the /admin status panel reflects this run live — manual or scheduled.
 *
 * Run locally:  npx tsx --env-file=.env.local scripts/update.ts
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnabledAccounts, runUpdateForAccounts } from '@/lib/run-update'
import { refreshMetrics, countRefreshable, CHUNK_SIZE as REFRESH_CHUNK } from '@/lib/refresh-metrics'
import { classifyUnclassified, countUnclassified } from '@/lib/run-update'

// ── env ──────────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = requireEnv('NEXT_SUPABASE_SERVICE_ROLE_KEY')
requireEnv('APIFY_TOKEN')
requireEnv('OPENAI_API_KEY')

const TRIGGER: 'manual' | 'schedule' =
  process.env.TRIGGER === 'manual' ? 'manual' : 'schedule'
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID ?? null

// Classify concurrency: classifyUnclassified fires its whole batch in parallel,
// so this doubles as the concurrency cap. Kept at 8 for the OpenAI 200k TPM
// ceiling with base64 images (see the backfill-session gotchas).
const CLASSIFY_BATCH = 8

// The service-role client the whole pipeline writes through — bypasses RLS on
// instagram_posts / instagram_accounts / update_runs.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── update_runs status row ─────────────────────────────────────────────────────

let runId: number | null = null
const logLines: string[] = []

function log(line: string) {
  const stamped = `${new Date().toISOString().slice(11, 19)}  ${line}`
  logLines.push(stamped)
  console.log(stamped)
}

/** Persist the current phase/counts/log to the update_runs row (best-effort). */
async function persist(fields: Record<string, unknown>) {
  if (runId == null) return
  const { error } = await supabase
    .from('update_runs')
    .update({ ...fields, log: logLines.join('\n') })
    .eq('id', runId)
  if (error) console.error(`  (update_runs write failed: ${error.message})`)
}

async function createRun(): Promise<void> {
  const { data, error } = await supabase
    .from('update_runs')
    .insert({
      trigger: TRIGGER,
      status: 'running',
      phase: 'scrape',
      github_run_id: GITHUB_RUN_ID,
    })
    .select('id')
    .single()
  if (error) {
    // Status tracking is best-effort — a failed insert must not stop the pipeline.
    console.error(`  (could not create update_runs row: ${error.message})`)
    return
  }
  runId = data.id as number
}

// ── retry helper (OpenAI 429 / transient) ──────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── phases ─────────────────────────────────────────────────────────────────────

async function phaseScrape(): Promise<number> {
  log('Phase 1 — Scrape (live scrape-enabled accounts)')
  await persist({ phase: 'scrape' })

  const accounts = await loadEnabledAccounts(supabase)
  log(`  ${accounts.length} scrape-enabled accounts`)

  let postsAdded = 0
  let accountsProcessed = 0
  const result = await runUpdateForAccounts(supabase, accounts, {
    classify: false, // classification is Phase 3 — keep vision work off the scrape
    onBatch: async ({ batch, totalBatches, accountsProcessed: a, postsAdded: p }) => {
      accountsProcessed += a
      postsAdded += p
      log(`  Batch ${batch}/${totalBatches}: ${a} accounts, ${p} posts`)
      await persist({ accounts_processed: accountsProcessed, posts_added: postsAdded })
    },
  })

  if (result.errors?.length) {
    log(`  ${result.errors.length} account note(s) — first: ${result.errors[0]}`)
  }
  log(`  Scrape done: ${result.accountsProcessed} accounts, ${result.postsAdded} posts`)
  await persist({ accounts_processed: result.accountsProcessed, posts_added: result.postsAdded })
  return result.postsAdded
}

async function phaseRefresh(): Promise<void> {
  log('Phase 2 — Refresh metrics (last 14 days)')
  await persist({ phase: 'refresh' })

  const total = await countRefreshable(supabase)
  if (total === 0) {
    log('  Nothing to refresh (0 posts in window)')
    return
  }

  let updated = 0
  for (let offset = 0; offset < total; offset += REFRESH_CHUNK) {
    const r = await refreshMetrics(supabase, { offset, limit: REFRESH_CHUNK })
    updated += r.updated
    log(`  Metrics ${Math.min(offset + r.processed, total)}/${total} (updated ${r.updated})`)
    if (r.errors?.length) log(`    ${r.errors.length} note(s) — first: ${r.errors[0]}`)
  }
  log(`  Refresh done: ${updated} posts updated`)
}

async function phaseClassify(): Promise<number> {
  log('Phase 3 — Classify new posts (gpt-4o-mini)')
  await persist({ phase: 'classify' })

  let totalClassified = 0
  // Bounded loop: classifyUnclassified takes CLASSIFY_BATCH posts, classifies them
  // concurrently, and returns `remaining`. Loop until nothing remains. If a batch
  // makes zero progress while posts remain (typically OpenAI 429 rate-limiting),
  // back off and retry a few times before giving up so a rate spike doesn't strand
  // the tail.
  let stalls = 0
  for (;;) {
    const r = await classifyUnclassified(supabase, { limit: CLASSIFY_BATCH })
    if (r.processed === 0) break // nothing left to classify

    totalClassified += r.classified
    if (r.classified > 0) {
      stalls = 0
      log(`  Classified ${r.classified}/${r.processed} (${r.remaining} remaining)`)
      await persist({ posts_classified: totalClassified })
      if (r.remaining === 0) break
    } else {
      // No progress but posts remain — likely OpenAI 429. Back off and retry.
      stalls++
      if (r.errors?.length) log(`    stalled (${r.errors.length} error(s)) — first: ${r.errors[0]}`)
      if (stalls > 5) {
        log(`  Giving up after ${stalls} stalled batches; ${r.remaining} left unclassified`)
        break
      }
      const backoff = Math.min(30_000, 2_000 * 2 ** (stalls - 1))
      log(`  No progress — backing off ${(backoff / 1000).toFixed(0)}s (attempt ${stalls}/5)`)
      await sleep(backoff)
    }
  }

  const remaining = await countUnclassified(supabase)
  log(`  Classify done: ${totalClassified} classified, ${remaining} still unclassified`)
  return totalClassified
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  log(`Update run starting (trigger=${TRIGGER}, github_run_id=${GITHUB_RUN_ID ?? 'n/a'})`)
  await createRun()

  try {
    const postsAdded = await phaseScrape()
    await phaseRefresh()
    const classified = await phaseClassify()

    log(`Update complete ✓ (${postsAdded} posts added, ${classified} classified)`)
    await persist({
      status: 'success',
      phase: 'done',
      finished_at: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`FAILED: ${msg}`)
    await persist({
      status: 'failed',
      error: msg,
      finished_at: new Date().toISOString(),
    })
    process.exit(1)
  }
}

main().catch(async (err) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(msg)
  await persist({ status: 'failed', error: msg, finished_at: new Date().toISOString() })
  process.exit(1)
})
