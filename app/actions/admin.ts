'use server'

import { revalidatePath } from 'next/cache'
import { makeAuthClient, requireAdmin } from '@/lib/auth-db'
import { VALID_PILLARS, type PillarResult } from '@/lib/pillar-config'

// ─────────────────────────────────────────────────────────────────────────────
// Admin server actions — edit Supabase data from the /admin page.
//
// Every action calls requireAdmin() FIRST: server actions are reachable via
// direct POST regardless of the UI or proxy, so authorization must be enforced
// here, not just in the page. All writes use the service-role client
// (makeAuthClient) since these tables have RLS with no public write policies.
// ─────────────────────────────────────────────────────────────────────────────

export type ActionResult = { ok: true } | { ok: false; error: string }

// ─────────────────────────────────────────────────────────────────────────────
// Run notifications (Resend).
//
// After a manual pipeline run finishes, the client asks us to email a summary to
// the ops address. The RESEND_API_KEY stays server-side (this is a server
// action), and we call Resend's REST API directly with fetch — no SDK needed,
// matching how the Edge Functions are already invoked. Notifications are
// best-effort: a failed send never turns a successful run into an error, so this
// action swallows send failures into an { ok:false } the client can log-and-move-on.
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFY_TO = 'andrew@revou.co'
// Resend's shared sandbox sender — works without verifying a custom domain.
const NOTIFY_FROM = 'Honda Dashboard <onboarding@resend.dev>'

export type RunNotification = {
  job: string // e.g. "Update" or "Reclassify Negatives"
  status: 'success' | 'failure'
  summary: string // human-readable outcome / error, shown in the email body
  logLines?: string[] // full run log, appended verbatim for context
}

/**
 * Email a run summary to the ops address via Resend. Best-effort: returns
 * { ok:false } (never throws) so a failed notification can't mask a successful
 * pipeline run in the UI.
 */
