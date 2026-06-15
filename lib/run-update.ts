import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

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

const BATCH_SIZE = 5
const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'
const PROFILE_PIC_BUCKET = 'profile-pics'

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

function rapidapiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
  }
}

function getPostType(mediaType: number, productType: string): string {
  if (mediaType === 8) return 'carousel'
  if (mediaType === 2) return productType === 'clips' ? 'reel' : 'video'
  return 'image'
}

async function fetchUserInfo(username: string) {
  const res = await fetch(`${BASE_URL}/userinfo/?username_or_id=${username}`, {
    headers: rapidapiHeaders(),
  })
  const json = await res.json()
  return json.data
}

async function fetchUserPosts(username: string, count = 50) {
  const res = await fetch(
    `${BASE_URL}/userposts/?username_or_id=${username}&count=${count}`,
    { headers: rapidapiHeaders() },
  )
  const json = await res.json()
  return json.data?.items ?? []
}

type AccountResult = { username: string; postsAdded: number; error?: string }

async function processAccount(
  username: string,
  dateFrom: Date,
  dateTo: Date,
  supabase: Supabase,
): Promise<AccountResult> {
  try {
    const profile = await fetchUserInfo(username)

    const profilePicUrl = await storeProfilePic(
      supabase,
      username,
      profile.profile_pic_url || null,
    )

    await supabase.from('instagram_accounts').upsert(
      {
        username,
        full_name: profile.full_name || username,
        profile_picture_url: profilePicUrl,
        followers_count: profile.follower_count || 0,
        following_count: profile.following_count || 0,
        biography: profile.biography || '',
        scraped_at: new Date().toISOString(),
      },
      { onConflict: 'username' },
    )

    const allPosts = await fetchUserPosts(username, 50)

    // Upsert ALL 50 fetched posts to refresh thumbnail_url + metrics.
    // Columns not provided (pillar, classification_source) are preserved for existing rows.
    await supabase.from('instagram_posts').upsert(
      (allPosts as Record<string, unknown>[]).map((p) => ({
        post_id: String(p.id),
        account_username: username,
        post_url: `https://www.instagram.com/p/${p.code}/`,
        thumbnail_url: (p.thumbnail_url as string) || null,
        caption: (p.caption as Record<string, string>)?.text || '',
        likes_count: (p.like_count as number) || 0,
        comments_count: (p.comment_count as number) || 0,
        views_count: (p.play_count as number) || (p.view_count as number) || 0,
        post_date: new Date((p.taken_at as number) * 1000).toISOString(),
        post_type: getPostType(p.media_type as number, p.product_type as string),
      })),
      { onConflict: 'post_id' },
    )

    // Classify only in-range posts that don't yet have a pillar.
    const inRange = (allPosts as Record<string, unknown>[]).filter((p) => {
      if (!p.taken_at) return false
      const d = new Date((p.taken_at as number) * 1000)
      return d >= dateFrom && d <= dateTo
    })

    let postsAdded = 0
    if (inRange.length > 0) {
      const { data: alreadyClassified } = await supabase
        .from('instagram_posts')
        .select('post_id')
        .in('post_id', inRange.map((p) => String(p.id)))
        .not('pillar', 'is', null)

      const classifiedIds = new Set(alreadyClassified?.map((r) => r.post_id) ?? [])
      const toClassify = inRange.filter((p) => !classifiedIds.has(String(p.id)))

      const results = await Promise.allSettled(
        toClassify.map(async (p) => {
          const caption: string = (p.caption as Record<string, string>)?.text || ''
          const thumbnailUrl: string | null = (p.thumbnail_url as string) || null
          const { pillar, source } = await classifyPillar(caption, thumbnailUrl)
          await supabase
            .from('instagram_posts')
            .update({ pillar, classification_source: source })
            .eq('post_id', String(p.id))
        }),
      )
      postsAdded = results.filter((r) => r.status === 'fulfilled').length
    }

    return { username, postsAdded }
  } catch (err) {
    return { username, postsAdded: 0, error: String(err) }
  }
}

export interface RefreshResult {
  accountsProcessed: number
  thumbnailsRefreshed: number
  errors?: string[]
}

/**
 * Refresh expiring CDN thumbnail URLs for every account that has posts in the
 * DB. Instagram's signed thumbnail URLs expire after ~7 days, so this is meant
 * to run on a daily cron to keep them fresh.
 *
 * For each account we fetch its latest 50 posts from RapidAPI and update
 * thumbnail_url for any post_id we already have. Posts that have scrolled out
 * of the recent-50 window can't be refreshed this way (the API no longer
 * returns them) — those are handled separately via the Apify re-scrape.
 */
export async function refreshThumbnails(
  supabase: Supabase,
): Promise<RefreshResult> {
  // Distinct accounts that actually have posts in the DB.
  const { data: rows, error } = await supabase
    .from('instagram_posts')
    .select('account_username')
    .not('account_username', 'is', null)

  if (error) {
    return { accountsProcessed: 0, thumbnailsRefreshed: 0, errors: [error.message] }
  }

  const accounts = [...new Set((rows ?? []).map((r) => r.account_username as string))]

  let thumbnailsRefreshed = 0
  const errors: string[] = []

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (username) => {
        try {
          const posts = await fetchUserPosts(username, 50)
          if (!posts.length) return 0

          const updates = (posts as Record<string, unknown>[])
            .filter((p) => p.id && p.thumbnail_url)
            .map((p) => ({
              post_id: String(p.id),
              thumbnail_url: p.thumbnail_url as string,
            }))

          let refreshed = 0
          for (const u of updates) {
            const { error: upErr, count } = await supabase
              .from('instagram_posts')
              .update({ thumbnail_url: u.thumbnail_url }, { count: 'exact' })
              .eq('post_id', u.post_id)
            if (upErr) {
              errors.push(`${username}/${u.post_id}: ${upErr.message}`)
            } else if (count) {
              refreshed += count
            }
          }
          return refreshed
        } catch (err) {
          errors.push(`${username}: ${String(err)}`)
          return 0
        }
      }),
    )
    thumbnailsRefreshed += batchResults.reduce((s, n) => s + n, 0)
  }

  return {
    accountsProcessed: accounts.length,
    thumbnailsRefreshed,
    ...(errors.length > 0 && { errors }),
  }
}

export interface UpdateResult {
  dateFrom: string
  dateTo: string
  accountsProcessed: number
  postsAdded: number
  errors?: string[]
}

export async function runUpdate(
  supabase: Supabase,
  dateFrom?: Date,
  dateTo?: Date,
): Promise<UpdateResult> {
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

  const results: AccountResult[] = []
  for (let i = 0; i < ACCOUNTS.length; i += BATCH_SIZE) {
    const batch = ACCOUNTS.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map((username) => processAccount(username, dateFrom!, dateTo!, supabase)),
    )
    results.push(...batchResults)
  }

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
