import type { Post } from '@/lib/types'
import { PILLAR_COLOR, PILLAR_SHORT } from '@/lib/types'
import type { SortBy } from './PostsSection'
import ProfileImage from './ProfileImage'

interface PostCardProps {
  post: Post
  rank: number
  sortBy?: SortBy
  onOpen: (post: Post) => void
}

export default function PostCard({ post, rank, sortBy = 'likes', onOpen }: PostCardProps) {
  const primaryValue =
    sortBy === 'comments' ? post.commentsCount : sortBy === 'views' ? post.viewsCount : post.likesCount
  const primaryLabel =
    sortBy === 'comments' ? 'komentar' : sortBy === 'views' ? 'views' : 'likes'
  return (
    <div
      className="post-card bg-white overflow-hidden flex flex-col"
      style={{ border: '1px solid #E5E7EB', cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(post)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(post)
        }
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #F0F0F0' }}>
        <span className="rank-badge flex-shrink-0">#{rank}</span>
        <ProfileImage src={post.profileImageSrc} username={post.accountHandle} />
        <div className="min-w-0">
          <div className="font-mulish font-semibold truncate" style={{ fontSize: '10px', color: '#111827' }}>
            {post.accountHandle}
          </div>
          <div style={{ fontSize: '9px', color: '#9CA3AF' }}>{post.date}</div>
        </div>
      </div>

      <div className="px-3 pt-2 pb-4 flex flex-col flex-1">
        <div className="flex items-baseline gap-3 mb-1.5">
          <span className="font-roboto font-bold" style={{ fontSize: '16px', color: '#E62533' }}>
            {primaryValue.toLocaleString()}
          </span>
          <span style={{ fontSize: '10px', color: '#9CA3AF' }}>{primaryLabel}</span>
        </div>
        <div className="mb-1.5" style={{ fontSize: '9px', color: '#C0C0C0' }}>
          {post.likesCount.toLocaleString()} likes &nbsp;&middot;&nbsp; {post.commentsCount.toLocaleString()} kmt &nbsp;&middot;&nbsp; {post.viewsCount.toLocaleString()} views
        </div>
        <p className="font-mulish caption-clamp mb-2 leading-relaxed" style={{ fontSize: '10px', color: '#555555' }}>
          {post.caption}
        </p>
        <div className="flex flex-col gap-1.5 mt-auto">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="cat-tag text-white" style={{ background: PILLAR_COLOR[post.pillar] }}>
              {PILLAR_SHORT[post.pillar]}
            </span>
            <span className="fmt-tag" style={{ background: '#F0F0F0', color: '#555555' }}>
              {post.format}
            </span>
            {post.isCollab && (
              <span
                className="fmt-tag font-semibold"
                title={post.collabWith.length ? `Collab with ${post.collabWith.join(', ')}` : 'Collab post'}
                style={{ background: '#EDE9FE', color: '#6D28D9' }}
              >
                Collab
              </span>
            )}
          </div>
          <span
            className="font-mulish font-semibold self-start"
            style={{ fontSize: '9px', color: '#E62533', border: '1px solid #E62533', padding: '3px 9px', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}
          >
            Preview Post ↗
          </span>
        </div>
      </div>
    </div>
  )
}
