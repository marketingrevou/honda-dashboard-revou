/**
 * Run: npx tsx --env-file=.env.local scripts/reclassify-all.ts
 *
 * Re-classifies all posts in Supabase using the new AI pipeline:
 *   Step 1 — gpt-4.1-nano (caption only, fast & cheap)
 *   Step 2 — gpt-4o-mini (caption + image) only if Step 1 returns Negative
 */

import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

const CONCURRENCY = 3 // parallel requests at a time

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )

  // Fetch all posts
  const { data: posts, error } = await supabase
    .from('instagram_posts')
    .select('post_id, account_username, caption, thumbnail_url, pillar')
    .order('post_date', { ascending: false })

  if (error) {
    console.error('Failed to fetch posts:', error.message)
    process.exit(1)
  }

  console.log(`Found ${posts.length} posts to re-classify`)
  console.log('─'.repeat(70))

  let updated = 0
  let unchanged = 0
  let failed = 0

  // Process in batches of CONCURRENCY
  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const batch = posts.slice(i, i + CONCURRENCY)

    await Promise.all(
      batch.map(async (post) => {
        try {
          const { pillar: newPillar, source } = await classifyPillar(
            post.caption || '',
            post.thumbnail_url || null,
          )

          const changed = newPillar !== post.pillar
          const marker = changed ? '↻' : '·'
          const oldLabel = changed ? ` (was: ${post.pillar})` : ''
          console.log(
            `  ${marker} ${post.post_id.slice(0, 12).padEnd(12)}  [${newPillar.padEnd(30)}] (${source})${oldLabel}`,
          )

          const { error: updateErr } = await supabase
            .from('instagram_posts')
            .update({ pillar: newPillar })
            .eq('post_id', post.post_id)

          if (updateErr) {
            console.error(`    Update error for ${post.post_id}:`, updateErr.message)
            failed++
          } else if (changed) {
            updated++
          } else {
            unchanged++
          }
        } catch (err: any) {
          console.error(`    ERROR for ${post.post_id}:`, err.message)
          failed++
        }
      }),
    )
  }

  console.log('\n' + '─'.repeat(70))
  console.log(`Re-classification complete:`)
  console.log(`  Updated  : ${updated}`)
  console.log(`  Unchanged: ${unchanged}`)
  console.log(`  Failed   : ${failed}`)
  console.log(`  Total    : ${posts.length}`)
}

main().catch(console.error)
