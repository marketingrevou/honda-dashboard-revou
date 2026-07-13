// Deno port of the scrape half of lib/run-update.ts — the account-list loader,
// chunking constants, and the blocking scrape → upsert → classify pipeline used
// by the `scrape` Edge Function. The account list is read live from the
// instagram_accounts table (scrape_enabled = true), so admin add/remove drives
// what gets scraped. Only the blocking path is ported (the cron uses it).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { classifyPillar } from './classify-pillar.ts'
import {
  makeApify,
  runActor,
  getPostType,
  DISCOVERY_ACTOR,
  type ApifyItem,
} from './apify.ts'

// The account list is the source of truth in the `instagram_accounts` table
// (scrape_enabled = true), NOT a hardcoded array — admins add/remove dealers from
// the admin page. Always read it ORDERED BY username so chunk boundaries stay
// stable across cron runs (the cursor slices by position, so a non-deterministic
// order would shift chunk edges and skip dealers).
export async function loadAccounts(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('username')
    .eq('scrape_enabled', true)
    .order('username', { ascending: true })
  if (error) throw new Error(`Failed to load account list: ${error.message}`)
  return (data ?? []).map((r: { username: string }) => r.username)
}

/** Count of scrape-enabled accounts — drives dynamic chunk count. */
export async function countAccounts(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('instagram_accounts')
    .select('username', { count: 'exact', head: true })
    .eq('scrape_enabled', true)
  if (error) throw new Error(`Failed to count accounts: ${error.message}`)
  return count ?? 0
}

const PROFILE_PIC_BUCKET = 'profile-pics'

// Recent posts to request per account. New posts are near the top, so 12 (one
// IG page) is plenty.
const POSTS_PER_ACCOUNT = 12

// Hard floor for post dates — the dashboard only covers the campaign window
// starting 2026-05-18, so older posts are dropped before reaching the DB.
const POST_DATE_CUTOFF = new Date('2026-05-18T00:00:00Z')

/**
 * Accounts processed per invocation. The discovery actor takes a whole batch of
 * usernames in a single run, and every fetched post is then classified (an
 * OpenAI vision call) within the same worker — so this size sets the per-run
 * CPU/wall-clock cost. At 40 the scrape+classify pass could exceed the Edge
 * Function worker limit (HTTP 546 WORKER_LIMIT) on heavier chunks, so it's set
 * to 20: more, smaller invocations that each stay well under the budget. The
 * cron advances a cursor each run so the whole enabled list is covered across
 * ceil(enabledCount / CHUNK_SIZE) runs; the client loops chunks until `done`,
 * so this change needs no client-side edit.
 */
export const CHUNK_SIZE = 20

/** Number of chunks needed to cover `total` enabled accounts. */
export function chunkCount(total: number): number {
  return Math.max(1, Math.ceil(total / CHUNK_SIZE))
}

/**
 * Mirror an Instagram CDN profile picture into Supabase Storage and return a
 * stable public URL. IG's signed CDN URLs expire (~7 days), so persisting them
 * directly makes avatars go blank. Falls back to the CDN URL on any failure so a
 * transient hiccup never wipes an existing picture.
 */
async function storeProfilePic(
  supabase: SupabaseClient,
  username: string,
  cdnUrl: string | null,
): Promise<string | null> {
  if (!cdnUrl) return null
  try {
    const res = await fetch(cdnUrl)
    if (!res.ok) return cdnUrl
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return cdnUrl
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0) return cdnUrl

    const path = `${username}.jpg`
    const { error: upErr } = await supabase.storage
      .from(PROFILE_PIC_BUCKET)
      .upload(path, bytes, { contentType, upsert: true, cacheControl: '31536000' })
    if (upErr) return cdnUrl

    return supabase.storage.from(PROFILE_PIC_BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return cdnUrl
  }
}

type AccountResult = { username: string; postsAdded: number; error?: string }

function captionText(p: ApifyItem): string {
  const cap = p.caption as { text?: string } | string | null | undefined
  if (typeof cap === 'string') return cap
  return cap?.text ?? ''
}

/** Unix `taken_at` (seconds) → Date. */
function postDate(p: ApifyItem): Date {
  return new Date((p.taken_at as number) * 1000)
}

