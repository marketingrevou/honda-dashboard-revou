// Deno port of the blocking path of lib/refresh-metrics.ts — reads a slice of
// recent stored posts and refreshes ONLY likes/comments/views + thumbnail via
// one actor run. Never touches pillar/classification/caption.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { runActor, REFRESH_ACTOR, type ApifyItem } from './apify.ts'

/**
 * Posts refreshed per invocation. apify/instagram-api-scraper takes a batch of
 * post URLs in ONE actor run, so a chunk maps to a single actor call. The cron
 * advances an offset cursor each run so the whole window is covered over several.
 */
export const CHUNK_SIZE = 150

/** Posts within this many days of now are the refresh target; older posts have
 * effectively frozen metrics and are skipped. */
export const REFRESH_WINDOW_DAYS = 14

type PostRow = { post_id: string; post_url: string | null }

async function applyMetricUpdates(
  items: ApifyItem[],
  rows: PostRow[],
  supabase: SupabaseClient,
): Promise<{ updated: number; errors: string[] }> {
  const byId = new Map<string, ApifyItem>()
  for (const it of items) {
    const id = it.id !== undefined ? String(it.id) : ''
    if (id) byId.set(id, it)
  }

  let updated = 0
  const errors: string[] = []
  await Promise.all(
    rows.map(async (row) => {
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
      const { error } = await supabase.from('instagram_posts').update(patch).eq('post_id', row.post_id)
      if (error) errors.push(`${row.post_id}: ${error.message}`)
      else updated++
    }),
  )

  return { updated, errors }
}

async function refreshBatch(
  rows: PostRow[],
  supabase: SupabaseClient,
): Promise<{ updated: number; errors: string[] }> {
  const withUrl = rows.filter((r) => r.post_url)
  if (withUrl.length === 0) return { updated: 0, errors: [] }

  // Collab posts share a post_url across their per-dealer rows; the refresh actor
  // rejects duplicate directUrls, so send each URL once (applyMetricUpdates maps
  // results back by post_id and updates every matching row).
  const uniqueUrls = [...new Set(withUrl.map((r) => r.post_url as string))]
  // No explicit client → runActor fails over across APIFY_TOKEN, APIFY_TOKEN_2…
  const items = await runActor(REFRESH_ACTOR, {
    directUrls: uniqueUrls,
    resultsType: 'posts',
    resultsLimit: 1,
    addParentData: false,
  })

  return applyMetricUpdates(items, withUrl, supabase)
}

export interface RefreshResult {
  processed: number
  updated: number
  failed: number
  errors?: string[]
}

/** Refresh metrics for the slice of recent stored posts at [offset, offset+limit). */
export async function refreshMetrics(
  supabase: SupabaseClient,
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
export async function countRefreshable(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - REFRESH_WINDOW_DAYS)
  const { count } = await supabase
    .from('instagram_posts')
    .select('post_id', { count: 'exact', head: true })
    .gte('post_date', cutoff.toISOString())
  return count ?? 0
}
