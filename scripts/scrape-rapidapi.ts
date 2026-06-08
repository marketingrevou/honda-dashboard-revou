/**
 * Run: npx tsx --env-file=.env.local scripts/scrape-rapidapi.ts
 *
 * Flow:
 *  1. RapidAPI  → scrape Instagram profile + posts
 *  2. GPT-4o mini → analyze thumbnail when caption keywords give no match
 *  3. Supabase  → upsert account + posts with pillar classification
 */

import { createClient } from '@supabase/supabase-js'
import { classifyPillar } from '@/lib/classify-pillar'

const ACCOUNTS = [
  // Jakarta Center — previously failed
  'imorasentul',
  'hondakebonjerukofficial',
  'hondamitralentengagung',
  'hondapasarminggu',
  // Bandung Center
  'honda.lppm',
  'hondastarmotortasik_official',
  'hondaautoserangofficial',
  'hondasonic368',
  'hondaeiyu',
  'honda.perdanasukabumi',
  'hondamuliacianjurofficial',
  'hac.hondaabadicibiru',
  'ibrmcimahiofficials',
  'hondakumalaofficial_cikampek',
  'hondaautocilegonofficial',
  'ibrmsubangofficial',
  'ibrmofficial',
  // Semarang Center
  'hondapekalonganmotor_official',
  'hondatuguofficial',
  'hondatunasjaya_official',
  'hondasolobaruofficial',
  'hondakudusjayaofficial',
  'hondasemarangcenter_dealer',
  'hondategalraya_official',
  'hondasalatigajaya.official',
  'hondaanugerahsejahteraofficial',
  'hondasumbercilacappurwokerto',
  'hondapatijayaa',
  'honda_sumber_official',
  'hondabsb_official',
  'hondaperkasaklaten_official',
  'hondajepara.official',
  'hondagajahmada_official',
  // Surabaya Center
  'hondanagamotorntb',
  'hondadewata.official',
  'hondaistanajbr',
  'hondamitramojokerto.official',
  'hondasukun',
  'hondakupangindah_',
  'hondamitratuban_official',
  'hondaistanabanyuwangi',
  'hondamitragresik.official',
  'hondapacifictulungagung',
  'hondalestari',
  'honda.royalwiyung',
  'hondaroyalkenjeran',
  'hondacokro.id',
  'hondabintangmadiun',
  'hondaprisma',
  'hondatabananbali',
  'hondasurabayacenter.imsi',
  // Outside Java R1
  'hondaaristasmraja.official',
  'hondagajahmotorofficial',
  'hondaunionmotor',
  'hondanagoya',
  'hondatamankota_official',
  'hondaniagabangkaofficial',
  'hondaniagasudirmanofficial',
  'jambi.honda',
  'hondabintanpratama_',
  'hondaaristabandaaceh.official',
  'hondaidkcemara_official',
  'hondaidk1medan',
  'hondaidk2seibatanghari',
  'honda.wiltop.jambi',
  'hondaaristabengkulu.official',
  'hondasoekarnohattapekanbaru',
  'hondaaristarajabasa',
  'hondaaristapekanbaru_official',
  'hondacikarang_',
  'hondaaristaringroad',
  'hondasmaminofficial',
  'hondaintimobil',
  // Outside Java R2
  'honda_kmgmanado',
  'hondaselarasambon',
  'hondatriobanjarmasin.id',
  'hondamitrajayapura',
  'hondatriopalangkaraya.id',
  'hondakmg_palu',
  'hondatriobanjarbaru.id',
  'hondabalindoresmi',
  'hondasanggarlautselatan',
  'honda.sanggarlautpalopo',
  'hondamim',
  'hondaboneindah',
  'honda.martadinata2',
  'hondanusantarasmd.official',
  'honda_cahaya_gratia',
  'balindomamuju_official',
  'hondainternusa.makassar',
  'hondaamartha',
  'hondadayamotorkalbar',
  'hondaselarasternate_hst',
  'hondamobil.remajajaya',
  'hondanenggamobilindo_',
  'hondanusantarabalikpapan',
  // Used Cars
  'primautohonda',
  'hondabintangusedcar',
  'hondausedcarpuri',
  'hondawiltop_usedcar',
  'hondaanugerahusedcar',
  'hondakmgcertifiedusedcar',
  'hondaunionauto',
  'hondasanggarlaut.usedcar',
  'honda_aldea_used_car',
  'hondanenggausedcar',
  'usedcarhondabintangsolo',
  'ambarausedcar',
  'amarthausedcar',
]

