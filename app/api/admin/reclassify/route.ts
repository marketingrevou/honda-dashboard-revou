import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { makeSupabase } from '@/lib/run-update'
import { classifyPillar } from '@/lib/classify-pillar'
import { guardAdmin } from '@/lib/admin-route'

// Standalone admin trigger: re-run vision classification on posts currently
// marked 'Negative' (with a thumbnail), to catch misclassifications. Mirrors
// the cron-less /api/reclassify but gated on admin instead of open. Processes
// one bounded batch per call so it stays under the function limit; the client
// loops until `done` (remaining === 0).
export const maxDuration = 60

const BATCH_LIMIT = 8

// Distinct source marker written when this pass has vision-checked a post. A
// post that legitimately stays Negative keeps its Negative pillar but gets this
// marker, so it drops out of the next batch's selection and the browser loop
// terminates. Without a distinct marker (vs the scrape's 'combined-vision'),
// re-checked-but-still-Negative posts would be re-selected forever.
const RECLASSIFIED_SOURCE = 'reclassified-vision'

export async function POST() {
  const denied = await guardAdmin()
  if (denied) return denied

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
  }

  const supabase = makeSupabase()

  // Select Negatives (with a thumbnail) not yet checked in this pass. `neq`
  // excludes rows already marked; it also matches rows where the source is a
  // different value (scrape sources) — NULLs are handled by the separate `.or`.
  const { data: posts, error } = await supabase
    .from('instagram_posts')
    .select('post_id, caption, thumbnail_url, account_username')
    .eq('pillar', 'Negative')
    .not('thumbnail_url', 'is', null)
    .or(`classification_source.is.null,classification_source.neq.${RECLASSIFIED_SOURCE}`)
    .limit(BATCH_LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!posts || posts.length === 0) {
    return NextResponse.json({ processed: 0, reclassified: 0, remaining: 0, done: true })
  }

  let reclassified = 0
  const errors: string[] = []
  await Promise.all(
    posts.map(async (post) => {
      try {
        const { pillar } = await classifyPillar(post.caption, post.thumbnail_url)
        // If it moved off Negative, record the real classifier source. If it
        // stays Negative, stamp the reclassified marker so it drops from the
        // loop; either way the post won't be re-selected next batch.
        const source = pillar === 'Negative' ? RECLASSIFIED_SOURCE : 'combined-vision'
        await supabase
          .from('instagram_posts')
          .update({ pillar, classification_source: source })
          .eq('post_id', post.post_id)
        if (pillar !== 'Negative') reclassified++
      } catch (err) {
        errors.push(`${post.post_id}: ${String(err)}`)
      }
    }),
  )

  if (reclassified > 0) revalidatePath('/dashboard')

  // Remaining = Negatives with a thumbnail not yet marked by this pass.
  const { count } = await supabase
    .from('instagram_posts')
    .select('post_id', { count: 'exact', head: true })
    .eq('pillar', 'Negative')
    .not('thumbnail_url', 'is', null)
    .or(`classification_source.is.null,classification_source.neq.${RECLASSIFIED_SOURCE}`)

  const remaining = count ?? 0

  return NextResponse.json({
    processed: posts.length,
    reclassified,
    remaining,
    // `done` when nothing remains, or when a full batch made zero progress
    // (all errored) so a persistent failure can't loop forever.
    done: remaining === 0 || (errors.length === posts.length),
    ...(errors.length > 0 && { errors }),
  })
}
