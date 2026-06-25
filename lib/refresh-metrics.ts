import { createClient } from '@supabase/supabase-js'
import { makeApify, runActor, REFRESH_ACTOR, type ApifyItem } from '@/lib/apify'

export function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type Supabase = ReturnType<typeof makeSupabase>

/**
 * Posts refreshed per cron invocation. apify/instagram-api-scraper takes a batch
 * of post URLs in ONE actor run (~100-200 posts/sec), so a chunk maps to a single
 * actor call rather than N HTTP requests. 150 keeps each run well under the 300s
 * function limit with ample margin. The cron advances an offset cursor each run
 * (see refresh_state and the cron route) so the whole window is covered across
 * several runs.
 */
export const CHUNK_SIZE = 150

/** Posts within this many days of now are the refresh target; older posts have
 * effectively frozen metrics and are skipped to keep cost down. */
export const REFRESH_WINDOW_DAYS = 14

type PostRow = { post_id: string; post_url: string | null }

/**
 * Refresh metrics for a batch of stored posts via one actor run. Updates ONLY
 * likes/comments/views and the thumbnail — never pillar, classification_source,
 * caption, or any other column, so existing classification is preserved.
 */
async function refreshBatch(
  rows: PostRow[],
  supabase: Supabase,
): Promise<{ updated: number; errors: string[] }> {
  const withUrl = rows.filter((r) => r.post_url)
  if (withUrl.length === 0) return { updated: 0, errors: [] }

  const client = makeApify()
  const items = await runActor(client, REFRESH_ACTOR, {
    directUrls: withUrl.map((r) => r.post_url as string),
    resultsType: 'posts',
    resultsLimit: 1,
    addParentData: false,
  })

  // Index fetched results by the Instagram media id, which equals our post_id.
  const byId = new Map<string, ApifyItem>()
  for (const it of items) {
    const id = it.id !== undefined ? String(it.id) : ''
    if (id) byId.set(id, it)
  }

  let updated = 0
  const errors: string[] = []
  await Promise.all(
    withUrl.map(async (row) => {
      const it = byId.get(row.post_id)
      if (!it) {
        errors.push(`${row.post_id}: not returned`)
        return
      }
      const patch: Record<string, number | string> = {}
      if (typeof it.likesCount === 'number') patch.likes_count = it.likesCount
      if (typeof it.commentsCount === 'number') patch.comments_count = it.commentsCount
      const views = (it.videoViewCount as number) ?? (it.videoPlayCount as number)
      if (typeof views === 'number') patch.views_count = views
      if (typeof it.displayUrl === 'string' && it.displayUrl) {
        patch.thumbnail_url = it.displayUrl
      }
      if (Object.keys(patch).length === 0) {
        errors.push(`${row.post_id}: no metrics in payload`)
        return
      }
      const { error } = await supabase
        .from('instagram_posts')
        .update(patch)
        .eq('post_id', row.post_id)
      if (error) errors.push(`${row.post_id}: ${error.message}`)
      else updated++
    }),
  )

  return { updated, errors }
}

export interface RefreshResult {
  processed: number
  updated: number
  failed: number
  errors?: string[]
}

/**
 * Refresh metrics for the slice of recent stored posts at [offset, offset +
 * limit) in post_id order. "Recent" = posted within REFRESH_WINDOW_DAYS; older
 * posts are excluded entirely so the cursor rotates only over posts worth
 * refreshing. The whole batch goes through the actor in one run.
 */
export async function refreshMetrics(
  supabase: Supabase,
  options: { offset?: number; limit?: number } = {},
): Promise<RefreshResult> {
  const offset = options.offset ?? 0
  const limit = options.limit ?? CHUNK_SIZE

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - REFRESH_WINDOW_DAYS)

  const { data: rows, error } = await supabase
    .from('instagram_posts')
    .select('post_id, post_url')
    .gte('post_date', cutoff.toISOString())
    .order('post_id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`Failed to read posts: ${error.message}`)

  const posts = (rows ?? []) as PostRow[]
  if (posts.length === 0) {
    return { processed: 0, updated: 0, failed: 0 }
  }

  const { updated, errors } = await refreshBatch(posts, supabase)

  return {
    processed: posts.length,
    updated,
    failed: posts.length - updated,
    ...(errors.length > 0 && { errors }),
  }
}

/** Count of posts inside the refresh window — drives cursor wrapping. */
export async function countRefreshable(supabase: Supabase): Promise<number> {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - REFRESH_WINDOW_DAYS)
  const { count } = await supabase
    .from('instagram_posts')
    .select('post_id', { count: 'exact', head: true })
    .gte('post_date', cutoff.toISOString())
  return count ?? 0
}
