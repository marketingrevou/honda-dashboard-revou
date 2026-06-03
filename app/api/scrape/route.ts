import { NextResponse } from 'next/server'
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

const PILLAR_KEYWORDS: Record<string, string[]> = {
  'Product Value & Information': [
    'brv', 'hrv', 'wrv', 'crv', 'brio', 'city', 'accord', 'odyssey', 'jazz',
    'civic', 'mobilio', 'br-v', 'hr-v', 'wr-v', 'cr-v', 'e:hev', 'ehev',
    'hybrid', 'fitur', 'spesifikasi', 'specs', 'test drive', 'testdrive',
    'mesin', 'engine', 'bbm', 'bahan bakar', 'konsumsi', 'torsi', 'transmisi',
    'cvt', 'tips', 'perawatan', 'servis', 'service', 'bengkel', 'ganti oli',
    'harga', 'price', 'otr', 'booking', 'indent', 'dp', 'cicilan', 'kredit',
    'sensor', 'honda sensing', 'ground clearance', 'kapasitas', 'bagasi',
  ],
  'Dealer Credibility': [
    'tim', 'team', 'mekanik', 'sales advisor', 'showroom', 'dealer',
    'hari nasional', 'hari buruh', 'hari kemerdekaan', 'hari raya',
    'lebaran', 'idul', 'natal', 'tahun baru', 'anniversary',
    'operasional', 'tutup', 'buka', 'jam operasional',
    'penghargaan', 'award', 'terbaik', 'kepercayaan',
    'kenalan', 'profil', 'about us',
  ],
  'Customer Story': [
    'testimoni', 'testimonial', 'customer', 'pelanggan', 'pembeli',
    'serah terima', 'delivery', 'terima kunci', 'ambil unit',
    'review', 'ulasan', 'pengalaman', 'cerita', 'story',
    'puas', 'satisfied', 'rekomen', 'recommend',
  ],
  'Promo Activation': [
    'promo', 'diskon', 'discount', 'cashback', 'bonus',
    'quiz', 'kuis', 'giveaway', 'hadiah', 'prize', 'undian',
    'event', 'pameran', 'exhibition', 'kontes', 'lomba',
    'free', 'gratis', 'voucher', 'merchandise', 'gift',
    'menang', 'pemenang', 'winner',
  ],
}

function classifyPillar(caption: string): string {
  if (!caption) return 'Negative'
  const lower = caption.toLowerCase()
  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return pillar
  }
  return 'Negative'
}

export async function POST() {
  const apify = new ApifyClient({ token: process.env.APIFY_TOKEN })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )

  const results: Record<string, unknown>[] = []

  for (const username of ACCOUNTS) {
    try {
      // Run Instagram profile + posts scraper
      const run = await apify.actor('apify/instagram-scraper').call({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: 'posts',
        resultsLimit: 100,
        searchType: 'user',
        searchLimit: 1,
        addParentData: true,
        // only posts from May 1 to Jun 2 2026
        onlyPostsNewerThan: '2026-05-01',
      })

      const dataset = await apify.dataset(run.defaultDatasetId).listItems()
      const posts = dataset.items

      if (!posts.length) {
        results.push({ username, status: 'no_posts' })
        continue
      }

      // Profile data comes from the first post's ownerFullName / ownerUsername
      const sample = posts[0] as Record<string, unknown>
      const profilePicUrl =
        (sample.ownerProfilePicUrl as string) ||
        (sample.profilePicUrl as string) ||
        null
      const fullName =
        (sample.ownerFullName as string) ||
        (sample.ownerUsername as string) ||
        username

      // Upsert account
      await supabase.from('instagram_accounts').upsert(
        {
          username,
          full_name: fullName,
          profile_picture_url: profilePicUrl,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'username' },
      )

      // Filter posts within range and upsert each
      const filtered = posts.filter((p: Record<string, unknown>) => {
        const ts = p.timestamp as string
        if (!ts) return false
        const d = new Date(ts)
        return d >= new Date('2026-05-01') && d <= new Date('2026-06-02T23:59:59Z')
      })

      for (const p of filtered as Record<string, unknown>[]) {
        const pillar = classifyPillar((p.caption as string) || '')
        await supabase.from('instagram_posts').upsert(
          {
            account_username: username,
            post_id: (p.id as string) || (p.shortCode as string),
            post_url: `https://www.instagram.com/p/${p.shortCode}/`,
            thumbnail_url:
              (p.displayUrl as string) ||
              (p.thumbnailUrl as string) ||
              null,
            caption: (p.caption as string) || '',
            likes_count: (p.likesCount as number) || 0,
            comments_count: (p.commentsCount as number) || 0,
            views_count: (p.videoViewCount as number) || 0,
            post_date: (p.timestamp as string) || null,
            post_type: (p.type as string) || 'image',
            pillar,
          },
          { onConflict: 'post_id' },
        )
      }

      results.push({ username, status: 'ok', postsScraped: filtered.length })
    } catch (err) {
      results.push({ username, status: 'error', error: String(err) })
    }
  }

  return NextResponse.json({ success: true, results })
}
