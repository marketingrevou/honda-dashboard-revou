-- update_runs — status tracking for the GitHub Actions update pipeline.
--
-- The scrape → refresh → classify pipeline moved off Supabase Edge Functions
-- (to escape the intermittent HTTP 546 WORKER_LIMIT) and onto GitHub Actions
-- (6h timeout, single process). GitHub Actions still writes results INTO
-- Supabase via the service-role key; this table is the only additive schema
-- change. Both the manual (workflow_dispatch, from /admin) and the automated
-- (Monday schedule) triggers write here, so the /admin status panel reflects
-- every run regardless of how it started.

create table if not exists public.update_runs (
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
-- No public policies; the service role (script) and admin server actions bypass RLS.
create index if not exists update_runs_started_at_idx on public.update_runs (started_at desc);
