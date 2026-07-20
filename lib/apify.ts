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

// Metric-refresh actor. Switched from apify/instagram-api-scraper ($0.0023/post)
// to clappi/instagram-posts-scraper ($0.0005/post) — ~4.6× cheaper, validated at
// batch scale (90/90 posts returned, clean flat output: mediaId/likes/comments/
// views/thumbnailUrl). Input is `postUrls: string[]`; see mapClappiMetrics.
export const REFRESH_ACTOR = 'clappi/instagram-posts-scraper'
// New-post discovery. Switched from sones/instagram-posts-scraper-lowcost — whose
// bundled free-tier proxy became unreliable (0% success, network timeouts) — to
// instagram-scraper/instagram-profile-posts-scraper, which fetches reliably (95%+
// coverage in testing). Input: `instagramUsernames: []` + `postsPerProfile` +
// `onlyPostsNewerThan`. It returns accurate post IDs/dates/captions/thumbnails and
// coauthors, but engagement metrics come back null/-1 — those are filled by the
// separate refresh phase (clappi). Items are normalised to the legacy shape in
// normalizeDiscoveryItem so downstream attribution/upsert logic is unchanged.
export const DISCOVERY_ACTOR = 'instagram-scraper/instagram-profile-posts-scraper'

/**
 * The Apify API tokens to use, in priority order: APIFY_TOKEN first, then
 * APIFY_TOKEN_2, _3, _4, … auto-discovered from the environment (no fixed list —
 * add APIFY_TOKEN_7 as a secret/env var and it's picked up with no code change).
 * Blank/unset ones are skipped. Multiple tokens let a run fail over to another
 * account when one hits its Apify MONTHLY USAGE HARD LIMIT (see runActor /
 * isQuotaExhaustedError).
 */
const MAX_APIFY_TOKENS = 50 // bound the scan; well above any realistic count

export function apifyTokens(): string[] {
  const tokens: string[] = []
  const primary = process.env.APIFY_TOKEN?.trim()
  if (primary) tokens.push(primary)
  // Collect APIFY_TOKEN_2, _3, _4, … in numeric order. Gaps are skipped (a missing
  // _4 doesn't hide _5), so removing one token from the middle never silently
  // drops the rest.
  for (let i = 2; i <= MAX_APIFY_TOKENS; i++) {
    const t = process.env[`APIFY_TOKEN_${i}`]?.trim()
    if (t) tokens.push(t)
  }
  return tokens
}

export function makeApify(token?: string) {
  return new ApifyClient({ token: token ?? process.env.APIFY_TOKEN })
}

/**
 * True when an Apify error is the account's monthly usage hard limit (not a
 * transient failure). That message means retrying on the SAME token is futile —
 * the only recovery is a different account's token. Matched loosely because the
 * exact wording varies ("Monthly usage hard limit exceeded", plan-limit variants).
 */
export function isQuotaExhaustedError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase()
  return (
    msg.includes('monthly usage hard limit') ||
    msg.includes('usage hard limit exceeded') ||
    (msg.includes('hard limit') && msg.includes('exceed')) ||
    msg.includes('upgrade your subscription')
  )
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
 *
 * Token failover: `client` is optional. When omitted, the run is attempted with
 * each token from apifyTokens() in order, advancing to the next ONLY on a
 * monthly-usage-hard-limit error (isQuotaExhaustedError) — so a second Apify
 * account picks up where the first ran out of quota. Any other error is thrown
 * immediately (retrying it on another token would be pointless). Passing an
 * explicit `client` keeps the old single-token behaviour (used by the async
 * start/poll/fetch path, where the run lives on one specific account).
 */
export async function runActor(
  clientOrActorId: ApifyClient | string,
  actorIdOrInput: string | Record<string, unknown>,
  maybeInput?: Record<string, unknown>,
): Promise<ApifyItem[]> {
  // Overload A (explicit client): runActor(client, actorId, input)
  if (typeof clientOrActorId !== 'string') {
    const client = clientOrActorId
    const actorId = actorIdOrInput as string
    const input = maybeInput as Record<string, unknown>
    const run = await client.actor(actorId).call(input)
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    return (items as ApifyItem[]).filter((it) => !isDemoRow(it))
  }

  // Overload B (token failover): runActor(actorId, input)
  const actorId = clientOrActorId
  const input = actorIdOrInput as Record<string, unknown>
  const tokens = apifyTokens()
  if (tokens.length === 0) throw new Error('No Apify token configured (APIFY_TOKEN)')

  let lastErr: unknown
  for (let i = 0; i < tokens.length; i++) {
    const client = makeApify(tokens[i])
    try {
      const run = await client.actor(actorId).call(input)
      const { items } = await client.dataset(run.defaultDatasetId).listItems()
      return (items as ApifyItem[]).filter((it) => !isDemoRow(it))
    } catch (err) {
      lastErr = err
      // Only fail over on a hard-limit exhaustion; any other error is real.
      if (i < tokens.length - 1 && isQuotaExhaustedError(err)) {
        console.warn(
          `[apify] token #${i + 1} hit monthly hard limit — failing over to token #${i + 2}`,
        )
        continue
      }
      throw err
    }
  }
  throw lastErr
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
