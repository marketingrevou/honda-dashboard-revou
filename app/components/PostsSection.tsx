'use client'

import { useState, useMemo } from 'react'
import type { Post, PillarLabel } from '@/lib/types'
import { PILLAR_COLOR } from '@/lib/types'
import PostCard from './PostCard'

export type SortBy = 'likes' | 'comments' | 'views'

const PILLARS: PillarLabel[] = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
]

const PILLAR_SHORT: Record<string, string> = {
  'Product Value & Information': 'Product Value',
  'Dealer Credibility': 'Credibility',
  'Customer Story': 'Customer Story',
  'Promo Activation': 'Promo',
}

const SORT_LABEL: Record<SortBy, string> = {
  likes: 'Likes',
  comments: 'Comments',
  views: 'Views',
}

interface PostsSectionProps {
  posts: Post[]
}

export default function PostsSection({ posts }: PostsSectionProps) {
  const [activePillar, setActivePillar] = useState<PillarLabel | 'All'>('All')
  const [sortBy, setSortBy] = useState<SortBy>('likes')

  const displayed = useMemo(() => {
    const filtered =
      activePillar === 'All' ? posts : posts.filter((p) => p.pillar === activePillar)
    return [...filtered]
      .sort((a, b) => {
        if (sortBy === 'comments') return b.commentsCount - a.commentsCount
        if (sortBy === 'views') return b.viewsCount - a.viewsCount
        return b.likesCount - a.likesCount
      })
      .slice(0, 10)
  }, [posts, activePillar, sortBy])

  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="section-heading">Top 10 Post</h2>
        <p className="font-mulish mt-1" style={{ fontSize: '11.5px', color: '#555555' }}>
          Top 10 posts by {SORT_LABEL[sortBy].toLowerCase()} from 10 dealer accounts
          &nbsp;&middot;&nbsp; 18 – 31 May 2026
          {activePillar !== 'All' && (
            <> &nbsp;&middot;&nbsp; {activePillar}</>
          )}
        </p>
        <hr className="section-rule mt-3" />
      </div>

      <div className="flex flex-col gap-2 mb-5">
        {/* Pillar filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActivePillar('All')}
            className="font-mulish font-semibold"
            style={{
              fontSize: '10px',
              padding: '4px 12px',
              border: '1px solid',
              borderColor: activePillar === 'All' ? '#111827' : '#E5E7EB',
              background: activePillar === 'All' ? '#111827' : 'white',
              color: activePillar === 'All' ? 'white' : '#6B7280',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            All Pillars
          </button>
          {PILLARS.map((p) => (
            <button
              key={p}
              onClick={() => setActivePillar(p)}
              className="font-mulish font-semibold"
              style={{
                fontSize: '10px',
                padding: '4px 12px',
                border: '1px solid',
                borderColor: activePillar === p ? PILLAR_COLOR[p] : '#E5E7EB',
                background: activePillar === p ? PILLAR_COLOR[p] : 'white',
                color: activePillar === p ? 'white' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {PILLAR_SHORT[p]}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="font-mulish" style={{ fontSize: '10px', color: '#9CA3AF' }}>
            Sort by:
          </span>
          {(['likes', 'comments', 'views'] as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="font-mulish font-semibold"
              style={{
                fontSize: '10px',
                padding: '3px 10px',
                border: '1px solid',
                borderColor: sortBy === s ? '#E62533' : '#E5E7EB',
                background: sortBy === s ? '#E62533' : 'white',
                color: sortBy === s ? 'white' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {displayed.length === 0 ? (
        <p
          className="font-mulish text-center py-12"
          style={{ fontSize: '12px', color: '#9CA3AF' }}
        >
          No posts for this pillar.
        </p>
      ) : (
        <div className="posts-grid grid grid-cols-2 md:grid-cols-5 gap-4">
          {displayed.map((post, i) => (
            <PostCard key={post.id} post={post} rank={i + 1} sortBy={sortBy} />
          ))}
        </div>
      )}
    </section>
  )
}
