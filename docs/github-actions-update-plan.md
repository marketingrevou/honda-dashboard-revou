# Plan: GitHub Actions update pipeline with /admin trigger + live status

> **Status: BUILT (2026-07-13).** Engine is `scripts/update.ts` (run via `tsx`,
> not `.mjs` — the libs are TypeScript with `@/` aliases). Workflow needs FIVE
> GitHub secrets (the four below + `SUPABASE_PUBLISHABLE_KEY`, because
> `lib/supabase.ts` reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at import time)
> and `GITHUB_PAT` in Vercel. The pipeline also fans collab/coauthored posts out
> to every coauthor that is a known dealer — see the collab section at the end.
>
> **Supabase stays the database — no data migrates off it.** The only DB change is
> one *new* table (`update_runs`) for status tracking. What moves is *where the
> update code runs*: Supabase Edge Functions → GitHub Actions (to escape the 546
> WORKER_LIMIT timeout). GitHub Actions still writes results **into** Supabase via
> the service-role key, exactly like the Edge Functions did.

## Why

The Edge Function scrape/classify occasionally returns **HTTP 546 (WORKER_LIMIT)** —
a CPU/wall-clock ceiling. It's **intermittent, not always**: recent logs showed
12/13 scrape calls succeeded (200), with one 546 on the older deploy (v6); v7/v8
were clean. Moving the work to GitHub Actions (6-hour timeout, single process)
removes the 546 class of error entirely, and it's free.

## Architecture

```
        ┌─────────────── GitHub Actions workflow ───────────────┐
        │  scripts/update.mjs:                                    │
        │  scrape (Apify) → refresh → classify (OpenAI)          │
        │  6-hour timeout → no 546 ever                          │
        └────────────────────────────────────────────────────────┘
             ▲ manual (workflow_dispatch)   ▲ automated (schedule cron, Monday)
             │                                
   ┌─────────┴──────────┐   writes progress → ┌──────────────────┐
   │  /admin button      │                     │ update_runs table │
   │  → GitHub API        │   /admin reads  ←   │ (status, phase,   │
   └──────────────────────┘                     │  counts, log)     │
                                                └──────────────────┘
```

Both triggers write the same `update_runs` table, so the /admin status panel
reflects manual **and** automated runs. Manual + automated + live status all met.

---

## Part 1 — DB migration: `update_runs` (ONLY additive change)

No existing table is altered, moved, or dropped.

```sql
create table public.update_runs (
  id            bigint generated always as identity primary key,
  trigger       text not null check (trigger in ('manual','schedule')),
  status        text not null default 'running'
                  check (status in ('running','success','failed')),
  phase         text,                       -- 'scrape' | 'refresh' | 'classify' | 'done'
  accounts_processed int default 0,
  posts_added        int default 0,
  posts_classified   int default 0,
  log           text,                       -- appended progress lines
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  github_run_id text                        -- link back to the Actions run
);
alter table public.update_runs enable row level security;
-- No public policies; service role (script) and admin server actions bypass RLS.
create index update_runs_started_at_idx on public.update_runs (started_at desc);
```

Keep `scrape_state` / `refresh_state` and the deployed Edge Functions as fallback.

---

## Part 2 — `scripts/update.mjs` (the engine)

Consolidate the scratchpad scripts from the backfill session (`ingest.mjs` +
`classify.mjs`) into one committed script.

