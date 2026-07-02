import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  startScrape,
  scrapeRunStatus,
  ingestScrape,
  isTerminalStatus,
  makeSupabase,
  chunkCount,
} from '@/lib/run-update'
import { guardAdmin } from '@/lib/admin-route'

// Phase 1 of the admin Update — async so no single request waits for the whole
// Apify run (the 60s Hobby cap). Three lightweight actions the browser drives:
//   ?action=start&chunk=N   → start the actor, returns { runId, datasetId, usernames }
//   ?action=status&runId=…  → poll, returns { status, terminal }
//   ?action=ingest          → after SUCCEEDED, upsert results (classify:false)
// We deliberately do NOT touch the cron's scrape_state cursor.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const denied = await guardAdmin()
  if (denied) return denied

  const action = req.nextUrl.searchParams.get('action') ?? 'start'
  const total = chunkCount()

  try {
    if (action === 'start') {
      const raw = Number(req.nextUrl.searchParams.get('chunk') ?? 0)
      const chunk = Math.max(0, Math.min(total - 1, Number.isFinite(raw) ? raw : 0))
      const { runId, datasetId, usernames } = await startScrape(chunk)
      return NextResponse.json({
        runId,
        datasetId,
        usernames,
        chunk,
        totalChunks: total,
        nextChunk: chunk >= total - 1 ? null : chunk + 1,
      })
    }

    if (action === 'status') {
      const runId = req.nextUrl.searchParams.get('runId')
      if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 })
      const status = await scrapeRunStatus(runId)
      return NextResponse.json({ status, terminal: isTerminalStatus(status) })
    }

    if (action === 'ingest') {
      const body = (await req.json().catch(() => ({}))) as {
        datasetId?: string
        usernames?: string[]
        chunk?: number
      }
      if (!body.datasetId || !Array.isArray(body.usernames)) {
        return NextResponse.json({ error: 'datasetId and usernames required' }, { status: 400 })
      }
      const supabase = makeSupabase()
      const result = await ingestScrape(supabase, body.datasetId, body.usernames)
      revalidatePath('/dashboard')
      const chunk = body.chunk ?? 0
      const done = chunk >= total - 1
      return NextResponse.json({ chunk, totalChunks: total, done, ...result })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
