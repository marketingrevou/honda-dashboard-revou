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

/**
 * Run an actor with the given input and return its dataset items, filtering out
 * the single `{demo: ...}` placeholder rows that gated actors emit on the free
 * plan (so a gated actor surfaces as "0 items" rather than fake data).
 */
export async function runActor(
  client: ApifyClient,
  actorId: string,
  input: Record<string, unknown>,
): Promise<ApifyItem[]> {
  const run = await client.actor(actorId).call(input)
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  return (items as ApifyItem[]).filter(
    (it) => !(Object.keys(it).length === 1 && it.demo !== undefined),
  )
}
