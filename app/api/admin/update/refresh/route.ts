import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  startRefresh,
  refreshRunStatus,
  ingestRefresh,
  isTerminalStatus,
  makeSupabase,
  CHUNK_SIZE,
  countRefreshable,
} from '@/lib/refresh-metrics'
import { guardAdmin } from '@/lib/admin-route'

// Phase 4 of the admin Update — async (start/status/ingest) so no request waits
// for the whole Apify run (60s Hobby cap). Refreshes likes/comments/views for
// the last-14-day posts, one slice per loop. Explicit offsets → does NOT touch
// the cron's refresh_state cursor.
//   ?action=start&offset=N  → { runId, datasetId, rows, total, offset, nextOffset }
//   ?action=status&runId=…  → { status, terminal }
//   ?action=ingest          → apply metrics for the slice's rows
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const denied = await guardAdmin()
  if (denied) return denied

  const action = req.nextUrl.searchParams.get('action') ?? 'start'
  const supabase = makeSupabase()

  try {
    if (action === 'start') {
      const total = await countRefreshable(supabase)
      if (total === 0) {
        return NextResponse.json({ total: 0, offset: 0, done: true, runId: null, datasetId: null, rows: [] })
      }
      const raw = Number(req.nextUrl.searchParams.get('offset') ?? 0)
      const offset = Math.max(0, Math.min(total - 1, Number.isFinite(raw) ? raw : 0))
      const { runId, datasetId, rows } = await startRefresh(supabase, { offset, limit: CHUNK_SIZE })
      const nextOffset = offset + CHUNK_SIZE
      const done = nextOffset >= total
      return NextResponse.json({
        runId,
        datasetId,
        rows,
        total,
        offset,
        nextOffset: done ? null : nextOffset,
        done,
      })
    }

    if (action === 'status') {
      const runId = req.nextUrl.searchParams.get('runId')
      if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 })
      const status = await refreshRunStatus(runId)
      return NextResponse.json({ status, terminal: isTerminalStatus(status) })
    }

    if (action === 'ingest') {
      const body = (await req.json().catch(() => ({}))) as {
        datasetId?: string | null
        rows?: { post_id: string; post_url: string | null }[]
      }
      const rows = Array.isArray(body.rows) ? body.rows : []
      // No datasetId means the slice had no fetchable URLs — nothing to ingest.
      const result = body.datasetId
        ? await ingestRefresh(supabase, body.datasetId, rows)
        : { processed: rows.length, updated: 0, failed: 0 }
      revalidatePath('/dashboard')
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
