import { cacheLife } from 'next/cache'
import { supabase } from './supabase'
import type { InstagramAccount, PillarLabel, Post, PostCategory, PostFormat, TrendRawPost } from './types'

function pillarToCategory(pillar: string | null): PostCategory {
  switch (pillar) {
    case 'Product Value & Information': return 'Product Info'
    case 'Dealer Credibility': return 'Credibility'
    case 'Promo Activation': return 'Promo'
    default: return 'Product Info'
  }
}

function typeToFormat(type: string | null): PostFormat {
  const t = (type ?? '').toLowerCase()
  if (t === 'video' || t.includes('reel')) return 'Reels'
  if (t === 'sidecar' || t.includes('carousel') || t.includes('album')) return 'Carousel'
  return 'Static Post'
}

function formatPostDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function getTopPosts(): Promise<Post[]> {
  'use cache'
  cacheLife('max')
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('post_id, account_username, thumbnail_url, caption, likes_count, comments_count, views_count, post_date, post_type, pillar, post_url')
    .gte('post_date', '2026-05-18')
    .lte('post_date', '2026-05-31')

  if (!posts?.length) return []

  const usernames = [...new Set(posts.map((p) => p.account_username))]
  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('username, profile_picture_url')
    .in('username', usernames)

  const accountMap = new Map((accounts ?? []).map((a) => [a.username, a]))

  return posts.map((p) => ({
    id: p.post_id,
    accountHandle: `@${p.account_username}`,
    profileImageSrc: accountMap.get(p.account_username)?.profile_picture_url ?? '',
    date: formatPostDate(p.post_date),
    postImageSrc: p.thumbnail_url ?? '',
    likesCount: p.likes_count ?? 0,
    commentsCount: p.comments_count ?? 0,
    viewsCount: p.views_count ?? 0,
    caption: p.caption ?? '',
    category: pillarToCategory(p.pillar),
    format: typeToFormat(p.post_type),
    instagramUrl: p.post_url ?? '',
    pillar: (p.pillar as PillarLabel) ?? 'Negative',
  }))
}

export async function getTrendData(): Promise<TrendRawPost[]> {
  'use cache'
  cacheLife('max')
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('post_date, likes_count, views_count, comments_count, pillar, account_username')
    .gte('post_date', '2026-05-18')
    .lte('post_date', '2026-05-31')
    .order('post_date', { ascending: true })

  if (!posts?.length) return []

  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('username, main_dealer, dealer_name')

  const accountMap = new Map((accounts ?? []).map((a) => [a.username, a]))

  return posts.map((p) => ({
    post_date: p.post_date,
    likes_count: p.likes_count ?? 0,
    views_count: p.views_count ?? 0,
    comments_count: p.comments_count ?? 0,
    pillar: (p.pillar as PillarLabel) ?? 'Negative',
    account_username: p.account_username,
    main_dealer: accountMap.get(p.account_username)?.main_dealer ?? null,
    dealer_name: accountMap.get(p.account_username)?.dealer_name ?? null,
  }))
}

const ALL_PILLARS: PillarLabel[] = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
  'Negative',
]

export async function getInstagramAccounts(): Promise<InstagramAccount[]> {
  'use cache'
  cacheLife('max')
  const { data: accounts, error: accErr } = await supabase
    .from('instagram_accounts')
    .select('username, full_name, profile_picture_url, followers_count, main_dealer, dealer_name')
    .order('username')

  if (accErr || !accounts?.length) return []

  const { data: posts, error: postErr } = await supabase
    .from('instagram_posts')
    .select(
      'account_username, likes_count, comments_count, views_count, post_date, pillar, thumbnail_url',
    )
    .gte('post_date', '2026-05-18')
    .lte('post_date', '2026-05-31')

  if (postErr) return []

  const postsByAccount = new Map<string, typeof posts>()
  for (const p of posts ?? []) {
    const list = postsByAccount.get(p.account_username) ?? []
    list.push(p)
    postsByAccount.set(p.account_username, list)
  }

  return accounts.map((acc) => {
    const accPosts = postsByAccount.get(acc.username) ?? []

    const total_likes = accPosts.reduce((s, p) => s + (p.likes_count ?? 0), 0)
    const total_views = accPosts.reduce((s, p) => s + (p.views_count ?? 0), 0)
    const total_comments = accPosts.reduce((s, p) => s + (p.comments_count ?? 0), 0)

    const sorted = [...accPosts].sort(
      (a, b) =>
        new Date(b.post_date ?? 0).getTime() - new Date(a.post_date ?? 0).getTime(),
    )

    const last_post_date = sorted[0]?.post_date ?? null

    const recent_thumbnails = sorted
      .slice(0, 5)
      .map((p) => p.thumbnail_url)
      .filter(Boolean) as string[]

    const pillar_breakdown = Object.fromEntries(
      ALL_PILLARS.map((pl) => [pl, 0]),
    ) as Record<PillarLabel, number>

    for (const p of accPosts) {
      const pl = (p.pillar as PillarLabel) ?? 'Negative'
      pillar_breakdown[pl] = (pillar_breakdown[pl] ?? 0) + 1
    }

    const dominant_pillar: PillarLabel =
      accPosts.length === 0
        ? 'Negative'
        : (Object.entries(pillar_breakdown).sort(
            ([, a], [, b]) => b - a,
          )[0][0] as PillarLabel)

    return {
      username: acc.username,
      full_name: acc.full_name,
      profile_picture_url: acc.profile_picture_url,
      followers_count: acc.followers_count,
      main_dealer: acc.main_dealer ?? null,
      dealer_name: acc.dealer_name ?? null,
      post_count: accPosts.length,
      total_likes,
      total_views,
      total_comments,
      last_post_date,
      dominant_pillar,
      pillar_breakdown,
      recent_thumbnails,
    }
  })
}
