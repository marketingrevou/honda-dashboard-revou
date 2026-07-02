import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// DECOMMISSIONED (2026-07-02). The scrape pipeline moved to the Supabase Edge
// Function `scrape`, scheduled by pg_cron (weekly Mon) and triggered on demand
// from the admin dashboard (see app/actions/admin.ts → triggerScrape).
//
// This route is kept as a 410 tombstone so any lingering external trigger (the
// old n8n workflow) no-ops instead of double-scraping. Safe to delete once the
// n8n workflows are confirmed disabled.
// ─────────────────────────────────────────────────────────────────────────────

export function GET() {
  return NextResponse.json(
    {
      error: 'Gone',
      message:
        'The scrape cron moved to the Supabase Edge Function `scrape` (pg_cron + admin trigger). This endpoint is decommissioned.',
    },
    { status: 410 },
  )
}
