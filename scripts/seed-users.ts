/**
 * Seed / sync dashboard login accounts.
 * Run: npx tsx --env-file=.env.local scripts/seed-users.ts
 *
 * Creates one login (default password) for:
 *   - every username in the `instagram_accounts` table (source of truth), plus
 *   - every username in the static ACCOUNTS list (lib/run-update.ts), plus
 *   - the `honda-revou` admin.
 *
 * Idempotent: existing rows are skipped, so re-running after new accounts are
 * scraped only adds the missing logins and never clobbers password resets.
 */

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { ACCOUNTS } from '../lib/run-update'

const DEFAULT_PASSWORD = 'thepowerofdreams'
const ADMIN_USERNAME = 'honda-revou'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Source of truth: every account that exists in the dashboard's data.
  const { data: igAccounts, error: igErr } = await supabase
    .from('instagram_accounts')
    .select('username')
  if (igErr) {
    console.error('Failed to read instagram_accounts:', igErr.message)
    process.exit(1)
  }
  const igUsernames = (igAccounts ?? []).map((r) => r.username as string)

  // Union of DB accounts + static list + admin.
  const usernames = Array.from(new Set([ADMIN_USERNAME, ...igUsernames, ...ACCOUNTS]))

  // Skip ones that already exist (don't overwrite resets).
  const { data: existingRows, error: fetchErr } = await supabase
    .from('dashboard_users')
    .select('username')
  if (fetchErr) {
    console.error('Failed to read existing users:', fetchErr.message)
    process.exit(1)
  }
  const existing = new Set((existingRows ?? []).map((r) => r.username))

  const toCreate = usernames.filter((u) => !existing.has(u))
  if (toCreate.length === 0) {
    console.log(`All ${usernames.length} users already exist. Nothing to do.`)
    return
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const rows = toCreate.map((username) => ({
    username,
    password_hash: passwordHash,
    is_admin: username === ADMIN_USERNAME,
    must_change_password: true,
  }))

  const { error: insertErr } = await supabase.from('dashboard_users').insert(rows)
  if (insertErr) {
    console.error('Failed to insert users:', insertErr.message)
    process.exit(1)
  }

  console.log(
    `Seeded ${toCreate.length} new users (${existing.size} already existed). ` +
      `Sources: ${igUsernames.length} from instagram_accounts, ${ACCOUNTS.length} from ACCOUNTS list.`,
  )
  console.log(`Total expected: ${usernames.length}. Default password: ${DEFAULT_PASSWORD}`)
}

main()
