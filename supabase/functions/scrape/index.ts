// Edge Function `scrape` — port of app/api/cron/update/route.ts.
//
// Each invocation scrapes one CHUNK_SIZE slice of the scrape-enabled accounts
// (read live from instagram_accounts, ordered by username) via the Apify
// discovery actor, upserts + classifies the posts, and advances scrape_state's
// cursor (wrapping) so ceil(enabledCount/CHUNK_SIZE) invocations cover the list.
// The chunk count is dynamic: adding/removing accounts changes it automatically.
//
// Auth: expects `Authorization: Bearer <CRON_SECRET>` (same secret the Vercel
// cron used), so pg_cron and the admin dashboard can both trigger it. JWT
// verification is disabled at deploy time (verify_jwt=false) in favour of this
// shared-secret check, which the pg_cron body carries.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { runUpdate, CHUNK_SIZE, chunkCount, countAccounts } from '../_shared/run-update.ts'

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
  const enabledCount = await countAccounts(supabase)
  const total = chunkCount(enabledCount)

  // An explicit chunk override (query param or JSON body) backfills one slice
  // without disturbing the cron's rotation. Body is optional (pg_cron sends {}).
  let override: string | null = new URL(req.url).searchParams.get('chunk')
  if (override === null) {
    try {
      const body = await req.json()
      if (body && body.chunk !== undefined && body.chunk !== null) override = String(body.chunk)
    } catch {
      // no/blank body — cursor-driven run
    }
  }

  let chunk: number
  if (override !== null) {
    chunk = Math.max(0, Math.min(total - 1, Number(override) || 0))
  } else {
    const { data } = await supabase.from('scrape_state').select('next_chunk').eq('id', 1).single()
    chunk = (((data?.next_chunk ?? 0) % total) + total) % total
  }

  const offset = chunk * CHUNK_SIZE
  const result = await runUpdate(supabase, { offset, limit: CHUNK_SIZE })

  // Advance the cursor (wrapping) only for cursor-driven runs.
  if (override === null) {
    await supabase
      .from('scrape_state')
      .update({ next_chunk: (chunk + 1) % total, updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  return new Response(
    JSON.stringify({ success: true, chunk, totalChunks: total, offset, ...result }),
    { headers: { 'content-type': 'application/json' } },
  )
})
