/**
 * Run: npx tsx --env-file=.env.local scripts/retry-failed.ts
 *
 * Targeted retry for accounts that errored during the backfill. The original
 * failures were transient empty-profile responses that (pre-fix) aborted the
 * account before its posts were fetched. With the profile step now non-fatal,
 * re-running these recovers their posts. Idempotent (all upserts onConflict).
 *
 * Safe to delete once the gap is confirmed closed.
 */

import { makeSupabase, runUpdate, ACCOUNTS } from '@/lib/run-update'

const FAILED = [
  'hondakebonjerukofficial',
  'hondatendean0119',
  'hondastarmotortasik_official',
  'hondawiltop_usedcar',
  'hondasanggarlaut.usedcar',
  'imorasentul',
  'hondamitralentengagung',
  'hondapasarminggu',
  'honda.lppm',
  'hondasumbercilacappurwokerto',
  'honda_sumber_official',
  'hondajepara.official',
  'hondamitrajayapura',
  'hondanusantarasmd.official',
  'hondanusantarabalikpapan',
]

async function main() {
  const supabase = makeSupabase()
  console.log(`Retrying ${FAILED.length} failed account(s), one at a time`)
  console.log('─'.repeat(60))

  let recovered = 0
  const stillFailing: string[] = []

  for (const username of FAILED) {
    const offset = ACCOUNTS.indexOf(username)
    if (offset === -1) {
      console.log(`  ${username.padEnd(34)} NOT IN ACCOUNTS LIST — skipped`)
      stillFailing.push(`${username}: not in ACCOUNTS`)
      continue
    }
    const result = await runUpdate(supabase, { offset, limit: 1 })
    if (result.errors?.length) {
      console.log(`  ${username.padEnd(34)} ERROR: ${result.errors[0]}`)
      stillFailing.push(result.errors[0])
    } else {
      console.log(`  ${username.padEnd(34)} ok (${result.postsAdded} posts classified)`)
      recovered++
    }
  }

  console.log('─'.repeat(60))
  console.log(`Recovered ${recovered}/${FAILED.length}.`)
  if (stillFailing.length) {
    console.log('\nStill failing (likely dead/renamed/private handles — need manual lookup):')
    for (const e of stillFailing) console.log(`  ${e}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
