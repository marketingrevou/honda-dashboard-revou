import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { refreshMetrics, makeSupabase, CHUNK_SIZE, countRefreshable } from '@/lib/refresh-metrics'

// Each invocation refreshes one CHUNK_SIZE slice (~225-300s of Post Detail
// calls), so 300s is the ceiling, not headroom — keep CHUNK_SIZE conservative.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = makeSupabase()

  // Posts inside the refresh window decide where the cursor wraps. Read it live
  // so the rotation stays correct as recent posts come and go.
  const total = await countRefreshable(supabase)
  if (total === 0) {
    return NextResponse.json({ success: true, total: 0, processed: 0, updated: 0 })
  }

  // Read the cursor. An explicit ?offset= overrides it (manual refresh of a
  // single slice without disturbing the cron's rotation).
  const override = req.nextUrl.searchParams.get('offset')
  let offset: number
  if (override !== null) {
    offset = Math.max(0, Math.min(total - 1, Number(override) || 0))
  } else {
    const { data } = await supabase
      .from('refresh_state')
      .select('next_offset')
      .eq('id', 1)
      .single()
    offset = ((data?.next_offset ?? 0) % total + total) % total
  }

  const result = await refreshMetrics(supabase, { offset, limit: CHUNK_SIZE })

  // Advance the cursor (wrapping) only for cursor-driven runs, so a manual
  // ?offset= refresh doesn't skip a slice in the normal rotation. `done` is true
  // on the run that reaches the end of the table — n8n can loop until then.
  const nextOffset = offset + CHUNK_SIZE
  const done = nextOffset >= total
  if (override === null) {
    await supabase
      .from('refresh_state')
      .update({ next_offset: done ? 0 : nextOffset, updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  revalidatePath('/dashboard')

  return NextResponse.json({
    success: true,
    offset,
    total,
    done,
    nextOffset: done ? 0 : nextOffset,
    ...result,
  })
}
