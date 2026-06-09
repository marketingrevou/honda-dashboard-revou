import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

const AUTH_TOKEN = 'hrd2026-authenticated'
const BATCH_SIZE = 5

const ACCOUNTS = [
  'imorasentul', 'hondakebonjerukofficial', 'hondamitralentengagung', 'hondapasarminggu',
  'honda.lppm', 'hondastarmotortasik_official', 'hondaautoserangofficial', 'hondasonic368',
  'hondaeiyu', 'honda.perdanasukabumi', 'hondamuliacianjurofficial', 'hac.hondaabadicibiru',
  'ibrmcimahiofficials', 'hondakumalaofficial_cikampek', 'hondaautocilegonofficial',
  'ibrmsubangofficial', 'ibrmofficial',
  'hondapekalonganmotor_official', 'hondatuguofficial', 'hondatunasjaya_official',
  'hondasolobaruofficial', 'hondakudusjayaofficial', 'hondasemarangcenter_dealer',
  'hondategalraya_official', 'hondasalatigajaya.official', 'hondaanugerahsejahteraofficial',
  'hondasumbercilacappurwokerto', 'hondapatijayaa', 'honda_sumber_official', 'hondabsb_official',
  'hondaperkasaklaten_official', 'hondajepara.official', 'hondagajahmada_official',
  'hondanagamotorntb', 'hondadewata.official', 'hondaistanajbr', 'hondamitramojokerto.official',
  'hondasukun', 'hondakupangindah_', 'hondamitratuban_official', 'hondaistanabanyuwangi',
  'hondamitragresik.official', 'hondapacifictulungagung', 'hondalestari', 'honda.royalwiyung',
  'hondaroyalkenjeran', 'hondacokro.id', 'hondabintangmadiun', 'hondaprisma',
  'hondatabananbali', 'hondasurabayacenter.imsi',
  'hondaaristasmraja.official', 'hondagajahmotorofficial', 'hondaunionmotor', 'hondanagoya',
  'hondatamankota_official', 'hondaniagabangkaofficial', 'hondaniagasudirmanofficial',
  'jambi.honda', 'hondabintanpratama_', 'hondaaristabandaaceh.official',
  'hondaidkcemara_official', 'hondaidk1medan', 'hondaidk2seibatanghari', 'honda.wiltop.jambi',
  'hondaaristabengkulu.official', 'hondasoekarnohattapekanbaru', 'hondaaristarajabasa',
  'hondaaristapekanbaru_official', 'hondacikarang_', 'hondaaristaringroad',
  'hondasmaminofficial', 'hondaintimobil',
  'honda_kmgmanado', 'hondaselarasambon', 'hondatriobanjarmasin.id', 'hondamitrajayapura',
  'hondatriopalangkaraya.id', 'hondakmg_palu', 'hondatriobanjarbaru.id', 'hondabalindoresmi',
  'hondasanggarlautselatan', 'honda.sanggarlautpalopo', 'hondamim', 'hondaboneindah',
  'honda.martadinata2', 'hondanusantarasmd.official', 'honda_cahaya_gratia',
  'balindomamuju_official', 'hondainternusa.makassar', 'hondaamartha', 'hondadayamotorkalbar',
  'hondaselarasternate_hst', 'hondamobil.remajajaya', 'hondanenggamobilindo_',
  'hondanusantarabalikpapan',
  'primautohonda', 'hondabintangusedcar', 'hondausedcarpuri', 'hondawiltop_usedcar',
  'hondaanugerahusedcar', 'hondakmgcertifiedusedcar', 'hondaunionauto',
  'hondasanggarlaut.usedcar', 'honda_aldea_used_car', 'hondanenggausedcar',
  'usedcarhondabintangsolo', 'ambarausedcar', 'amarthausedcar',
]

const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'

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
  supabase: ReturnType<typeof createClient>,
): Promise<AccountResult> {
  try {
    const profile = await fetchUserInfo(username)

    await supabase.from('instagram_accounts').upsert(
      {
        username,
        full_name: profile.full_name || username,
        profile_picture_url: profile.profile_pic_url || null,
        followers_count: profile.follower_count || 0,
        following_count: profile.following_count || 0,
        biography: profile.biography || '',
        scraped_at: new Date().toISOString(),
      },
      { onConflict: 'username' },
    )

    const allPosts = await fetchUserPosts(username, 50)
    const posts = allPosts.filter((p: Record<string, unknown>) => {
      if (!p.taken_at) return false
      const d = new Date((p.taken_at as number) * 1000)
      return d >= dateFrom && d <= dateTo
    })

    // Classify all posts for this account in parallel
    const classified = await Promise.allSettled(
      (posts as Record<string, unknown>[]).map(async (p) => {
        const caption: string = (p.caption as Record<string, string>)?.text || ''
        const thumbnailUrl: string | null = (p.thumbnail_url as string) || null
        const postType = getPostType(p.media_type as number, p.product_type as string)
        const postDate = new Date((p.taken_at as number) * 1000).toISOString()

        const { pillar, source } = await classifyPillar(caption, thumbnailUrl)

        await supabase.from('instagram_posts').upsert(
          {
            account_username: username,
            post_id: String(p.id),
            post_url: `https://www.instagram.com/p/${p.code}/`,
            thumbnail_url: thumbnailUrl,
            caption,
            likes_count: (p.like_count as number) || 0,
            comments_count: (p.comment_count as number) || 0,
            views_count: (p.play_count as number) || (p.view_count as number) || 0,
            post_date: postDate,
            post_type: postType,
            pillar,
            classification_source: source,
          },
          { onConflict: 'post_id' },
        )
      }),
    )

    const postsAdded = classified.filter((r) => r.status === 'fulfilled').length
    return { username, postsAdded }
  } catch (err) {
    return { username, postsAdded: 0, error: String(err) }
  }
}

export async function POST(req: NextRequest) {
  // Auth check
  const cookieStore = await cookies()
  const auth = cookieStore.get('honda_auth')
  if (auth?.value !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Determine date range
  let dateFrom: Date
  let dateTo: Date

  try {
    const body = await req.json()
    dateFrom = body.dateFrom ? new Date(body.dateFrom) : null!
    dateTo = body.dateTo ? new Date(body.dateTo) : null!
  } catch {
    dateFrom = null!
    dateTo = null!
  }

  // Auto-calculate if not provided
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

  const dateFromStr = dateFrom.toISOString().slice(0, 10)
  const dateToStr = dateTo.toISOString().slice(0, 10)

  // Process accounts in parallel batches
  const results: AccountResult[] = []
  for (let i = 0; i < ACCOUNTS.length; i += BATCH_SIZE) {
    const batch = ACCOUNTS.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map((username) => processAccount(username, dateFrom, dateTo, supabase)),
    )
    results.push(...batchResults)
  }

  const accountsProcessed = results.filter((r) => !r.error).length
  const postsAdded = results.reduce((s, r) => s + r.postsAdded, 0)
  const errors = results.filter((r) => r.error).map((r) => `${r.username}: ${r.error}`)

  revalidatePath('/dashboard')

  return NextResponse.json({
    success: true,
    dateFrom: dateFromStr,
    dateTo: dateToStr,
    accountsProcessed,
    postsAdded,
    ...(errors.length > 0 && { errors }),
  })
}
