/**
 * Run: npx tsx --env-file=.env.local scripts/scrape-missing.ts
 *
 * One-off backfill for accounts present in the RD brief CSV but missing from
 * the database. Mirrors scrape-rapidapi.ts (RapidAPI → vision-assisted pillar
 * classification → Supabase upsert), scoped to the 8 missing usernames.
 */

import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

// CSV handles were dead (renamed by the dealers). These are the corrected,
// verified-live handles, matched by full_name + post/follower count.
// NOTE: 'hondapasarminggu' (Honda Mugen Pasar Minggu) has no confirmed live
// handle yet — left out pending manual lookup.
const ACCOUNTS = [
  'honda_sumber_cilacap_pwt', // Honda Sumber Purwokerto — repointed to live handle
]

const DATE_FROM = new Date('2026-05-18T00:00:00Z')
const DATE_TO = new Date('2026-06-13T23:59:59Z')

const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'
const RAPIDAPI_HEADERS = {
  'Content-Type': 'application/json',
  'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
}

function getPostType(mediaType: number, productType: string): string {
  if (mediaType === 8) return 'carousel'
  if (mediaType === 2) return productType === 'clips' ? 'reel' : 'video'
  return 'image'
}

async function fetchUserInfo(username: string) {
  const res = await fetch(`${BASE_URL}/userinfo/?username_or_id=${username}`, {
    headers: RAPIDAPI_HEADERS,
  })
  const json = await res.json()
  return json.data
}

async function fetchUserPosts(username: string, count = 50) {
  const res = await fetch(
    `${BASE_URL}/userposts/?username_or_id=${username}&count=${count}`,
    { headers: RAPIDAPI_HEADERS },
  )
  const json = await res.json()
  return json.data?.items ?? []
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('Backfilling', ACCOUNTS.length, 'missing account(s)')
  console.log('Date range:', DATE_FROM.toDateString(), '→', DATE_TO.toDateString())
  console.log('─'.repeat(60))

  const summary: { username: string; followers?: number; posts: number; error?: string }[] = []

  for (const username of ACCOUNTS) {
    console.log(`\n[${username}] Fetching profile...`)

    try {
      const profile = await fetchUserInfo(username)
      if (!profile || !profile.username) {
        console.error('  No profile returned — username may be wrong/private/banned')
        summary.push({ username, posts: 0, error: 'no profile returned' })
        continue
      }
      console.log(`  Name:      ${profile.full_name}`)
      console.log(`  Followers: ${profile.follower_count}`)

      const { error: accErr } = await supabase.from('instagram_accounts').upsert(
        {
          username,
          full_name: profile.full_name || username,
          profile_picture_url: profile.profile_pic_url || null,
          followers_count: profile.follower_count || 0,
          following_count: profile.following_count || 0,
          biography: profile.biography || '',
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'username' },
      )
      if (accErr) console.error('  Account upsert error:', accErr.message)
      else console.log('  Account upserted ✓')

      console.log(`[${username}] Fetching posts...`)
      const allPosts = await fetchUserPosts(username, 50)
      const posts = allPosts.filter((p: any) => {
        if (!p.taken_at) return false
        const d = new Date(p.taken_at * 1000)
        return d >= DATE_FROM && d <= DATE_TO
      })
      console.log(`  Fetched: ${allPosts.length} total, ${posts.length} in date range`)

      let upserted = 0
      for (const p of posts) {
        const caption: string = p.caption?.text || ''
        const thumbnailUrl: string | null = p.thumbnail_url || null
        const postType = getPostType(p.media_type, p.product_type)
        const postDate = new Date(p.taken_at * 1000).toISOString()

        const { pillar, source } = await classifyPillar(caption, thumbnailUrl)
        console.log(`  → ${p.code}  ${postDate.slice(0, 10)}  ${postType.padEnd(9)}  [${pillar}]  (${source})`)

        const { error: postErr } = await supabase.from('instagram_posts').upsert(
          {
            account_username: username,
            post_id: String(p.id),
            post_url: `https://www.instagram.com/p/${p.code}/`,
            thumbnail_url: thumbnailUrl,
            caption,
            likes_count: p.like_count || 0,
            comments_count: p.comment_count || 0,
            views_count: p.play_count || p.view_count || 0,
            post_date: postDate,
            post_type: postType,
            pillar,
            classification_source: source,
          },
          { onConflict: 'post_id' },
        )
        if (postErr) console.error('    Upsert error:', postErr.message)
        else upserted++
      }

      console.log(`  Stored: ${upserted} / ${posts.length} posts ✓`)
      summary.push({ username, followers: profile.follower_count, posts: upserted })
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`)
      summary.push({ username, posts: 0, error: err.message })
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log('SUMMARY')
  for (const s of summary) {
    const status = s.error ? `ERROR: ${s.error}` : `${s.posts} posts (${s.followers} followers)`
    console.log(`  ${s.username.padEnd(34)} ${status}`)
  }
  console.log('Done!')
}

main().catch(console.error)
