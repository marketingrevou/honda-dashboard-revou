/**
 * Re-scrape thumbnail URLs for specific posts whose CDN URLs have expired and
 * which are no longer returned by the RapidAPI userposts feed (they've scrolled
 * out of the recent-posts window).
 *
 * Uses Apify's instagram-scraper with directUrls pointed at the individual post
 * URLs, then updates thumbnail_url in Supabase by matching shortcode → post_id.
 *
 * Run: npx tsx --env-file=.env.local scripts/rescrape-expired-posts.ts
 */

import { ApifyClient } from 'apify-client'
import { createClient } from '@supabase/supabase-js'

// Posts with expired CDN URLs that RapidAPI can no longer refresh.
// post_id is the DB key; url is the Instagram permalink Apify will scrape.
const TARGETS = [
  { post_id: '3904128727830639385', url: 'https://www.instagram.com/p/DYuQGSbvjMZ/' },
  { post_id: '3905496074617232724', url: 'https://www.instagram.com/p/DYzG_zXPh1U/' },
  { post_id: '3904546060621852454', url: 'https://www.instagram.com/p/DYvu_R4hC8m/' },
  { post_id: '3902633825599796549', url: 'https://www.instagram.com/p/DYo8MmPTLVF/' },
  { post_id: '3899804442769040462', url: 'https://www.instagram.com/p/DYe43qIvSRO/' },
  { post_id: '3901345040828198491', url: 'https://www.instagram.com/p/DYkXKT4y-5b/' },
  { post_id: '3900974497439610879', url: 'https://www.instagram.com/p/DYjC6Mdvvf_/' },
  { post_id: '3901817224373380474', url: 'https://www.instagram.com/p/DYmChfFRqV6/' },
  { post_id: '3902565619195224827', url: 'https://www.instagram.com/p/DYossEEyKL7/' },
  { post_id: '3901147310590847040', url: 'https://www.instagram.com/p/DYjqM9QPOhA/' },
]

function shortcodeOf(url: string): string {
  return url.replace(/\/+$/, '').split('/').pop() ?? ''
}

async function main() {
  const apify = new ApifyClient({ token: process.env.APIFY_TOKEN })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log(`Re-scraping ${TARGETS.length} expired posts via Apify...`)
  console.log('─'.repeat(60))

  const run = await apify.actor('apify/instagram-scraper').call({
    directUrls: TARGETS.map((t) => t.url),
    resultsType: 'posts',
    resultsLimit: TARGETS.length,
    addParentData: false,
  })

  const { items } = await apify.dataset(run.defaultDatasetId).listItems()
  console.log(`Apify returned ${items.length} items`)

  // Map fresh thumbnail by shortcode (most reliable join key).
  const freshByShortcode = new Map<string, string | null>()
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

  let updated = 0
  let missing = 0
  for (const t of TARGETS) {
    const code = shortcodeOf(t.url)
    const freshUrl = freshByShortcode.get(code)
    if (freshUrl) {
      const { error } = await supabase
        .from('instagram_posts')
        .update({ thumbnail_url: freshUrl })
        .eq('post_id', t.post_id)
      if (error) {
        console.error(`[${code}] DB update error: ${error.message}`)
      } else {
        console.log(`[${code}] updated`)
        updated++
      }
    } else {
      console.log(`[${code}] no fresh URL returned by Apify`)
      missing++
    }
  }

  console.log('─'.repeat(60))
  console.log(`Done! Updated: ${updated}, missing: ${missing}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