1. **Load config** from `process.env` (GitHub injects secrets as env vars — do NOT
   read `.env` files): `APIFY_TOKEN`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_SUPABASE_SERVICE_ROLE_KEY`. Also `TRIGGER` (`manual`/`schedule`),
   `GITHUB_RUN_ID`.
2. **Create an `update_runs` row** (`status='running'`, `trigger`, `github_run_id`);
   keep its `id`. Update `phase`/counts/`log` as it progresses. try/catch →
   `status='failed'` + `error` on throw, else `status='success'` + `finished_at`.
3. **Phase 1 — Scrape:**
   - Load all `scrape_enabled` accounts from `instagram_accounts`.
   - Call `apify/instagram-scraper` with `directUrls` (chunk ~30 URLs per actor
     run), `resultsType: posts`, `onlyPostsNewerThan` = each account's last
     `post_date` (floor `2026-05-18` for never-scraped).
   - **Attribute by `inputUrl`, NOT `ownerUsername`** — collab/coauthored posts
     report a different owner not in `instagram_accounts` → FK violation.
   - Map → `instagram_posts` (post_id, post_url, thumbnail_url, caption,
     likes/comments/views, post_date, normalized post_type). Upsert
     `on_conflict=post_id`, `resolution=ignore-duplicates`; leave `pillar` /
     `classification_source` NULL.
   - Age-restricted accounts (`honda_sumber_cilacap_pwt`, `hondakudusjayaofficial`)
     can't be scraped without cookies — report as known gap, don't fail the run.
4. **Phase 2 — Refresh metrics** (optional, low priority — can call the existing
   `refresh-metrics` Edge Function or port it).
5. **Phase 3 — Classify:**
   - Query `instagram_posts WHERE classification_source IS NULL AND post_date >= '2026-05-18'`.
   - Fetch pillar defs **live** from `pillar_config`. `gpt-4o-mini`, temp 0,
     combined-vision→caption-ai fallback (verbatim prompts from
     `supabase/functions/*/_shared/classify-pillar.ts`).
   - **Concurrency ≤ 8 + retry-on-429** (OpenAI 200k TPM cap with base64 images).
   - PATCH `pillar` + `classification_source` per post.
6. Final: set `update_runs.status='success'`, counts, `finished_at`.

Node 22 (repo default). No chunk-loop needed — the 6h timeout covers a full pass.

---

## Part 3 — `.github/workflows/update.yml`

```yaml
name: Update Dashboard
on:
  workflow_dispatch:            # manual trigger (from /admin API call or GitHub UI)
    inputs:
      trigger: { default: 'manual' }
  schedule:
    - cron: '0 1 * * 1'         # every Monday 01:00 UTC (= 08:00 WIB)
jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: node scripts/update.mjs
        env:
          APIFY_TOKEN: ${{ secrets.APIFY_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TRIGGER: ${{ github.event.inputs.trigger || 'schedule' }}
          GITHUB_RUN_ID: ${{ github.run_id }}
```

Store the 4 secrets in **repo Settings → Secrets and variables → Actions**.

---

## Part 4 — /admin wiring

**Server action** `triggerUpdate()` in `app/actions/admin.ts`:
- `requireAdmin()` first.
- POST GitHub API
  `POST /repos/{owner}/{repo}/actions/workflows/update.yml/dispatches`
  with `{ ref: 'main', inputs: { trigger: 'manual' } }`, bearer = `GITHUB_PAT`
  (fine-grained PAT, **Actions: write**, in Vercel env — never shipped to browser).
- Returns `{ ok }`. Dispatch is fire-and-forget; the run appears in `update_runs`
  within seconds once the script's first write lands.

**Status panel** (`UpdateRunner.tsx` or new `UpdateStatus.tsx`):
- Replace the browser-driven chunk loop with: click → `triggerUpdate()` → poll a
  read action `getLatestRun()` (newest `update_runs` row) every ~5s.
- Render `phase`, counts, elapsed, final status. Stop polling on
  `status in ('success','failed')`.
- Shows the **Monday automated run too** — anyone on /admin sees the last/current
  run regardless of trigger.

`getLatestRun()`: `requireAdmin()`, select `update_runs order by started_at desc limit 1`.

---

## Part 5 — Cleanup / decommission (do last, after verifying)

- Keep Edge Functions deployed as a fallback initially; once GitHub runs are proven
  over a couple of weeks, optionally remove the old button's chunk-loop code.
- Leave the paused pg_cron **paused** — GitHub's schedule replaces it; re-enabling
  would double-run.

---

## Verification checklist (for the build session)

1. Migration applied; `update_runs` visible.
2. Secrets set in GitHub + `GITHUB_PAT` in Vercel.
3. Manually trigger workflow from GitHub UI → completes, writes `success`, counts
   sane, `unclassified_in_window = 0` after.
4. Click /admin button → dispatches, status panel shows live phases, ends `success`.
5. Confirm `schedule` set for Monday (leave it; fires on its own).
6. Age-restricted/empty accounts reported as known gaps, not failures.

## Gotchas (learned during the backfill session)

- **Attribute posts by `inputUrl`, not owner** → else FK violations on collab posts.
- **Classify concurrency ≤ 8 + retry-on-429** → OpenAI 200k TPM cap with base64 images.
- **Age-restricted accounts need cookies** → out of scope for the automated job;
  handle via the manual authenticated-Apify flow when needed.
- **`classification_source IS NULL` is the unclassified signal**, not `pillar`
  (which defaults to `Negative`).
- Campaign window floor: `post_date >= 2026-05-18`.
- Current pipeline is **Apify** (`sones/instagram-posts-scraper-lowcost` discovery +
  `apify/instagram-api-scraper` refresh) **+ OpenAI**. No RapidAPI anywhere.

## Collab / coauthored posts (added 2026-07-13)

A collab post is co-owned by several dealers. Previously `post_id` was globally
UNIQUE, so a collab collapsed into ONE row under whichever account the scraper
returned it under — the other dealers got no credit.

- **Schema:** `UNIQUE(post_id)` → `UNIQUE(post_id, account_username)` (migration
  `20260713_collab_posts_composite_unique.sql`). One row per (post, dealer). All
  upserts now use `on_conflict=post_id,account_username`.
- **Attribution:** the discovery actor returns `user` (primary) + a
  `coauthor_producers[]` array. `attributedHandles()` unions primary + coauthors,
  and the scrape fans a post out to each one **that already exists in
  instagram_accounts** (dealers only — a non-dealer coauthor would violate the
  `account_username` FK). `invited_coauthor_producers` is ignored (unaccepted).
- **Profile refresh:** only refresh a dealer's name/avatar from a post whose
  embedded `user.username` IS that dealer — else a collab overwrites it with the
  co-author's profile.
- **Metrics:** full metrics per dealer (each collab copy carries the same
  likes/views). Per-dealer views (getInstagramAccounts, headline post count) are
  correct by grouping on account_username. `getTopPosts` **dedups by post_id** so
  a collab shows one card. `getTrendData` is intentionally NOT deduped — its
  breakdowns are per-dealer/account, where a collab must contribute to each
  dealer's line; the pillar breakdown slightly over-counts rare collabs (accepted
  trade-off).
- **Classify:** one vision call per post_id updates every per-dealer copy at once
  (identical caption/image), and classifyUnclassified dedups post_id per batch.