/**
 * Scrape recent posts for a batch of usernames via the discovery actor (one
 * actor run for the whole batch), then upsert (and, when `classify`, classify)
 * the results. The admin Update passes classify:false so scraping, metric
 * refresh, and classification run as three separate all-account passes; the
 * weekly cron keeps classify:true and does everything inline.
 */
async function processBatch(
  usernames: string[],
  supabase: SupabaseClient,
  options: { classify?: boolean } = {},
): Promise<AccountResult[]> {
  const client = makeApify()

  let items: ApifyItem[]
  try {
    items = await runActor(client, DISCOVERY_ACTOR, {
      usernames,
      resultsLimit: POSTS_PER_ACCOUNT,
    })
  } catch (err) {
    return usernames.map((u) => ({ username: u, postsAdded: 0, error: String(err) }))
  }

  // Group fetched posts by owner handle.
  const byAccount = new Map<string, ApifyItem[]>()
  for (const p of items) {
    const user = p.user as { username?: string } | undefined
    const owner = (p.scraped_username as string) || user?.username || ''
    if (!owner) continue
    const list = byAccount.get(owner) ?? []
    list.push(p)
    byAccount.set(owner, list)
  }

  // Refresh the profile row from any of the account's posts.
  await Promise.all(
    usernames.map(async (username) => {
      const posts = byAccount.get(username) ?? []
      const user = posts[0]?.user as
        | { full_name?: string; profile_pic_url?: string }
        | undefined
      if (!user) return
      const profilePicUrl = await storeProfilePic(supabase, username, user.profile_pic_url || null)
      await supabase.from('instagram_accounts').upsert(
        {
          username,
          full_name: user.full_name || username,
          profile_picture_url: profilePicUrl,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'username' },
      )
    }),
  )

  return Promise.all(
    usernames.map((username) =>
      upsertAccountPosts(username, byAccount.get(username) ?? [], supabase, options),
    ),
  )
}

/**
 * Upsert the fetched posts for a single account and, when `classify` (the
 * default), classify any not yet classified. `classification_source IS NULL` is
 * the reliable "unclassified" signal — the `pillar` column defaults to
 * 'Negative' so its presence is not. With classify:false the upsert leaves the
 * new rows unclassified for a later classify pass to pick up.
 */
async function upsertAccountPosts(
  username: string,
  allPosts: ApifyItem[],
  supabase: SupabaseClient,
  options: { classify?: boolean } = {},
): Promise<AccountResult> {
  const classify = options.classify ?? true
  if (allPosts.length === 0) {
    return { username, postsAdded: 0, error: 'no posts returned' }
  }
  const posts = allPosts.filter((p) => postDate(p) >= POST_DATE_CUTOFF)
  if (posts.length === 0) {
    return { username, postsAdded: 0 }
  }
  try {
    await supabase.from('instagram_posts').upsert(
      posts.map((p) => ({
        post_id: String(p.pk ?? p.id),
        account_username: username,
        post_url: (p.post_url as string) || `https://www.instagram.com/p/${p.code}/`,
        thumbnail_url: (p.image_url as string) || null,
        caption: captionText(p),
        likes_count: (p.like_count as number) || 0,
        comments_count: (p.comment_count as number) || 0,
        views_count: (p.play_count as number) || (p.view_count as number) || 0,
        post_date: postDate(p).toISOString(),
        post_type: getPostType(p.media_type as number, p.product_type as string),
      })),
      { onConflict: 'post_id' },
    )

    // Scrape-only callers (admin Update Phase 1) stop here; a separate classify
    // pass picks up the unclassified rows afterwards.
    if (!classify) {
      return { username, postsAdded: posts.length }
    }

    const fetchedIds = posts.map((p) => String(p.pk ?? p.id))
    const { data: classifiedRows } = await supabase
      .from('instagram_posts')
      .select('post_id')
      .in('post_id', fetchedIds)
      .not('classification_source', 'is', null)

    const classifiedIds = new Set(classifiedRows?.map((r: { post_id: string }) => r.post_id) ?? [])
    const toClassify = posts.filter((p) => !classifiedIds.has(String(p.pk ?? p.id)))

    const results = await Promise.allSettled(
      toClassify.map(async (p) => {
        const { pillar, source } = await classifyPillar(
          supabase,
          captionText(p),
          (p.image_url as string) || null,
        )
        await supabase
          .from('instagram_posts')
          .update({ pillar, classification_source: source })
          .eq('post_id', String(p.pk ?? p.id))
      }),
    )
    const postsAdded = results.filter((r) => r.status === 'fulfilled').length
    return { username, postsAdded }
  } catch (err) {
    return { username, postsAdded: 0, error: String(err) }
  }
}

