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

export const REFRESH_ACTOR = 'apify/instagram-api-scraper'
export const DISCOVERY_ACTOR = 'sones/instagram-posts-scraper-lowcost'

export function makeApify() {
  return new ApifyClient({ token: Deno.env.get('APIFY_TOKEN') })
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
  client: ApifyClient,
  actorId: string,
  input: Record<string, unknown>,
): Promise<ApifyItem[]> {
  const run = await client.actor(actorId).call(input)
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  return (items as ApifyItem[]).filter((it) => !isDemoRow(it))
}
