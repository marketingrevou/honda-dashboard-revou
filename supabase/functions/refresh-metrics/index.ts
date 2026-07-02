// Edge Function `refresh-metrics` — port of app/api/cron/refresh-metrics/route.ts.
//
// Each invocation refreshes one CHUNK_SIZE slice of recent posts' metrics via
// the Apify refresh actor and advances refresh_state's offset cursor (wrapping
// at the count of refreshable posts). A scraper failure returns 502 WITHOUT
// advancing the cursor, so the next run retries the same slice.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (see scrape/index.ts).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { refreshMetrics, CHUNK_SIZE, countRefreshable } from '../_shared/refresh-metrics.ts'

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const total = await countRefreshable(supabase)
  if (total === 0) {
    return new Response(JSON.stringify({ success: true, total: 0, processed: 0, updated: 0 }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  // Optional offset override (query param or JSON body) for a manual refresh.
  let override: string | null = new URL(req.url).searchParams.get('offset')
  if (override === null) {
    try {
      const body = await req.json()
      if (body && body.offset !== undefined && body.offset !== null) override = String(body.offset)
    } catch {
      // no/blank body — cursor-driven run
    }
  }

  let offset: number
  if (override !== null) {
    offset = Math.max(0, Math.min(total - 1, Number(override) || 0))
  } else {
    const { data } = await supabase.from('refresh_state').select('next_offset').eq('id', 1).single()
    offset = (((data?.next_offset ?? 0) % total) + total) % total
  }

  // A failure here is almost always the upstream scraper (Apify). Surface 502
  // and DON'T advance the cursor, so the next run retries this same slice.
  let result
  try {
    result = await refreshMetrics(supabase, { offset, limit: CHUNK_SIZE })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, offset, total, error: String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }

  const nextOffset = offset + CHUNK_SIZE
  const done = nextOffset >= total
  if (override === null) {
    await supabase
      .from('refresh_state')
      .update({ next_offset: done ? 0 : nextOffset, updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  return new Response(
    JSON.stringify({ success: true, offset, total, done, nextOffset: done ? 0 : nextOffset, ...result }),
    { headers: { 'content-type': 'application/json' } },
  )
})