const DATE_FROM = new Date('2026-05-18T00:00:00Z')
const DATE_TO = new Date('2026-05-31T23:59:59Z')

const BASE_URL = 'https://instagram-scraper-20251.p.rapidapi.com'
const RAPIDAPI_HEADERS = {
  'Content-Type': 'application/json',
  'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
}

function getPostType(mediaType: number, productType: string): string {
  if (mediaType === 8) return 'carousel'
  if (mediaType === 2) return productType === 'clips' ? 'reel' : 'video'
  return 'image'
}

async function fetchUserInfo(username: string) {
  const res = await fetch(`${BASE_URL}/userinfo/?username_or_id=${username}`, {
    headers: RAPIDAPI_HEADERS,
  })
  const json = await res.json()
  return json.data
}

async function fetchUserPosts(username: string, count = 50) {
  const res = await fetch(
    `${BASE_URL}/userposts/?username_or_id=${username}&count=${count}`,
    { headers: RAPIDAPI_HEADERS },
  )
  const json = await res.json()
  return json.data?.items ?? []
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )

  console.log('Starting Instagram scrape via RapidAPI for', ACCOUNTS.length, 'account(s)')
  console.log('Date range:', DATE_FROM.toDateString(), '→', DATE_TO.toDateString())
  console.log('Vision fallback: GPT-4o mini')
  console.log('─'.repeat(60))

  for (const username of ACCOUNTS) {
    console.log(`\n[${username}] Fetching profile...`)

    try {
      // Step 1: RapidAPI → profile
      const profile = await fetchUserInfo(username)
      console.log(`  Name:      ${profile.full_name}`)
      console.log(`  Followers: ${profile.follower_count}`)

      const { error: accErr } = await supabase.from('instagram_accounts').upsert(
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
      if (accErr) console.error('  Account upsert error:', accErr.message)
      else console.log('  Account upserted ✓')

      // Step 2: RapidAPI → posts
      console.log(`\n[${username}] Fetching posts...`)
      const allPosts = await fetchUserPosts(username, 50)
      const posts = allPosts.filter((p: any) => {
        if (!p.taken_at) return false
        const d = new Date(p.taken_at * 1000)
        return d >= DATE_FROM && d <= DATE_TO
      })
      console.log(`  Fetched: ${allPosts.length} total, ${posts.length} in date range`)

      let upserted = 0
      for (const p of posts) {
        const caption: string = p.caption?.text || ''
        const thumbnailUrl: string | null = p.thumbnail_url || null
        const postType = getPostType(p.media_type, p.product_type)
        const postDate = new Date(p.taken_at * 1000).toISOString()

        // Step 3: AI pipeline — caption AI first, vision fallback if Negative
        const { pillar, source } = await classifyPillar(caption, thumbnailUrl)
        console.log(`  → ${p.code}  ${postDate.slice(0, 10)}  ${postType.padEnd(9)}  [${pillar}]  (${source})`)

        // Step 4: Supabase upsert
        const { error: postErr } = await supabase.from('instagram_posts').upsert(
          {
            account_username: username,
            post_id: String(p.id),
            post_url: `https://www.instagram.com/p/${p.code}/`,
            thumbnail_url: thumbnailUrl,
            caption,
            likes_count: p.like_count || 0,
            comments_count: p.comment_count || 0,
            views_count: p.play_count || p.view_count || 0,
            post_date: postDate,
            post_type: postType,
            pillar,
          },
          { onConflict: 'post_id' },
        )
        if (postErr) console.error('    Upsert error:', postErr.message)
        else upserted++
      }

      console.log(`\n  Stored: ${upserted} / ${posts.length} posts ✓`)
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log('Done!')
}

main().catch(console.error)