export async function sendRunNotification(n: RunNotification): Promise<ActionResult> {
  try {
    await requireAdmin()
    const key = process.env.RESEND_API_KEY
    if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' }

    const ok = n.status === 'success'
    const subject = `[Honda Dashboard] ${n.job} ${ok ? 'succeeded ✓' : 'failed ✕'}`
    const log = (n.logLines ?? []).join('\n')
    const html = [
      `<h2 style="margin:0 0 8px;font-family:sans-serif">${n.job} ${ok ? 'succeeded ✓' : 'failed ✕'}</h2>`,
      `<p style="font-family:sans-serif;color:${ok ? '#166534' : '#991B1B'}">${escapeHtml(n.summary)}</p>`,
      log
        ? `<pre style="background:#111827;color:#E5E7EB;padding:12px 14px;border-radius:6px;font-size:12px;overflow:auto">${escapeHtml(log)}</pre>`
        : '',
    ].join('')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ from: NOTIFY_FROM, to: NOTIFY_TO, subject, html }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      return { ok: false, error: body.message ?? `${res.status} ${res.statusText}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

/** Minimal HTML-escape for user/log-derived text embedded in the email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function triggers.
//
// The scrape + metric-refresh pipeline runs on the Supabase Edge Functions
// `scrape` and `refresh-metrics` (scheduled weekly by pg_cron). These actions
// let an admin fire an on-demand full run from the dashboard. They call each
// function with explicit ?chunk=/?offset= OVERRIDES so the manual run never
// disturbs the weekly cron's cursor rotation (matching the override path in the
// Edge Functions themselves).
//
// The CRON_SECRET bearer stays server-side — these are server actions, so the
// secret is never shipped to the browser (why this is an action, not a
// client-side fetch). Each function call blocks ~90-100s, so the actions run
// chunks sequentially and the UI awaits one result per chunk.
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_CHUNK_SIZE = 150 // matches CHUNK_SIZE in lib/refresh-metrics.ts

// Fallback used only if the scrape function's response omits totalChunks. The
// real chunk count is dynamic (ceil(enabled accounts / 40)) and comes back in
// the response, so add/remove in the admin page changes it automatically.
const SCRAPE_CHUNKS_FALLBACK = 4

function edgeFunctionBase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  return `${url}/functions/v1`
}

/** POST one Edge Function invocation with the CRON_SECRET bearer. */
async function invokeEdgeFunction(
  fn: 'scrape' | 'refresh-metrics',
  query: string,
): Promise<Record<string, unknown>> {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET is not set')

  const res = await fetch(`${edgeFunctionBase()}/${fn}${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: '{}',
    // Each chunk blocks on an Apify run (~90-100s). Give generous headroom.
    signal: AbortSignal.timeout(290_000),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = (body.error as string) ?? `${res.status} ${res.statusText}`
    throw new Error(msg)
  }
  return body
}

// A full run is 4 scrape chunks + ~6 refresh chunks, each blocking ~90-100s on
// an Apify run — ~15 min total, far past any single function budget. So each
// action call does ONE chunk and the client (UpdateRunner) loops, awaiting one
// result per chunk. This is the same client-orchestrated pattern the old
// Vercel-route runner used, just pointed at the Edge Functions.

export type ScrapeChunkResult =
  | {
      ok: true
      chunk: number
      totalChunks: number
      accountsProcessed: number
      postsAdded: number
      done: boolean
      errors?: string[]
    }
  | { ok: false; error: string }

export type RefreshChunkResult =
  | {
      ok: true
      offset: number
      total: number
      processed: number
      updated: number
      nextOffset: number
      done: boolean
      errors?: string[]
    }
  | { ok: false; error: string }

/**
 * Scrape ONE account chunk on Supabase via the `scrape` Edge Function (upsert +
 * classify). `?chunk=` override keeps the weekly cron cursor untouched. Returns
 * `done` when this was the last chunk so the client can stop looping.
 */
export async function scrapeChunk(chunk: number): Promise<ScrapeChunkResult> {
  try {
    await requireAdmin()
    const c = Math.max(0, chunk)
    const r = await invokeEdgeFunction('scrape', `?chunk=${c}`)
    // The function returns the live chunk count (ceil(enabled accounts / 40)),
    // so the loop covers exactly the accounts that exist right now.
    const totalChunks = (r.totalChunks as number) ?? SCRAPE_CHUNKS_FALLBACK
    const done = c >= totalChunks - 1
    if (done) {
      revalidatePath('/dashboard')
      revalidatePath('/admin')
    }
    return {
      ok: true,
      chunk: (r.chunk as number) ?? c,
      totalChunks,
      accountsProcessed: (r.accountsProcessed as number) ?? 0,
      postsAdded: (r.postsAdded as number) ?? 0,
      done,
      errors: r.errors as string[] | undefined,
    }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

/**
 * Refresh ONE metric chunk on Supabase via the `refresh-metrics` Edge Function.
 * `?offset=` override keeps the weekly cron cursor untouched. The client passes
 * the returned `nextOffset` back in until `done`.
 */
export async function refreshChunk(offset: number): Promise<RefreshChunkResult> {
  try {
    await requireAdmin()
    const o = Math.max(0, offset)
    const r = await invokeEdgeFunction('refresh-metrics', `?offset=${o}`)
    const total = (r.total as number) ?? 0
    const nextOffset = o + REFRESH_CHUNK_SIZE
    const done = total === 0 || nextOffset >= total
    if (done) {
      revalidatePath('/dashboard')
      revalidatePath('/admin')
    }
    return {
      ok: true,
      offset: o,
      total,
      processed: (r.processed as number) ?? 0,
      updated: (r.updated as number) ?? 0,
      nextOffset,
      done,
      errors: r.errors as string[] | undefined,
    }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

function isValidPillar(value: string): value is PillarResult {
  return (VALID_PILLARS as readonly string[]).includes(value)
}

/**
 * Update a pillar's description in `pillar_config`. Fed into the AI prompt, so
 * this changes classification behaviour for NEW classifications. Descriptions
 * are memoised per process (see lib/pillar-config.ts), so a running server
 * picks up the change on its next cold start; re-applying to existing posts
 * needs a reclassify pass.
 */
export async function updatePillarDescription(
  pillar: string,
  description: string,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!isValidPillar(pillar)) return { ok: false, error: `Unknown pillar: ${pillar}` }
    if (!description.trim()) return { ok: false, error: 'Description cannot be empty.' }

    const supabase = makeAuthClient()
    const { error } = await supabase
      .from('pillar_config')
      .upsert({ pillar, description }, { onConflict: 'pillar' })
    if (error) return { ok: false, error: error.message }

    revalidatePath('/admin')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

/** Manually override a single post's pillar classification. */
export async function updatePostPillar(
  postId: string,
  pillar: string,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!isValidPillar(pillar)) return { ok: false, error: `Unknown pillar: ${pillar}` }

    const supabase = makeAuthClient()
    const { error } = await supabase
      .from('instagram_posts')
      .update({ pillar, classification_source: 'manual' })
      .eq('post_id', postId)
    if (error) return { ok: false, error: error.message }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

export interface PostSearchRow {
  post_id: string
  account_username: string
  caption: string | null
  thumbnail_url: string | null
  pillar: string | null
  post_date: string | null
}

/**
 * Search posts by account username or caption for the post-pillar editor.
 * Read-only; still admin-gated so the endpoint can't be used to enumerate data.
 */
export async function searchPosts(query: string): Promise<PostSearchRow[]> {
  await requireAdmin()
  const q = query.trim()
  if (!q) return []

  const supabase = makeAuthClient()
  // Match either the handle or the caption. `or` with ilike gives a simple
  // contains-search; escape %/, characters PostgREST treats specially.
  const safe = q.replace(/[%,()]/g, ' ')
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('post_id, account_username, caption, thumbnail_url, pillar, post_date')
    .or(`account_username.ilike.%${safe}%,caption.ilike.%${safe}%`)
    .order('post_date', { ascending: false })
    .limit(25)
  if (error) throw new Error(error.message)
  return (data ?? []) as PostSearchRow[]
}

/** Update editable dealer labels on an account. */
export async function updateAccount(
  username: string,
  fields: { dealer_name: string | null; main_dealer: string | null },
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const supabase = makeAuthClient()
    const { error } = await supabase
      .from('instagram_accounts')
      .update({
        dealer_name: fields.dealer_name?.trim() || null,
        main_dealer: fields.main_dealer?.trim() || null,
      })
      .eq('username', username)
    if (error) return { ok: false, error: error.message }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

/**
 * Normalise whatever an admin pastes into a bare IG handle: strip a leading @,
 * a full profile URL, query strings, and surrounding whitespace; lowercase it.
 * Returns '' if nothing usable remains.
 */
function normaliseUsername(raw: string): string {
  let s = raw.trim()
  // Pull the handle out of a profile URL if one was pasted.
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i)
  if (urlMatch) s = urlMatch[1]
  s = s.replace(/^@/, '').trim().toLowerCase()
  // IG handles: letters, digits, period, underscore.
  return /^[a-z0-9._]+$/.test(s) ? s : ''
}

/**
 * Add a new dealer to the scrape list. Inserts an enabled row into
 * instagram_accounts; the scraper reads its list from this table (ordered by
 * username), so the account is picked up on the next scrape. The username is the
 * only required field — labels can be edited later, and full_name/thumbnail get
 * filled in by the scrape.
 */
export async function addAccount(
  rawUsername: string,
  fields: { dealer_name?: string | null; main_dealer?: string | null } = {},
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const username = normaliseUsername(rawUsername)
    if (!username) {
      return { ok: false, error: 'Enter a valid Instagram username (letters, numbers, . and _).' }
    }

    const supabase = makeAuthClient()

    // Friendly duplicate check before insert (the unique constraint would also
    // catch it, but this gives a clearer message).
    const { data: existing } = await supabase
      .from('instagram_accounts')
      .select('username')
      .eq('username', username)
      .maybeSingle()
    if (existing) return { ok: false, error: `@${username} is already in the list.` }

    const { error } = await supabase.from('instagram_accounts').insert({
      username,
      full_name: username, // placeholder until the first scrape fills it in
      dealer_name: fields.dealer_name?.trim() || null,
      main_dealer: fields.main_dealer?.trim() || null,
      scrape_enabled: true,
    })
    if (error) return { ok: false, error: error.message }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

/**
 * Hard-delete a dealer: removes the instagram_accounts row AND all its
 * instagram_posts (the FK is ON DELETE CASCADE). Permanent — the dealer's data
 * leaves the dashboard entirely and it stops being scraped.
 */
export async function deleteAccount(username: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!username?.trim()) return { ok: false, error: 'No account specified.' }

    const supabase = makeAuthClient()
    const { error } = await supabase
      .from('instagram_accounts')
      .delete()
      .eq('username', username)
    if (error) return { ok: false, error: error.message }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}
