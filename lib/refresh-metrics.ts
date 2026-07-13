import { createClient } from '@supabase/supabase-js'
import {
  makeApify,
  runActor,
  startActor,
  getRunStatus,
  fetchRunItems,
  REFRESH_ACTOR,
  TERMINAL_STATUSES,
  type ApifyItem,
  type ApifyRunStatus,
} from '@/lib/apify'

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

  // A collab post has one row per dealer, all sharing the same post_url, so a
  // slice can contain that URL more than once — and the refresh actor rejects
  // `directUrls` with duplicates. Send each URL once; applyMetricUpdates maps the
  // result back by post_id and updates every matching row (all collab copies).
  const uniqueUrls = [...new Set(withUrl.map((r) => r.post_url as string))]

  // No explicit client → runActor fails over across APIFY_TOKEN, APIFY_TOKEN_2…
  // on a monthly-hard-limit error.
  const items = await runActor(REFRESH_ACTOR, {
    directUrls: uniqueUrls,
    resultsType: 'posts',
    resultsLimit: 1,
    addParentData: false,
  })

  return applyMetricUpdates(items, withUrl, supabase)
}

/**
 * Apply the metrics from fetched Apify items back onto the matching post rows.
 * Shared by the blocking cron path (refreshBatch) and the async admin path
 * (ingestRefresh), so metric mapping never diverges. Updates ONLY
 * likes/comments/views + thumbnail — never pillar/classification/caption.
 */
async function applyMetricUpdates(
  items: ApifyItem[],
  rows: PostRow[],
  supabase: Supabase,
): Promise<{ updated: number; errors: string[] }> {
  // Index fetched results by the Instagram media id, which equals our post_id.
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

// ─── Async refresh (Phase 4, for time-capped callers) ────────────────────────
// Splits refreshMetrics into start + ingest so no single request waits for the
// Apify run — required on the 60s Hobby plan. startRefresh reads the slice and
// kicks off the actor; the caller polls the run; ingestRefresh applies metrics.
// The cron keeps using the blocking refreshMetrics above.

/** Read the [offset, offset+limit) slice of refreshable posts in post_id order. */
async function readRefreshSlice(
  supabase: Supabase,
  offset: number,
  limit: number,
): Promise<PostRow[]> {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - REFRESH_WINDOW_DAYS)
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('post_id, post_url')
    .gte('post_date', cutoff.toISOString())
    .order('post_id', { ascending: true })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`Failed to read posts: ${error.message}`)
  return (data ?? []) as PostRow[]
}

/**
 * Start the refresh actor for one slice without waiting. Returns the run ids
 * plus the exact rows so ingest can map results back by post_id. `rows` is
 * serialised through the client, so keep it to {post_id, post_url}.
 */
export async function startRefresh(
  supabase: Supabase,
  options: { offset?: number; limit?: number } = {},
): Promise<{ runId: string | null; datasetId: string | null; rows: PostRow[] }> {
  const offset = options.offset ?? 0
  const limit = options.limit ?? CHUNK_SIZE
  const rows = await readRefreshSlice(supabase, offset, limit)
  const withUrl = rows.filter((r) => r.post_url)
  if (withUrl.length === 0) {
    // Nothing to fetch in this slice — signal "no run" so the caller skips
    // polling and treats it as immediately ingested (0 updates).
    return { runId: null, datasetId: null, rows }
  }

  // Dedup URLs — collab posts share a post_url across their per-dealer rows, and
  // the actor rejects duplicate directUrls (ingest still maps back by post_id).
  const uniqueUrls = [...new Set(withUrl.map((r) => r.post_url as string))]
  const client = makeApify()
  const { runId, datasetId } = await startActor(client, REFRESH_ACTOR, {
    directUrls: uniqueUrls,
    resultsType: 'posts',
    resultsLimit: 1,
    addParentData: false,
  })
  return { runId, datasetId, rows }
}

/** Poll a refresh run's status (thin wrapper so routes don't import the client). */
export async function refreshRunStatus(runId: string): Promise<ApifyRunStatus> {
  return getRunStatus(makeApify(), runId)
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

/** Ingest a finished refresh run: fetch items and apply metric updates. */
export async function ingestRefresh(
  supabase: Supabase,
  datasetId: string,
  rows: PostRow[],
): Promise<RefreshResult> {
  const withUrl = rows.filter((r) => r.post_url)
  if (withUrl.length === 0) {
    return { processed: rows.length, updated: 0, failed: 0 }
  }
  const items = await fetchRunItems(makeApify(), datasetId)
  const { updated, errors } = await applyMetricUpdates(items, withUrl, supabase)
  return {
    processed: rows.length,
    updated,
    failed: rows.length - updated,
    ...(errors.length > 0 && { errors }),
  }
}
