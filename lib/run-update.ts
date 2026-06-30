import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'
import { makeApify, runActor, getPostType, DISCOVERY_ACTOR, type ApifyItem } from '@/lib/apify'

export function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type Supabase = ReturnType<typeof makeSupabase>

// Source of truth: Honda-NewList15June.csv (155 accounts, synced 2026-06-15).
export const ACCOUNTS = [
  'hondaaristadepok.official', 'hondaaristamanggadua.id', 'honda.arta', 'hondakebonjerukofficial', 'hondamegahcinere', 'honda.megatamabekasi',
  'hondanusantarabekasi.official', 'hondanusantara.official', 'hondapondokcabe125', 'honda_tebet', 'hondatendean0119', 'hondastarmotortasik_official',
  'hondakumalaofficial', 'hondaautoserangofficial', 'hondakumalaofficial_cikampek', 'hondaautocilegonofficial', 'hondabintang_official', 'hondasolobaruofficial',
  'hondasalatigajaya.official', 'hondapatijayaa', 'hondabsb_official', 'hondaperkasaklaten_official', 'hondadaim', 'hondanagamotorntb',
  'hondapacifickediri', 'hondasuryaagung', 'hondadewata.official', 'hondaistanajbr', 'hondamitramojokerto.official', 'hondasukun',
  'hondakupangindah_', 'hondamitratuban_official', 'hondaistanabanyuwangi', 'hondamitragresik.official', 'hondapacifictulungagung', 'hondalestari',
  'hondacokro.id', 'hondabintangmadiun', 'hondaprisma', 'hondatabananbali', 'hondamajupalembang', 'hondagajahmotorofficial',
  'hondaniagabangkaofficial', 'hondaniagasudirmanofficial', 'hondaaristabandaaceh.official', 'honda.wiltop.jambi', 'hondasoekarnohattapekanbaru', 'hondaaristapekanbaru_official',
  'hondaaristaringroad', 'hondasmaminofficial', 'hondaintimobil', 'honda_kmgmanado', 'hondaselarasambon', 'hondatriopalangkaraya.id',
  'hondakmg_palu', 'hondaboneindah', 'balindomamuju_official', 'hondainternusa.makassar', 'hondaselarasternate_hst', 'hondamobil.remajajaya',
  'primautohonda', 'hondabintangusedcar', 'hondausedcarpuri', 'hondawiltop_usedcar', 'hondaanugerahusedcar', 'hondakmgcertifiedusedcar',
  'hondaunionauto', 'hondasanggarlaut.usedcar', 'honda_aldea_used_car', 'hondanenggausedcar', 'usedcarhondabintangsolo', 'ambarausedcar',
  'amarthausedcar', 'hondaaristajatinegara.id', 'hondaautolandgroup', 'hondacakrapangukir', 'hondafatmawatiofficial', 'hondaikmciledug',
  'hondaikmdaanmogot', 'imorasentul', 'hondainternusacibinong', 'hondamandiribogorofficial', 'hondamegatamakalimalang', 'hondamegatamakapuk',
  'hondamitrajatiasihofficial', 'hondamitralentengagung', 'hondapasarminggu', 'hondapurikembangan', 'hondapermatahijauofficial', 'hondabogor.id',
  'hondasunter', 'hondacijantungofficial', 'honda.lppm', 'hondamulyaputra', 'hondaayani.official', 'hondasonic368',
  'hondaeiyu', 'honda.perdanasukabumi', 'hac.hondaabadicibiru', 'ibrmcimahiofficials', 'hondaanugerah_official', 'hondaistanacarindo_official',
  'hondakusumaofficial', 'hondapekalonganmotor_official', 'hondatuguofficial', 'hondatunasjaya_official', 'hondakudusjayaofficial', 'hondategalraya_official',
  'hondasumbercilacappurwokerto', 'honda_sumber_official', 'hondajepara.official', 'hondagajahmada_official', 'hondaaristasmraja.official', 'hondaunionmotor',
  'hondanagoya', 'hondatamankota_official', 'jambi.honda', 'hondabintanpratama_', 'hondaidkcemara_official', 'hondaidk2seibatanghari',
  'hondaaristarajabasa', 'hondacikarang_', 'hondatriobanjarmasin.id', 'hondamitrajayapura', 'hondabalindoresmi', 'hondasanggarlautselatan',
  'honda.sanggarlautpalopo', 'hondamim', 'honda.martadinata2', 'hondanusantarasmd.official', 'honda_cahaya_gratia', 'hondaamartha',
  'hondadayamotorkalbar', 'hondanenggamobilindo_', 'hondanusantarabalikpapan', 'hondabintangcimone', 'honda.cibubur', 'hondaimora',
  'honda_kencana_kranji', 'hondapermataofficial', 'hondaphi', 'hondatrenalamsutera', 'honda.autobest', 'hondamuliacianjurofficial',
  'ibrmsubangofficial', 'ibrmofficial', 'hondasemarangcenter_dealer', 'hondaanugerahsejahteraofficial', 'hondamandalasenamlg', 'honda.royalwiyung',
  'hondaroyalkenjeran', 'hondasurabayacenter.imsi', 'hondaidk1medan', 'hondaaristabengkulu.official', 'hondatriobanjarbaru.id',
]

