// Edge Function `classify` — Phase 3 of the admin Update.
//
// The admin Update scrapes with classify:false (Phase 1) and refreshes metrics
// (Phase 2) first, then calls this to classify the newly-scraped posts. A post
// is "unclassified" when classification_source IS NULL AND it's inside the
// campaign window — after a scrape-only pass those are exactly the just-scraped
// posts (plus any prior stragglers, swept up too). Each invocation classifies a
// small bounded batch (image fetch + base64 + vision call per post is the
// expensive part) and returns `remaining`/`done` so the client loops for full
// coverage without any single invocation exceeding the worker limit.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same shared secret as scrape /
// refresh-metrics; JWT verification is disabled at deploy time via verify_jwt=false).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { classifyUnclassified } from '../_shared/run-update.ts'

// Posts per invocation. Kept small so the image-fetch + base64 + vision work for
// the whole batch stays well under the Edge Function worker limit; the client
// loops until `done`.
const BATCH_LIMIT = 8

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

  // Optional limit override (query param or JSON body); defaults to BATCH_LIMIT.
  let override: string | null = new URL(req.url).searchParams.get('limit')
  if (override === null) {
    try {
      const body = await req.json()
      if (body && body.limit !== undefined && body.limit !== null) override = String(body.limit)
    } catch {
      // no/blank body — use the default batch size
    }
  }
  const limit = override !== null ? Math.max(1, Number(override) || BATCH_LIMIT) : BATCH_LIMIT

  const result = await classifyUnclassified(supabase, { limit })

  return new Response(
    JSON.stringify({ success: true, ...result }),
    { headers: { 'content-type': 'application/json' } },
  )
})
