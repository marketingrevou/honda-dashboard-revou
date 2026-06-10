import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )

  // Fetch all Negative posts that have a thumbnail
  const { data: posts, error } = await supabase
    .from('instagram_posts')
    .select('post_id, caption, thumbnail_url, account_username')
    .eq('pillar', 'Negative')
    .not('thumbnail_url', 'is', null)

  if (error || !posts) {
    return NextResponse.json({ error: error?.message ?? 'Failed to fetch posts' }, { status: 500 })
  }

  const results: { post_id: string; account: string; new_pillar: string; changed: boolean }[] = []

  for (const post of posts) {
    try {
      const { pillar: newPillar, source } = await classifyPillar(post.caption, post.thumbnail_url)

      // Always persist the source so we have a durable record of which posts
      // were vision-checked — even when a post legitimately stays Negative.
      await supabase
        .from('instagram_posts')
        .update({ pillar: newPillar, classification_source: source })
        .eq('post_id', post.post_id)

      results.push({
        post_id: post.post_id,
        account: post.account_username,
        new_pillar: newPillar,
        changed: newPillar !== 'Negative',
      })
    } catch (err) {
      results.push({
        post_id: post.post_id,
        account: post.account_username,
        new_pillar: 'Negative',
        changed: false,
      })
      console.error(`Vision failed for ${post.post_id}:`, err)
    }
  }

  const changed = results.filter((r) => r.changed)
  const summary = changed.reduce<Record<string, number>>((acc, r) => {
    acc[r.new_pillar] = (acc[r.new_pillar] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    total_processed: results.length,
    total_reclassified: changed.length,
    breakdown: summary,
    details: results,
  })
}
