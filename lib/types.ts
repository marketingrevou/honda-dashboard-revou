export type PostFormat = 'Carousel' | 'Reels' | 'Static Post'

export interface Post {
  id: string
  accountHandle: string
  profileImageSrc: string
  date: string
  likesCount: number
  commentsCount: number
  viewsCount: number
  caption: string
  format: PostFormat
  instagramUrl: string
  pillar: PillarLabel
  // Collab (coauthored) post: the same IG post is attributed to more than one
  // dealer. `isCollab` is true when >1 dealer has this post_id; `collabWith`
  // lists the OTHER dealer handles (without the one shown on this card),
  // '@'-prefixed for display.
  isCollab: boolean
  collabWith: string[]
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

export type PillarLabel =
  | 'Product Value & Information'
  | 'Dealer Credibility'
  | 'Customer Story'
  | 'Promo Activation'
  | 'Negative'
  | 'Others'

export const PILLAR_COLOR: Record<PillarLabel, string> = {
  'Product Value & Information': '#E62533',
  'Dealer Credibility': '#333333',
  'Customer Story': '#1D6FA4',
  'Promo Activation': '#D97706',
  'Negative': '#9CA3AF',
  'Others': '#6B7280',
}

/** Compact labels for the 6 pillars, used in badges/chips. */
export const PILLAR_SHORT: Record<PillarLabel, string> = {
  'Product Value & Information': 'Product Value',
  'Dealer Credibility': 'Credibility',
  'Customer Story': 'Customer Story',
  'Promo Activation': 'Promo',
  'Negative': 'Negative',
  'Others': 'Others',
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
  classification_source: 'combined-vision' | 'caption-ai' | null
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
