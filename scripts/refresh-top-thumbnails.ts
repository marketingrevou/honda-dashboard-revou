/**
 * Refresh expired CDN thumbnail URLs ONLY for posts that can appear in the
 * "Top 10 Post" section across every filter combination (All + each pillar,
 * sorted by likes / comments / views).
 *
 * Run: npx tsx --env-file=.env.local scripts/refresh-top-thumbnails.ts
 *
 * Strategy:
 *  1. Compute candidate post_ids in the DB (top 10 by each metric, overall and
 *     per-pillar) for the dashboard date window.
 *  2. For each account owning a candidate post, fetch its 50 most recent posts
 *     from RapidAPI to get fresh signed thumbnail_url values.
 *  3. Update thumbnail_url only for the candidate posts that we found fresh
 *     URLs for.
 */

import { createClient } from '@supabase/supabase-js'

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )
}
type SupabaseLike = ReturnType<typeof makeClient>

const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'
const MIN_DATE = '2026-05-18'

function rapidapiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchUserPosts(username: string, count = 50) {
  // Retry on empty responses — RapidAPI throttles rapid sequential calls and
  // returns an empty payload rather than a 429.
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(
      `${BASE_URL}/userposts/?username_or_id=${username}&count=${count}`,
      { headers: rapidapiHeaders() },
    )
    const json = await res.json()
    const items = json.data?.items ?? []
    if (items.length) return items
    if (attempt < 4) await sleep(1500 * attempt) // backoff: 1.5s, 3s, 4.5s
  }
  return []
}

async function main() {
  const supabase = makeClient()

  // 1. Candidate posts = anything that can land in any Top 10 (All + per-pillar,
  //    by likes / comments / views).
  const { data: candidates, error: candErr } = await supabase.rpc(
    'exec_top_candidates',
    { min_date: MIN_DATE },
  )

  // Fallback: if the RPC doesn't exist, compute candidates client-side.
  let candidatePosts: { post_id: string; account_username: string }[]
  if (candErr || !candidates) {
    candidatePosts = await computeCandidatesClientSide(supabase)
  } else {
    candidatePosts = candidates
  }

  const candidateIds = new Set(candidatePosts.map((c) => c.post_id))
  const accounts = [...new Set(candidatePosts.map((c) => c.account_username))]

  console.log(
    `Found ${candidateIds.size} candidate posts across ${accounts.length} accounts`,
  )
  console.log('─'.repeat(60))

  let totalUpdated = 0
  let totalMissing = 0

  for (const username of accounts) {
    await sleep(600) // pace requests to avoid RapidAPI throttling
    try {
      const posts = await fetchUserPosts(username, 50)
      if (!posts.length) {
        console.log(`[${username}] No posts returned from API`)
        continue
      }

      const freshMap = new Map<string, string | null>()
      for (const p of posts) {
        if (p.id) freshMap.set(String(p.id), (p.thumbnail_url as string) || null)
      }

      // Candidate post_ids for this account
      const myCandidates = candidatePosts.filter(
        (c) => c.account_username === username,
      )

      let updated = 0
      let missing = 0
      for (const c of myCandidates) {
        if (freshMap.has(c.post_id)) {
          await supabase
            .from('instagram_posts')
            .update({ thumbnail_url: freshMap.get(c.post_id) })
            .eq('post_id', c.post_id)
          updated++
        } else {
          missing++
        }
      }

      console.log(
        `[${username}] ${updated} updated, ${missing} not in latest 50 posts`,
      )
      totalUpdated += updated
      totalMissing += missing
    } catch (err) {
      console.error(`[${username}] ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('─'.repeat(60))
  console.log(`Done! Updated: ${totalUpdated}, missing: ${totalMissing}`)
}

/**
 * Compute the Top-10 candidate posts purely in JS by pulling the metric
 * columns for the date window and ranking them the same way the dashboard does.
 */
async function computeCandidatesClientSide(
  supabase: SupabaseLike,
): Promise<{ post_id: string; account_username: string }[]> {
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('post_id, account_username, pillar, likes_count, comments_count, views_count')
    .gte('post_date', MIN_DATE)

  if (!posts?.length) return []

  type Row = {
    post_id: string
    account_username: string
    pillar: string | null
    likes_count: number | null
    comments_count: number | null
    views_count: number | null
  }
  const rows = posts as Row[]

  const metrics: (keyof Row)[] = ['likes_count', 'comments_count', 'views_count']
  const selected = new Map<string, string>() // post_id -> account_username

  const topN = (arr: Row[], metric: keyof Row) =>
    [...arr]
      .sort((a, b) => ((b[metric] as number) ?? 0) - ((a[metric] as number) ?? 0))
      .slice(0, 10)

  // Overall top 10 per metric
  for (const m of metrics) {
    for (const r of topN(rows, m)) selected.set(r.post_id, r.account_username)
  }

  // Per-pillar top 10 per metric
  const pillars = [...new Set(rows.map((r) => r.pillar))]
  for (const pillar of pillars) {
    const subset = rows.filter((r) => r.pillar === pillar)
    for (const m of metrics) {
      for (const r of topN(subset, m)) selected.set(r.post_id, r.account_username)
    }
  }

  return [...selected.entries()].map(([post_id, account_username]) => ({
    post_id,
    account_username,
  }))
}

main().catch(console.error)
