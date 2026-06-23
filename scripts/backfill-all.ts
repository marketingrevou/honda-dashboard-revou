/**
 * Run: npx tsx --env-file=.env.local scripts/backfill-all.ts
 *
 * One-off recovery for the scrape-timeout gap. The weekly cron was being killed
 * at the 300s function limit ~18 accounts in, so every dealer after that point
 * (R1/R2/Surabaya/most of Semarang) stopped updating around Jun 12. This runs
 * the same production runUpdate() over the full ACCOUNTS list, one CHUNK_SIZE
 * slice at a time. Running locally via tsx has no serverless timeout, so it
 * covers everyone in a single pass.
 *
 * Idempotent: every post/account upsert is onConflict, and existing pillar
 * classifications are preserved (only unclassified posts get re-classified).
 */

import { makeSupabase, runUpdate, CHUNK_SIZE, chunkCount } from '@/lib/run-update'

async function main() {
  const supabase = makeSupabase()
  const total = chunkCount()
  console.log(`Backfilling all accounts in ${total} chunks of ${CHUNK_SIZE}`)
  console.log('─'.repeat(60))

  let grandTotalPosts = 0
  const allErrors: string[] = []

  for (let chunk = 0; chunk < total; chunk++) {
    const offset = chunk * CHUNK_SIZE
    const t0 = Date.now()
    const result = await runUpdate(supabase, { offset, limit: CHUNK_SIZE })
    const secs = ((Date.now() - t0) / 1000).toFixed(0)

    grandTotalPosts += result.postsAdded
    if (result.errors) allErrors.push(...result.errors)

    console.log(
      `chunk ${chunk + 1}/${total} (offset ${offset}): ` +
        `${result.accountsProcessed} accounts, ${result.postsAdded} posts classified, ${secs}s` +
        (result.errors ? `  [${result.errors.length} errors]` : ''),
    )
  }

  console.log('─'.repeat(60))
  console.log(`Done. ${grandTotalPosts} posts classified across all chunks.`)
  if (allErrors.length) {
    console.log(`\n${allErrors.length} account error(s):`)
    for (const e of allErrors) console.log(`  ${e}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
