import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { runUpdate, makeSupabase, CHUNK_SIZE, chunkCount } from '@/lib/run-update'

// Each invocation scrapes one CHUNK_SIZE slice (~80s), so 300s is ample headroom.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = makeSupabase()
  const total = chunkCount()

  // Read the cursor. An explicit ?chunk= overrides it (manual backfill of a
  // single slice without disturbing the cron's rotation).
  const override = req.nextUrl.searchParams.get('chunk')
  let chunk: number
  if (override !== null) {
    chunk = Math.max(0, Math.min(total - 1, Number(override) || 0))
  } else {
    const { data } = await supabase
      .from('scrape_state')
      .select('next_chunk')
      .eq('id', 1)
      .single()
    chunk = ((data?.next_chunk ?? 0) % total + total) % total
  }

  const offset = chunk * CHUNK_SIZE
  const result = await runUpdate(supabase, { offset, limit: CHUNK_SIZE })

  // Advance the cursor (wrapping) only for cursor-driven runs, so a manual
  // ?chunk= backfill doesn't skip a slice in the normal rotation.
  if (override === null) {
    await supabase
      .from('scrape_state')
      .update({ next_chunk: (chunk + 1) % total, updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  revalidatePath('/dashboard')

  return NextResponse.json({ success: true, chunk, totalChunks: total, offset, ...result })
}
