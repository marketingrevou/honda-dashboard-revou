/**
 * Run a full data refresh over ALL accounts (no chunk cursor).
 * Local-only: no 300s function limit applies here.
 *
 *   npx tsx --env-file=.env.local scripts/run-update-all.ts
 */
import { runUpdate, makeSupabase, ACCOUNTS } from '@/lib/run-update'

async function main() {
  const supabase = makeSupabase()
  console.log(`Refreshing ${ACCOUNTS.length} accounts...`)
  const t0 = Date.now()
  const result = await runUpdate(supabase)
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\nDone in ${secs}s`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
