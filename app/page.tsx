import { getInstagramAccounts, getTopPosts, getTrendData } from '@/lib/instagram-data'
import Header from './components/Header'
import PostsSection from './components/PostsSection'
import InstagramSection from './components/InstagramSection'
import TrendSection from './components/TrendSection'
import Footer from './components/Footer'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [instagramAccounts, topPosts, trendPosts] = await Promise.all([
    getInstagramAccounts(),
    getTopPosts(10),
    getTrendData(),
  ])

  const totalPosts = instagramAccounts.reduce((s, a) => s + a.post_count, 0)

  return (
    <>
      <Header
        dateRange="18 – 31 Mei 2026"
        accountCount={10}
        accounts={[
          '@hondaaristadepok.official',
          '@hondaaristajatinegara.id',
          '@hondaaristamanggadua.id',
          '@hondamulyaputra',
          '@honda.autobest',
          '@hondaanugerah_official',
          '@hondabintang_official',
          '@hondadaim',
          '@hondamandalasenamlg',
          '@hondamajupalembang',
        ]}
        postCount={totalPosts}
      />
      <main className="max-w-screen-xl mx-auto px-6 pb-16">
        <PostsSection posts={topPosts} />
        <InstagramSection accounts={instagramAccounts} />
        <TrendSection posts={trendPosts} />
      </main>
      <Footer />
    </>
  )
}
