import { ApifyClient } from 'apify-client'

/**
 * Shared Apify client + actor IDs for the two scraping jobs.
 *
 * Job #1 (metric refresh) uses apify/instagram-api-scraper — it accepts
 * individual /p/ post URLs via `directUrls` and returns full metrics + thumbnail
 * keyed by the Instagram media id (which matches our post_id).
 *
 * Job #2 (new-post discovery) uses sones/instagram-posts-scraper-lowcost — it
 * accepts a `usernames` array and returns recent posts at ~$0.30/1k, including
 * caption.text, image_url, like/comment/play counts, and the post owner profile.
 *
 * Both actors run on the Apify free tier with the same APIFY_TOKEN.
 */

export const REFRESH_ACTOR = 'apify/instagram-api-scraper'
export const DISCOVERY_ACTOR = 'sones/instagram-posts-scraper-lowcost'

export function makeApify() {
  return new ApifyClient({ token: process.env.APIFY_TOKEN })
}

export type ApifyItem = Record<string, unknown>

/** Map an Apify media_type/product_type pair to our post_type label. */
export function getPostType(mediaType: number, productType: string): string {
  if (mediaType === 8) return 'carousel'
  if (mediaType === 2) return productType === 'clips' ? 'reel' : 'video'
  return 'image'
}

function isDemoRow(it: ApifyItem): boolean {
  return Object.keys(it).length === 1 && it.demo !== undefined
}

/**
 * Run an actor with the given input and return its dataset items, filtering out
 * the single `{demo: ...}` placeholder rows that gated actors emit on the free
 * plan (so a gated actor surfaces as "0 items" rather than fake data).
 *
 * This BLOCKS until the actor run finishes — fine for the cron (300s budget),
 * but on a 60s-capped plan use the async start/poll/fetch trio below instead.
 */
export async function runActor(
  client: ApifyClient,
  actorId: string,
  input: Record<string, unknown>,
): Promise<ApifyItem[]> {
  const run = await client.actor(actorId).call(input)
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  return (items as ApifyItem[]).filter((it) => !isDemoRow(it))
}

// ─── Async run lifecycle (for time-capped callers, e.g. the admin UI) ────────
// Splits runActor into three non-blocking steps so no single request waits for
// a whole actor run: start() returns a runId immediately, the caller polls
// getRunStatus() until terminal, then fetchRunItems() ingests the dataset. Used
// only by the admin routes; the cron keeps using the blocking runActor above.

export interface StartedRun {
  runId: string
  datasetId: string
}

/** Start an actor run without waiting for it. Returns ids for polling. */
export async function startActor(
  client: ApifyClient,
  actorId: string,
  input: Record<string, unknown>,
): Promise<StartedRun> {
  const run = await client.actor(actorId).start(input)
  return { runId: run.id, datasetId: run.defaultDatasetId }
}

export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ABORTING'
  | 'ABORTED'
  | 'TIMING-OUT'
  | 'TIMED-OUT'

/** Terminal statuses — polling can stop once one of these is seen. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'SUCCEEDED',
  'FAILED',
  'ABORTED',
  'TIMED-OUT',
])

/** Fetch the current status of a run (fast — a single metadata read). */
export async function getRunStatus(client: ApifyClient, runId: string): Promise<ApifyRunStatus> {
  const run = await client.run(runId).get()
  return (run?.status as ApifyRunStatus) ?? 'RUNNING'
}

/** Fetch a finished run's dataset items (same demo-row filtering as runActor). */
export async function fetchRunItems(client: ApifyClient, datasetId: string): Promise<ApifyItem[]> {
  const { items } = await client.dataset(datasetId).listItems()
  return (items as ApifyItem[]).filter((it) => !isDemoRow(it))
}
