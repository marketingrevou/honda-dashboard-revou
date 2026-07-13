-- Allow a single IG post to be attributed to multiple dealers (collab /
-- coauthored posts). Previously post_id was globally UNIQUE, so a collab
-- collapsed into one row under a single account and the other dealers on it got
-- no credit.
--
-- Switch to UNIQUE(post_id, account_username): one row per (post, dealer), so
-- every dealer on a collab gets its own row. Metrics/caption are duplicated
-- across a collab's rows on purpose — each dealer sees full metrics in their own
-- per-dealer view (getInstagramAccounts groups by account_username). Org-wide
-- aggregates (getTrendData, getTopPosts) dedup by post_id in the read layer so a
-- collab's likes/views are counted once at the org level.
--
-- Attribution source: the discovery actor returns `user` (primary owner) plus
-- `coauthor_producers[]`; the scrape fans a post out to the primary + every
-- coauthor that already exists in instagram_accounts (dealers only — non-dealer
-- coauthors are skipped to avoid the account_username FK violation).

alter table public.instagram_posts drop constraint instagram_posts_post_id_key;
alter table public.instagram_posts
  add constraint instagram_posts_post_id_account_key unique (post_id, account_username);
