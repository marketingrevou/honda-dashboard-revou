/**
 * Run: node --env-file=.env.local scripts/scrape.mjs
 * Scrapes 10 Honda Instagram accounts via Apify and stores results in Supabase.
 */

import { ApifyClient } from 'apify-client'
import { createClient } from '@supabase/supabase-js'

const ACCOUNTS = [
  'hondaaristadepok.official',
  'hondaaristajatinegara.id',
  'hondaaristamanggadua.id',
  'hondamulyaputra',
  'honda.autobest',
  'hondaanugerah_official',
  'hondabintang_official',
  'hondadaim',
  'hondamandalasenamlg',
  'hondamajupalembang',
]

const DATE_FROM = new Date('2026-05-01T00:00:00Z')
const DATE_TO = new Date('2026-06-02T23:59:59Z')

const PILLAR_KEYWORDS = {
  'Product Value & Information': [
    'brv', 'hrv', 'wrv', 'crv', 'brio', 'city', 'accord', 'odyssey', 'jazz',
    'civic', 'mobilio', 'br-v', 'hr-v', 'wr-v', 'cr-v', 'e:hev', 'ehev',
    'hybrid', 'fitur', 'spesifikasi', 'test drive', 'testdrive',
    'mesin', 'bbm', 'bahan bakar', 'konsumsi', 'torsi', 'transmisi',
    'cvt', 'tips', 'perawatan', 'ganti oli', 'harga', 'otr',
    'booking', 'indent', 'dp ', 'cicilan', 'kredit',
    'sensor', 'honda sensing', 'ground clearance', 'kapasitas bagasi',
  ],
  'Dealer Credibility': [
    'tim kami', 'team kami', 'mekanik', 'sales advisor',
    'hari nasional', 'hari buruh', 'hari kemerdekaan', 'hari raya',
    'lebaran', 'idul fitri', 'idul adha', 'natal', 'tahun baru',
    'anniversary', 'ulang tahun', 'operasional', 'tutup sementara',
    'jam buka', 'penghargaan', 'award', 'terpercaya',
    'kenalan', 'behind the scene', 'bengkel resmi',
  ],
  'Customer Story': [
    'testimoni', 'testimonial', 'pelanggan', 'customer kami',
    'serah terima', 'delivery day', 'terima kunci', 'ambil unit',
    'review mobil', 'ulasan', 'pengalaman berkendara', 'cerita',
    'puas', 'happy customer', 'konsumen', 'pembeli',
  ],
  'Promo Activation': [
    'promo', 'diskon', 'discount', 'cashback', 'bonus',
    'quiz', 'kuis', 'giveaway', 'hadiah', 'undian',
    'event', 'pameran', 'kontes', 'lomba',
    'gratis', 'voucher', 'merchandise', 'gift',
    'pemenang', 'winner', 'program cicilan',
  ],
}

function classifyPillar(caption) {
  if (!caption) return 'Negative'
  const lower = caption.toLowerCase()
  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return pillar
  }
  return 'Negative'
}

async function main() {
  const apify = new ApifyClient({ token: process.env.APIFY_TOKEN })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )

  console.log('Starting Instagram scrape for', ACCOUNTS.length, 'accounts')
  console.log('Date range:', DATE_FROM.toDateString(), '→', DATE_TO.toDateString())
  console.log('─'.repeat(60))

  for (const username of ACCOUNTS) {
    console.log(`\n[${username}] Scraping...`)

    try {
      // Step 1: scrape profile details
      const profileRun = await apify.actor('apify/instagram-scraper').call({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: 'details',
        resultsLimit: 1,
      })
      const profileDataset = await apify.dataset(profileRun.defaultDatasetId).listItems()
      const profile = profileDataset.items[0] ?? {}

      const profilePicUrl =
        profile.profilePicUrl ||
        profile.profilePicUrlHD ||
        null

      console.log(`  Profile: ${profile.fullName || username}, pic: ${profilePicUrl ? 'OK' : 'missing'}`)

      // Upsert account
      const { error: accErr } = await supabase.from('instagram_accounts').upsert(
        {
          username,
          full_name: profile.fullName || username,
          profile_picture_url: profilePicUrl,
          followers_count: profile.followersCount || 0,
          following_count: profile.followsCount || 0,
          biography: profile.biography || '',
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'username' },
      )
      if (accErr) console.error('  Account upsert error:', accErr.message)

      // Step 2: scrape posts
      const postsRun = await apify.actor('apify/instagram-scraper').call({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: 'posts',
        resultsLimit: 200,
      })
      const postsDataset = await apify.dataset(postsRun.defaultDatasetId).listItems()
      const allPosts = postsDataset.items

      // Filter by date range
      const posts = allPosts.filter((p) => {
        if (!p.timestamp) return false
        const d = new Date(p.timestamp)
        return d >= DATE_FROM && d <= DATE_TO
      })

      console.log(`  Posts in range: ${posts.length} / ${allPosts.length} total`)

      let upserted = 0
      for (const p of posts) {
        const pillar = classifyPillar(p.caption || '')
        const { error: postErr } = await supabase.from('instagram_posts').upsert(
          {
            account_username: username,
            post_id: String(p.id || p.shortCode),
            post_url: `https://www.instagram.com/p/${p.shortCode}/`,
            thumbnail_url: p.displayUrl || p.thumbnailUrl || null,
            caption: p.caption || '',
            likes_count: p.likesCount || 0,
            comments_count: p.commentsCount || 0,
            views_count: p.videoViewCount || 0,
            post_date: p.timestamp || null,
            post_type: p.type || 'image',
            pillar,
          },
          { onConflict: 'post_id' },
        )
        if (postErr) console.error('  Post upsert error:', postErr.message)
        else upserted++
      }

      console.log(`  Stored: ${upserted} posts`)
    } catch (err) {
      console.error(`  ERROR: ${err.message}`)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log('Scrape complete!')
}

main().catch(console.error)