const PROFILE_PIC_BUCKET = 'profile-pics'

// Recent posts to request per account from the discovery actor. New posts since
// the last run are always near the top, so 12 (one IG page) is plenty.
const POSTS_PER_ACCOUNT = 12

// Hard floor for post dates. The discovery actor returns each account's most
// recent N posts regardless of age, so low-volume dealers drag in posts from
// years ago. The dashboard only covers the campaign window starting 2026-05-18,
// so anything older is dropped before it ever reaches the DB.
const POST_DATE_CUTOFF = new Date('2026-05-18T00:00:00Z')

/**
 * Accounts processed per cron invocation. The discovery actor
 * (sones/instagram-posts-scraper-lowcost) takes a whole batch of usernames in a
 * single run, so 40 accounts is one actor call returning ~480 posts, well under
 * the 300s function limit. The cron advances a cursor each run so the whole list
 * is covered across ceil(155/40) = 4 runs.
 */
export const CHUNK_SIZE = 40

/** Number of cron runs needed to cover the full ACCOUNTS list. */
export function chunkCount(): number {
  return Math.ceil(ACCOUNTS.length / CHUNK_SIZE)
}

/**
 * Download an Instagram CDN profile picture and store it in Supabase Storage,
 * returning a stable public URL that never expires. Instagram's signed CDN URLs
 * carry an `oe=` expiry (~7 days), so persisting them directly means avatars go
 * blank after a week. We mirror the image into our own bucket instead.
 *
 * Returns the original CDN URL as a fallback if the download/upload fails, so a
 * transient storage hiccup never wipes an account's existing picture.
 */
