/**
 * Backfill pillar classification for posts that were never classified.
 *
 * The pillar column defaults to 'Negative', so a row can look classified
 * (pillar IS NOT NULL) while never having been run through the classifier
 * (classification_source IS NULL). This script finds those rows and classifies
 * them via classifyPillar, persisting both pillar and classification_source.
 *
 * Run: npx tsx --env-file=.env.local scripts/classify-missing.ts
 */

import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

const CONCURRENCY = 4

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: posts, error } = await supabase
    .from('instagram_posts')
    .select('post_id, account_username, caption, thumbnail_url, pillar')
    .is('classification_source', null)
    .order('post_date', { ascending: false })

  if (error) {
    console.error('Failed to fetch posts:', error.message)
    process.exit(1)
  }

  console.log(`Found ${posts.length} never-classified post(s)`)
  console.log('─'.repeat(70))

  let changed = 0
  let stayedNegative = 0
  let failed = 0
  const breakdown: Record<string, number> = {}

  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const batch = posts.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (post) => {
        try {
          const { pillar, source } = await classifyPillar(
            post.caption || '',
            post.thumbnail_url || null,
          )
          const { error: upErr } = await supabase
            .from('instagram_posts')
            .update({ pillar, classification_source: source })
            .eq('post_id', post.post_id)
          if (upErr) {
            console.error(`  ✗ ${post.post_id}: ${upErr.message}`)
            failed++
            return
          }
          breakdown[pillar] = (breakdown[pillar] ?? 0) + 1
          if (pillar !== 'Negative') changed++
          else stayedNegative++
        } catch (err) {
          console.error(`  ✗ ${post.post_id}: ${String(err)}`)
          failed++
        }
      }),
    )
    if ((i / CONCURRENCY) % 10 === 0) {
      console.log(`  …processed ${Math.min(i + CONCURRENCY, posts.length)}/${posts.length}`)
    }
  }

  console.log('─'.repeat(70))
  console.log('Done.')
  console.log(`  Moved off Negative : ${changed}`)
  console.log(`  Stayed Negative    : ${stayedNegative}`)
  console.log(`  Failed             : ${failed}`)
  console.log('  Breakdown:', breakdown)
}

main().catch(console.error)
