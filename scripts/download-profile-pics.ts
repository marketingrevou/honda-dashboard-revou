/**
 * Download Instagram profile pictures into Supabase Storage so the dashboard
 * no longer depends on Instagram's signed CDN URLs (which expire after ~7 days).
 *
 * Run: npx tsx --env-file=.env.local scripts/download-profile-pics.ts
 *
 * For every account:
 *   1. Try to download the current profile_picture_url.
 *   2. If that URL is missing/expired/fails, re-fetch a fresh CDN URL from
 *      RapidAPI /userinfo/ and download that instead.
 *   3. Upload the image to the public `profile-pics` bucket as `<username>.jpg`
 *      and point profile_picture_url at the stable Storage public URL.
 *
 * Idempotent: re-running re-downloads and overwrites (upsert), so it doubles as
 * the periodic "refresh" job — the stored URL itself never expires.
 */

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'profile-pics'
const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
)

function rapidapiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
  }
}

async function fetchFreshCdnUrl(username: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/userinfo/?username_or_id=${username}`, {
    headers: rapidapiHeaders(),
  })
  const json = await res.json()
  return json.data?.profile_pic_url || null
}

/** Download an image URL into a Buffer, or null if the fetch fails/non-image. */
async function download(url: string): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return null
    return { buf, contentType }
  } catch {
    return null
  }
}

async function main() {
  const { data: accounts, error } = await supabase
    .from('instagram_accounts')
    .select('username, profile_picture_url')
    .order('username')

  if (error) {
    console.error('Failed to fetch accounts:', error.message)
    process.exit(1)
  }

  console.log(`Migrating ${accounts?.length ?? 0} profile picture(s) into Storage`)
  console.log('─'.repeat(60))

  let migrated = 0
  const failed: string[] = []

  for (const acc of accounts ?? []) {
    try {
      // Try existing URL first; fall back to a fresh CDN URL if it's gone.
      let img = acc.profile_picture_url ? await download(acc.profile_picture_url) : null
      if (!img) {
        const fresh = await fetchFreshCdnUrl(acc.username)
        if (fresh) img = await download(fresh)
      }
      if (!img) {
        console.log(`[${acc.username}] could not download image`)
        failed.push(acc.username)
        continue
      }

      const path = `${acc.username}.jpg`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, img.buf, {
          contentType: img.contentType,
          upsert: true,
          cacheControl: '31536000',
        })
      if (upErr) {
        console.error(`[${acc.username}] upload error: ${upErr.message}`)
        failed.push(acc.username)
        continue
      }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const { error: dbErr } = await supabase
        .from('instagram_accounts')
        .update({ profile_picture_url: pub.publicUrl })
        .eq('username', acc.username)
      if (dbErr) {
        console.error(`[${acc.username}] db update error: ${dbErr.message}`)
        failed.push(acc.username)
        continue
      }

      console.log(`[${acc.username}] ✓`)
      migrated++
    } catch (err: any) {
      console.error(`[${acc.username}] ERROR: ${err.message}`)
      failed.push(acc.username)
    }
  }

  console.log('─'.repeat(60))
  console.log(`Done! Migrated ${migrated}/${accounts?.length ?? 0}`)
  if (failed.length) console.log(`Failed: ${failed.join(', ')}`)
}

main().catch(console.error)
