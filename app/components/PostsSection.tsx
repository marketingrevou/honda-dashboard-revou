import type { Post } from '@/lib/types'
import PostCard from './PostCard'

interface PostsSectionProps {
  posts: Post[]
}

export default function PostsSection({ posts }: PostsSectionProps) {
  return (
    <section className="mt-8">
      <div className="mb-5">
        <h2 className="section-heading">Top 10 Post</h2>
        <p className="font-mulish mt-1" style={{ fontSize: '11.5px', color: '#555555' }}>
          10 konten dengan likes tertinggi dari 10 akun dealer &nbsp;&middot;&nbsp; 1 Mei – 2 Jun 2026 &nbsp;&middot;&nbsp; Diurutkan berdasarkan likes
        </p>
        <hr className="section-rule mt-3" />
      </div>

      <div className="posts-grid grid grid-cols-2 md:grid-cols-5 gap-4">
        {posts.map((post, i) => (
          <PostCard key={post.id} post={post} rank={i + 1} />
        ))}
      </div>
    </section>
  )
}