export interface UpdateResult {
  accountsProcessed: number
  postsAdded: number
  errors?: string[]
}

/**
 * Process the scrape-enabled accounts in `[offset, offset + limit)`. The list is
 * loaded from the DB (ordered by username) each run, so add/remove in the admin
 * page takes effect on the next scrape.
 */
export async function runUpdate(
  supabase: SupabaseClient,
  options: { offset?: number; limit?: number; classify?: boolean } = {},
): Promise<UpdateResult> {
  const accounts = await loadAccounts(supabase)
  const offset = options.offset ?? 0
  const limit = options.limit ?? accounts.length

  const slice = accounts.slice(offset, offset + limit)
  const results = await processBatch(slice, supabase, { classify: options.classify })

  const accountsProcessed = results.filter((r) => !r.error).length
  const postsAdded = results.reduce((s, r) => s + r.postsAdded, 0)
  const errors = results.filter((r) => r.error).map((r) => `${r.username}: ${r.error}`)

  return { accountsProcessed, postsAdded, ...(errors.length > 0 && { errors }) }
}

// ─── Phase 3: classify newly-scraped posts ───────────────────────────────────
// The admin Update scrapes with classify:false, so the only posts with
// classification_source IS NULL are the ones just scraped (plus any stragglers a
// prior run left behind, which we want swept up too). A post is "new/unclassified"
// when classification_source IS NULL AND it's inside the campaign window. This is
// a Deno port of classifyUnclassified in lib/run-update.ts; the batch is kept
// small so each Edge Function invocation stays well under the worker limit — the
// image fetch + base64 + vision call per post is the expensive part, so the
// client loops these batches for full coverage.

/** How many campaign-window posts still need classifying. */
export async function countUnclassified(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from('instagram_posts')
    .select('post_id', { count: 'exact', head: true })
    .is('classification_source', null)
    .gte('post_date', POST_DATE_CUTOFF.toISOString())
  return count ?? 0
}

export interface ClassifyResult {
  processed: number
  classified: number
  remaining: number
  done: boolean
  errors?: string[]
}

/**
 * Classify up to `limit` unclassified campaign-window posts (oldest first),
 * reading caption + thumbnail from the stored row. Returns `remaining` and
 * `done` so the client can loop until the whole batch of newly-scraped posts is
 * classified. `done` is true when nothing is left OR nothing progressed (all
 * failures) so a stuck batch can't loop forever.
 */
export async function classifyUnclassified(
  supabase: SupabaseClient,
  options: { limit?: number } = {},
): Promise<ClassifyResult> {
  const limit = options.limit ?? 8

  const { data: rows, error } = await supabase
    .from('instagram_posts')
    .select('post_id, caption, thumbnail_url')
    .is('classification_source', null)
    .gte('post_date', POST_DATE_CUTOFF.toISOString())
    .order('post_date', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Failed to read unclassified posts: ${error.message}`)

  const posts = rows ?? []
  if (posts.length === 0) {
    return { processed: 0, classified: 0, remaining: 0, done: true }
  }

  const errors: string[] = []
  const settled = await Promise.allSettled(
    posts.map(async (p: { post_id: string; caption: string | null; thumbnail_url: string | null }) => {
      const { pillar, source } = await classifyPillar(
        supabase,
        p.caption || '',
        p.thumbnail_url || null,
      )
      const { error: upErr } = await supabase
        .from('instagram_posts')
        .update({ pillar, classification_source: source })
        .eq('post_id', p.post_id)
      if (upErr) throw new Error(upErr.message)
    }),
  )

  let classified = 0
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') classified++
    else errors.push(`${posts[i].post_id}: ${String(r.reason)}`)
  })

  const remaining = await countUnclassified(supabase)
  const done = remaining === 0 || classified === 0

  return {
    processed: posts.length,
    classified,
    remaining,
    done,
    ...(errors.length > 0 && { errors }),
  }
}
