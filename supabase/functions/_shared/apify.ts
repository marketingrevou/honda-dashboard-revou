// Deno port of lib/apify.ts — shared Apify client + actor IDs for the two
// scraping jobs. Uses the apify-client npm package via Deno's npm: specifier.
//
// Job #1 (metric refresh) uses apify/instagram-api-scraper — accepts individual
// /p/ post URLs via `directUrls` and returns full metrics + thumbnail keyed by
// the Instagram media id (which matches our post_id).
//
// Job #2 (new-post discovery) uses sones/instagram-posts-scraper-lowcost —
// accepts a `usernames` array and returns recent posts including caption.text,
// image_url, like/comment/play counts, and the post owner profile.

import { ApifyClient } from 'npm:apify-client@2'

// Metric-refresh actor: clappi/instagram-posts-scraper ($0.0005/post, ~4.6×
// cheaper than the old apify/instagram-api-scraper). Input `postUrls: string[]`;
// output mediaId/likes/comments/views/thumbnailUrl (see applyMetricUpdates).
export const REFRESH_ACTOR = 'clappi/instagram-posts-scraper'
export const DISCOVERY_ACTOR = 'sones/instagram-posts-scraper-lowcost'

const MAX_APIFY_TOKENS = 50 // bound the scan; well above any realistic count

/**
 * Apify tokens in priority order (APIFY_TOKEN, then _2, _3, _4, … auto-discovered
 * from the env — add APIFY_TOKEN_7 and it's picked up with no code change). Gaps
 * are skipped; blanks removed.
 */
export function apifyTokens(): string[] {
  const tokens: string[] = []
  const primary = Deno.env.get('APIFY_TOKEN')?.trim()
  if (primary) tokens.push(primary)
  for (let i = 2; i <= MAX_APIFY_TOKENS; i++) {
    const t = Deno.env.get(`APIFY_TOKEN_${i}`)?.trim()
    if (t) tokens.push(t)
  }
  return tokens
}

export function makeApify(token?: string) {
  return new ApifyClient({ token: token ?? Deno.env.get('APIFY_TOKEN') })
}

/** True when an Apify error is the account's monthly usage hard limit. */
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
 * plan. BLOCKS until the actor run finishes — fine here because the Apify wait
 * is idle I/O, not CPU, so it stays within the Edge Function CPU budget.
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

  // Overload B (token failover): runActor(actorId, input) — advance to the next
  // token only on a monthly-hard-limit error, so a second account picks up.
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
      if (i < tokens.length - 1 && isQuotaExhaustedError(err)) {
        console.warn(`[apify] token #${i + 1} hit monthly hard limit — failing over to token #${i + 2}`)
        continue
      }
      throw err
    }
  }
  throw lastErr
}
