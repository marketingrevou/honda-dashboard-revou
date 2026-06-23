/**
 * Repair posts that fell back to caption-only classification because their
 * Instagram CDN thumbnail had expired (the `oe=` signed URLs die after a few
 * days). For each candidate we:
 *   1. probe the stored thumbnail_url — keep going only if it's actually dead
 *      (403/410/network error), so we never waste an Apify call on a live image
 *      or a post that legitimately has no thumbnail;
 *   2. re-resolve a fresh image via Apify's instagram-scraper (directUrls);
 *   3. update thumbnail_url and re-run classifyPillar against the fresh image,
 *      upgrading the post from `caption-ai` to `combined-vision`.
 *
 * Candidates: classification_source = 'caption-ai' with a non-null thumbnail_url,
 * any post_type. Reels/videos count too — their thumbnail is the cover frame,
 * which is a perfectly good still to classify from (and expires like any other
 * CDN URL). The ~566 already-vision-classified reels prove the cover frame works.
 *
 * Run: npx tsx --env-file=.env.local scripts/repair-expired-thumbnails.ts
 *      npx tsx --env-file=.env.local scripts/repair-expired-thumbnails.ts --limit 50
 *
 * Idempotent: a post that succeeds becomes combined-vision and drops out of the
 * candidate set; a post whose image is still live is left untouched.
 */

import { ApifyClient } from 'apify-client'
import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

// Apify charges per scraped post; cap each invocation so a stray run can't
// balloon. Override with --limit N.
const DEFAULT_LIMIT = 100
const APIFY_BATCH = 50

type Candidate = {
  post_id: string
  post_url: string | null
  caption: string | null
  thumbnail_url: string | null
}

function shortcodeOf(url: string): string {
  return url.replace(/\/+$/, '').split('/').pop() ?? ''
}

/**
 * True when the CDN URL is genuinely expired/dead. A 403/410 is Instagram's
 * signed-URL expiry; a network error is treated the same. A 2xx means the image
 * is still live and the caption-only result was for some other reason — skip it.
 */
async function isExpired(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' })
    return res.status === 403 || res.status === 410 || res.status === 404
  } catch {
    return true
  }
}

function parseLimit(): number {
  const i = process.argv.indexOf('--limit')
  if (i !== -1 && process.argv[i + 1]) {
    const n = Number(process.argv[i + 1])
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_LIMIT
}

async function main() {
  const limit = parseLimit()
  const apify = new ApifyClient({ token: process.env.APIFY_TOKEN })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rows, error } = await supabase
    .from('instagram_posts')
    .select('post_id, post_url, caption, thumbnail_url, post_type')
    .eq('classification_source', 'caption-ai')
    .not('thumbnail_url', 'is', null)
    .not('post_url', 'is', null)
    // Any post_type — a reel/video thumbnail is its cover frame, a valid still.
    // Oldest first: expired CDN URLs cluster in older posts, so this targets the
    // posts that actually need repair rather than recent still-live thumbnails.
    .order('post_date', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Fetch failed:', error.message)
    process.exit(1)
  }

  const candidates = (rows ?? []) as Candidate[]
  console.log(`Probing ${candidates.length} caption-only post(s) for expired thumbnails`)
  console.log('─'.repeat(70))

  // Step 1: keep only the ones whose CDN URL is actually dead.
  const expired: Candidate[] = []
  for (const c of candidates) {
    if (c.thumbnail_url && (await isExpired(c.thumbnail_url))) expired.push(c)
  }
  console.log(`${expired.length} have expired/dead thumbnails — refreshing via Apify`)
  if (expired.length === 0) {
    console.log('Nothing to repair.')
    return
  }

  // Step 2: re-resolve fresh images via Apify in batches.
  const freshByShortcode = new Map<string, string | null>()
  for (let i = 0; i < expired.length; i += APIFY_BATCH) {
    const batch = expired.slice(i, i + APIFY_BATCH)
    const run = await apify.actor('apify/instagram-scraper').call({
      directUrls: batch.map((c) => c.post_url as string),
      resultsType: 'posts',
      resultsLimit: batch.length,
      addParentData: false,
    })
    const { items } = await apify.dataset(run.defaultDatasetId).listItems()
    for (const raw of items) {
      const it = raw as Record<string, unknown>
      const code = (it.shortCode as string) || shortcodeOf((it.url as string) || '')
      if (code) {
        freshByShortcode.set(
          code,
          (it.displayUrl as string) || (it.thumbnailUrl as string) || null,
        )
      }
    }
    console.log(`  Apify batch ${i / APIFY_BATCH + 1}: resolved ${items.length} item(s)`)
  }

  // Step 3: update thumbnail + reclassify against the fresh image.
  // Per-post failures (transient OpenAI/network blips) must NOT abort the whole
  // run — the work is otherwise idempotent and a single ENOTFOUND would waste
  // the Apify spend on every post after it. We skip-and-count instead; the post
  // stays caption-ai and is picked up on the next run.
  let upgraded = 0
  let stillCaption = 0
  let noFresh = 0
  let errored = 0
  for (const c of expired) {
    const code = shortcodeOf(c.post_url as string)
    const freshUrl = freshByShortcode.get(code)
    if (!freshUrl) {
      noFresh++
      console.log(`  [${code}] no fresh URL from Apify — left as-is`)
      continue
    }
    try {
      const { pillar, source } = await classifyPillar(c.caption ?? '', freshUrl)
      const { error: upErr } = await supabase
        .from('instagram_posts')
        .update({ thumbnail_url: freshUrl, pillar, classification_source: source })
        .eq('post_id', c.post_id)
      if (upErr) {
        errored++
        console.error(`  [${code}] DB update error: ${upErr.message}`)
        continue
      }
      if (source === 'combined-vision') {
        upgraded++
        console.log(`  [${code}] upgraded → ${pillar} (vision)`)
      } else {
        stillCaption++
        console.log(`  [${code}] refreshed but vision still failed → ${pillar} (caption)`)
      }
    } catch (err) {
      errored++
      console.error(`  [${code}] classify/update failed — skipped: ${String(err)}`)
    }
  }

  console.log('─'.repeat(70))
  console.log(
    `Done. Upgraded to vision: ${upgraded}, still caption: ${stillCaption}, ` +
      `no fresh image: ${noFresh}, errored: ${errored}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