async function storeProfilePic(
  supabase: Supabase,
  username: string,
  cdnUrl: string | null,
): Promise<string | null> {
  if (!cdnUrl) return null
  try {
    const res = await fetch(cdnUrl)
    if (!res.ok) return cdnUrl
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return cdnUrl
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return cdnUrl

    const path = `${username}.jpg`
    const { error: upErr } = await supabase.storage
      .from(PROFILE_PIC_BUCKET)
      .upload(path, buf, { contentType, upsert: true, cacheControl: '31536000' })
    if (upErr) return cdnUrl

    return supabase.storage.from(PROFILE_PIC_BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return cdnUrl
  }
}

type AccountResult = { username: string; postsAdded: number; error?: string }

/** Pull the caption text out of sones' nested caption object. */
function captionText(p: ApifyItem): string {
  const cap = p.caption as { text?: string } | string | null | undefined
  if (typeof cap === 'string') return cap
  return cap?.text ?? ''
}

/**
 * Scrape recent posts for a batch of usernames via the discovery actor (one
 * actor run for the whole batch), then upsert + classify the results.
 *
 * Returns one AccountResult per username so the cron's accountsProcessed /
 * errors reporting stays accurate. An account that the actor returns no posts
 * for is reported with an error so it surfaces rather than silently vanishing.
 */
async function processBatch(
  usernames: string[],
  supabase: Supabase,
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

  // Group fetched posts by the account they belong to. sones tags each post with
  // the queried handle in `scraped_username` (fall back to the embedded user).
  const byAccount = new Map<string, ApifyItem[]>()
  for (const p of items) {
    const user = p.user as { username?: string } | undefined
    const owner = (p.scraped_username as string) || user?.username || ''
    if (!owner) continue
    const list = byAccount.get(owner) ?? []
    list.push(p)
    byAccount.set(owner, list)
  }

  // Refresh the profile row from the owner data embedded in any of its posts.
  await Promise.all(
    usernames.map(async (username) => {
      const posts = byAccount.get(username) ?? []
      const user = posts[0]?.user as
        | { full_name?: string; profile_pic_url?: string }
        | undefined
      if (!user) return
      const profilePicUrl = await storeProfilePic(
        supabase,
        username,
        user.profile_pic_url || null,
      )
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
    usernames.map((username) => upsertAccountPosts(username, byAccount.get(username) ?? [], supabase)),
  )
}

/** Unix `taken_at` (seconds) → Date. */
function postDate(p: ApifyItem): Date {
  return new Date((p.taken_at as number) * 1000)
}

/** Upsert + classify the fetched posts for a single account. */
async function upsertAccountPosts(
  username: string,
  allPosts: ApifyItem[],
  supabase: Supabase,
): Promise<AccountResult> {
  if (allPosts.length === 0) {
    return { username, postsAdded: 0, error: 'no posts returned' }
  }
  // Drop anything before the campaign window so old posts never enter the DB.
  const posts = allPosts.filter((p) => postDate(p) >= POST_DATE_CUTOFF)
  if (posts.length === 0) {
    return { username, postsAdded: 0 }
  }
  try {
    // Upsert all fetched posts to refresh thumbnail_url + metrics.
    // Columns not provided (pillar, classification_source) are preserved for existing rows.
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

    // Classify every fetched post that hasn't been classified yet. The `pillar`
    // column defaults to 'Negative', so "has a pillar" is NOT a reliable signal
    // — classification_source IS NULL means it was never actually classified.
    const fetchedIds = posts.map((p) => String(p.pk ?? p.id))
    const { data: classifiedRows } = await supabase
      .from('instagram_posts')
      .select('post_id')
      .in('post_id', fetchedIds)
      .not('classification_source', 'is', null)

    const classifiedIds = new Set(classifiedRows?.map((r) => r.post_id) ?? [])
    const toClassify = posts.filter((p) => !classifiedIds.has(String(p.pk ?? p.id)))

    const results = await Promise.allSettled(
      toClassify.map(async (p) => {
        const { pillar, source } = await classifyPillar(
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
  dateFrom: string
  dateTo: string
  accountsProcessed: number
  postsAdded: number
  errors?: string[]
}

/**
 * Process accounts in `[offset, offset + limit)` of the ACCOUNTS list.
 *
 * Scraping all 155 accounts in one invocation took ~315s — over the 300s
 * function limit — so every weekly run was killed ~position 18, permanently
 * stranding every dealer after it (R1/R2/Surabaya/most of Semarang). Splitting
 * the list across several short invocations keeps each run well under the
 * limit; see CHUNK_SIZE / chunkCount() and the cursor logic in the cron route.
 *
 * `offset`/`limit` default to the whole list so manual/script callers and tests
 * keep the old "scrape everything" behaviour.
 */
export async function runUpdate(
  supabase: Supabase,
  options: { offset?: number; limit?: number; dateFrom?: Date; dateTo?: Date } = {},
): Promise<UpdateResult> {
  let { dateFrom, dateTo } = options
  const offset = options.offset ?? 0
  const limit = options.limit ?? ACCOUNTS.length

  // Auto-calculate date range if not provided
  if (!dateFrom) {
    const { data } = await supabase
      .from('instagram_posts')
      .select('post_date')
      .order('post_date', { ascending: false })
      .limit(1)
      .single()
    const latest = data?.post_date ? new Date(data.post_date) : new Date('2026-05-31')
    latest.setUTCDate(latest.getUTCDate() + 1)
    latest.setUTCHours(0, 0, 0, 0)
    dateFrom = latest
  }

  if (!dateTo) {
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    yesterday.setUTCHours(23, 59, 59, 999)
    dateTo = yesterday
  }

  const slice = ACCOUNTS.slice(offset, offset + limit)

  // The discovery actor handles a whole batch of usernames in one run, so the
  // slice goes through in a single actor call.
  const results = await processBatch(slice, supabase)

  const accountsProcessed = results.filter((r) => !r.error).length
  const postsAdded = results.reduce((s, r) => s + r.postsAdded, 0)
  const errors = results.filter((r) => r.error).map((r) => `${r.username}: ${r.error}`)

  return {
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: dateTo.toISOString().slice(0, 10),
    accountsProcessed,
    postsAdded,
    ...(errors.length > 0 && { errors }),
  }
}
