/**
 * Refresh expired CDN profile-picture URLs for accounts in Supabase.
 * Run: npx tsx --env-file=.env.local scripts/refresh-profile-pics.ts
 *
 * Instagram profile-pic CDN URLs expire (the `oe=` param is a Unix expiry).
 * For each account whose profile_picture_url is missing or already expired,
 * re-fetch a fresh URL from RapidAPI /userinfo/, mirror the image into Supabase
 * Storage, and store the stable public URL — so it never expires again.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'
const PROFILE_PIC_BUCKET = 'profile-pics'

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

/**
 * Download a CDN profile picture and store it in Supabase Storage, returning a
 * stable public URL. Mirrors lib/run-update.ts:storeProfilePic. Falls back to
 * the CDN URL only if the download/upload fails.
 */
async function storeProfilePic(
  supabase: SupabaseClient,
  username: string,
  cdnUrl: string | null,
): Promise<string | null> {
  if (!cdnUrl) return null
  try {
    const res = await fetch(cdnUrl, { headers: { Referer: 'https://www.instagram.com/' } })
    if (!res.ok) return cdnUrl
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return cdnUrl
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return cdnUrl

    const path = `${username}.jpg`
    const { error: upErr } = await supabase.storage
      .from(PROFILE_PIC_BUCKET)
      .upload(path, buf, { contentType, upsert: true, cacheControl: '31536000' })
    if (upErr) return cdnUrl

    return supabase.storage.from(PROFILE_PIC_BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return cdnUrl
  }
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
      const freshCdnUrl = profile?.profile_pic_url || null
      if (!freshCdnUrl) {
        console.log(`[${acc.username}] No profile_pic_url returned from API`)
        continue
      }
      // Mirror into Storage so the stored URL never expires.
      const storedUrl = await storeProfilePic(supabase, acc.username, freshCdnUrl)
      const { error: upErr } = await supabase
        .from('instagram_accounts')
        .update({ profile_picture_url: storedUrl })
        .eq('username', acc.username)
      if (upErr) {
        console.error(`[${acc.username}] update error: ${upErr.message}`)
        continue
      }
      const inStorage = storedUrl?.includes('supabase') ? '✓ (stored)' : '✓ (cdn fallback)'
      console.log(`[${acc.username}] updated ${inStorage}`)
      updated++
    } catch (err: any) {
      console.error(`[${acc.username}] ERROR: ${err.message}`)
    }
  }

  console.log('─'.repeat(60))
  console.log(`Done! Updated ${updated}/${stale.length}`)
}

main().catch(console.error)
