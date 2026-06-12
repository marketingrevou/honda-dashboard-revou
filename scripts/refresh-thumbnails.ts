/**
 * Refresh expired CDN thumbnail URLs for all posts in Supabase.
 * Run: npx tsx --env-file=.env.local scripts/refresh-thumbnails.ts
 *
 * For each account, fetches the 50 most recent posts from RapidAPI and
 * updates thumbnail_url in the DB for any matching post_id.
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

async function fetchUserPosts(username: string, count = 50) {
  const res = await fetch(
    `${BASE_URL}/userposts/?username_or_id=${username}&count=${count}`,
    { headers: rapidapiHeaders() },
  )
  const json = await res.json()
  return json.data?.items ?? []
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Get all distinct accounts that have posts in the DB
  const { data: accounts, error: accErr } = await supabase
    .from('instagram_posts')
    .select('account_username')
    .not('account_username', 'is', null)

  if (accErr) {
    console.error('Failed to fetch accounts:', accErr.message)
    process.exit(1)
  }

  const uniqueAccounts = [...new Set(accounts!.map((r) => r.account_username as string))]
  console.log(`Found ${uniqueAccounts.length} accounts with posts in DB`)
  console.log('─'.repeat(60))

  let totalUpdated = 0
  let totalSkipped = 0

  for (const username of uniqueAccounts) {
    try {
      const posts = await fetchUserPosts(username, 50)
      if (!posts.length) {
        console.log(`[${username}] No posts returned from API`)
        continue
      }

      // Build a map of post_id → thumbnail_url from the fresh API response
      const freshMap = new Map<string, string | null>()
      for (const p of posts) {
        if (p.id) {
          freshMap.set(String(p.id), (p.thumbnail_url as string) || null)
        }
      }

      // Fetch existing post_ids for this account from DB
      const { data: dbPosts } = await supabase
        .from('instagram_posts')
        .select('post_id, thumbnail_url')
        .eq('account_username', username)

      if (!dbPosts?.length) {
        console.log(`[${username}] No posts in DB`)
        continue
      }

      // Update only posts where we have a fresh URL
      let updated = 0
      let skipped = 0
      for (const dbPost of dbPosts) {
        if (freshMap.has(dbPost.post_id)) {
          const freshUrl = freshMap.get(dbPost.post_id)
          await supabase
            .from('instagram_posts')
            .update({ thumbnail_url: freshUrl })
            .eq('post_id', dbPost.post_id)
          updated++
        } else {
          skipped++
        }
      }

      console.log(
        `[${username}] ${updated} updated, ${skipped} skipped (outside 50-post window)`,
      )
      totalUpdated += updated
      totalSkipped += skipped
    } catch (err: any) {
      console.error(`[${username}] ERROR: ${err.message}`)
    }
  }

  console.log('─'.repeat(60))
  console.log(`Done! Total updated: ${totalUpdated}, skipped: ${totalSkipped}`)
}

main().catch(console.error)
