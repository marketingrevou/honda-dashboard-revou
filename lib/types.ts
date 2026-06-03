export type PostCategory = 'Product Info' | 'Promo' | 'Credibility'
export type PostFormat = 'Carousel' | 'Reels' | 'Static Post'

export interface Post {
  id: string
  accountHandle: string
  profileImageSrc: string
  date: string
  postImageSrc: string
  likesCount: number
  commentsCount: number
  caption: string
  category: PostCategory
  format: PostFormat
  instagramUrl: string
}

export interface Idea {
  title: string
  description: string
  format: PostFormat
}

export interface Pillar {
  number: number
  label: string
  title: string
  postCount: number
  postCountNote?: string
  ideas: Idea[]
}

export const CATEGORY_BG: Record<PostCategory, string> = {
  'Product Info': '#E62533',
  'Promo': '#333333',
  'Credibility': '#E62533',
}

export type PillarLabel =
  | 'Product Value & Information'
  | 'Dealer Credibility'
  | 'Customer Story'
  | 'Promo Activation'
  | 'Negative'

export const PILLAR_COLOR: Record<PillarLabel, string> = {
  'Product Value & Information': '#E62533',
  'Dealer Credibility': '#333333',
  'Customer Story': '#1D6FA4',
  'Promo Activation': '#D97706',
  'Negative': '#9CA3AF',
}

export interface InstagramAccount {
  username: string
  full_name: string | null
  profile_picture_url: string | null
  followers_count: number | null
  main_dealer: string | null
  dealer_name: string | null
  post_count: number
  total_likes: number
  total_views: number
  total_comments: number
  last_post_date: string | null
  dominant_pillar: PillarLabel
  pillar_breakdown: Record<PillarLabel, number>
  recent_thumbnails: string[]
}

export interface InstagramPost {
  post_id: string
  post_url: string | null
  thumbnail_url: string | null
  caption: string | null
  likes_count: number
  comments_count: number
  views_count: number
  post_date: string | null
  post_type: string | null
  pillar: PillarLabel
}

export interface TrendRawPost {
  post_date: string | null
  likes_count: number
  views_count: number
  comments_count: number
  pillar: PillarLabel
  account_username: string
  main_dealer: string | null
  dealer_name: string | null
}
