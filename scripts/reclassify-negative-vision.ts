/**
 * Re-evaluate every post currently labelled "Negative" using full vision
 * analysis (caption + image via gpt-4o-mini), and record the result.
 *
 * Run: npx tsx --env-file=.env.local scripts/reclassify-negative-vision.ts
 *
 * Unlike scripts/reclassify-all.ts, this ALWAYS writes classification_source
 * so we get a durable record of which posts were vision-checked — even when a
 * post legitimately stays Negative.
 */

import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

const CONCURRENCY = 3 // parallel OpenAI requests at a time

async function main() {
  // Use the service-role key (this is an admin batch job run locally; the
  // public publishable key is not populated in the local .env).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )

  const { data: posts, error } = await supabase
    .from('instagram_posts')
    .select('post_id, account_username, caption, thumbnail_url')
    .eq('pillar', 'Negative')
    .order('post_date', { ascending: false })

  if (error || !posts) {
    console.error('Failed to fetch posts:', error?.message)
    process.exit(1)
  }

  console.log(`Found ${posts.length} Negative posts to re-evaluate with vision`)
  console.log('─'.repeat(78))

  let stillNegative = 0
  let reclassified = 0
  let failed = 0
  const breakdown: Record<string, number> = {}

  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const batch = posts.slice(i, i + CONCURRENCY)

    await Promise.all(
      batch.map(async (post) => {
        try {
          const { pillar: newPillar, source } = await classifyPillar(
            post.caption || '',
            post.thumbnail_url || null,
          )

          const { error: updateErr } = await supabase
            .from('instagram_posts')
            .update({ pillar: newPillar, classification_source: source })
            .eq('post_id', post.post_id)

          if (updateErr) {
            console.error(`    Update error for ${post.post_id}:`, updateErr.message)
            failed++
            return
          }

          const changed = newPillar !== 'Negative'
          if (changed) {
            reclassified++
            breakdown[newPillar] = (breakdown[newPillar] ?? 0) + 1
          } else {
            stillNegative++
          }

          const marker = changed ? '↻' : '·'
          console.log(
            `  ${marker} ${post.post_id.slice(0, 12).padEnd(12)}  ` +
              `[${newPillar.padEnd(30)}] (${source})`,
          )
        } catch (err: any) {
          console.error(`    ERROR for ${post.post_id}:`, err.message)
          failed++
        }
      }),
    )
  }

  console.log('\n' + '─'.repeat(78))
  console.log('Vision re-evaluation of Negative posts complete:')
  console.log(`  Reclassified to positive : ${reclassified}`)
  console.log(`  Still Negative           : ${stillNegative}`)
  console.log(`  Failed                   : ${failed}`)
  console.log(`  Total                    : ${posts.length}`)
  if (reclassified > 0) {
    console.log('\n  Reclassified breakdown:')
    for (const [pillar, n] of Object.entries(breakdown).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${pillar.padEnd(30)} ${n}`)
    }
  }
}

main().catch(console.error)
