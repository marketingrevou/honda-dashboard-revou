import type { Post } from '@/lib/types'
import { CATEGORY_BG } from '@/lib/types'
import type { SortBy } from './PostsSection'
import ProfileImage from './ProfileImage'
import PostImage from './PostImage'

interface PostCardProps {
  post: Post
  rank: number
  sortBy?: SortBy
}

export default function PostCard({ post, rank, sortBy = 'likes' }: PostCardProps) {
  const primaryValue =
    sortBy === 'comments' ? post.commentsCount : sortBy === 'views' ? post.viewsCount : post.likesCount
  const primaryLabel =
    sortBy === 'comments' ? 'komentar' : sortBy === 'views' ? 'views' : 'likes'
  return (
    <div className="post-card bg-white overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #F0F0F0' }}>
        <ProfileImage src={post.profileImageSrc} username={post.accountHandle} />
        <div>
          <div className="font-mulish font-semibold" style={{ fontSize: '10px', color: '#111827' }}>
            {post.accountHandle}
          </div>
          <div style={{ fontSize: '9px', color: '#9CA3AF' }}>{post.date}</div>
        </div>
      </div>

      <PostImage src={post.postImageSrc} rank={rank} alt={`Post #${rank}`} />

      <div className="px-3 pt-2 pb-4">
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="cat-tag text-white" style={{ background: CATEGORY_BG[post.category] }}>
              {post.category}
            </span>
            <span className="fmt-tag" style={{ background: '#F0F0F0', color: '#555555' }}>
              {post.format}
            </span>
          </div>
          <a
            href={post.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mulish font-semibold self-start"
            style={{ fontSize: '9px', color: '#E62533', border: '1px solid #E62533', padding: '3px 9px', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}
          >
            Lihat Post ↗
          </a>
        </div>
      </div>
    </div>
  )
}
