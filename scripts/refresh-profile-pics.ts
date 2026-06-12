/**
 * Refresh expired CDN profile-picture URLs for accounts in Supabase.
 * Run: npx tsx --env-file=.env.local scripts/refresh-profile-pics.ts
 *
 * Instagram profile-pic CDN URLs expire (the `oe=` param is a Unix expiry).
 * For each account whose profile_picture_url is missing or already expired,
 * re-fetch a fresh URL from RapidAPI /userinfo/ and update the DB.
 */

import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'

function rapidapiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
  }
}

async function fetchUserInfo(username: string) {
  const res = await fetch(`${BASE_URL}/userinfo/?username_or_id=${username}`, {
    headers: rapidapiHeaders(),
  })
  const json = await res.json()
  return json.data
}

/** Returns the `oe=` expiry as a Date, or null if absent/unparseable. */
function cdnExpiry(url: string | null): Date | null {
  if (!url) return null
  const m = url.match(/oe=([0-9A-Fa-f]+)/)
  if (!m) return null
  const secs = parseInt(m[1], 16)
  if (!Number.isFinite(secs)) return null
  return new Date(secs * 1000)
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: accounts, error } = await supabase
    .from('instagram_accounts')
    .select('username, profile_picture_url')
    .order('username')

  if (error) {
    console.error('Failed to fetch accounts:', error.message)
    process.exit(1)
  }

  const now = Date.now()
  const stale = (accounts ?? []).filter((a) => {
    const exp = cdnExpiry(a.profile_picture_url)
    return !a.profile_picture_url || exp === null || exp.getTime() < now
  })

  console.log(`Found ${stale.length} account(s) with missing/expired profile pictures`)
  console.log('─'.repeat(60))

  let updated = 0
  for (const acc of stale) {
    try {
      const profile = await fetchUserInfo(acc.username)
      const freshUrl = profile?.profile_pic_url || null
      if (!freshUrl) {
        console.log(`[${acc.username}] No profile_pic_url returned from API`)
        continue
      }
      const { error: upErr } = await supabase
        .from('instagram_accounts')
        .update({ profile_picture_url: freshUrl })
        .eq('username', acc.username)
      if (upErr) {
        console.error(`[${acc.username}] update error: ${upErr.message}`)
        continue
      }
      console.log(`[${acc.username}] updated ✓`)
      updated++
    } catch (err: any) {
      console.error(`[${acc.username}] ERROR: ${err.message}`)
    }
  }

  console.log('─'.repeat(60))
  console.log(`Done! Updated ${updated}/${stale.length}`)
}

main().catch(console.error)
