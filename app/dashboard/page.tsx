import { getInstagramAccounts, getTopPosts, getTrendData, getLatestPostDate } from '@/lib/instagram-data'
import type { DateRange } from '@/lib/instagram-data'
import Header from '../components/Header'
import PostsSection from '../components/PostsSection'
import InstagramSection from '../components/InstagramSection'
import TrendSection from '../components/TrendSection'
import Footer from '../components/Footer'
import UpdateButton from '../components/UpdateButton'
import { logout } from '@/app/actions/auth'

const MIN_DATE = '2026-05-18'

function getYesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(from: string, to: string): string {
  const f = new Date(from + 'T00:00:00Z')
  const t = new Date(to + 'T00:00:00Z')
  const sameYear = f.getUTCFullYear() === t.getUTCFullYear()
  const sameMonth = sameYear && f.getUTCMonth() === t.getUTCMonth()

  if (sameMonth) {
    const monthYear = t.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return `${f.getUTCDate()} – ${t.getUTCDate()} ${monthYear}`
  }
  const fLabel = f.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const tLabel = t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${fLabel} – ${tLabel}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const [params, latestDate] = await Promise.all([
    searchParams,
    getLatestPostDate(),
  ])

  let from = params.from ?? MIN_DATE
  let to = params.to ?? getYesterday()
  if (from > to) [from, to] = [to, from]

  const dateRange: DateRange = { from, to }
  const dateLabel = formatDateLabel(from, to)
  const maxDate = latestDate ?? MIN_DATE

  const [instagramAccounts, topPosts, trendPosts] = await Promise.all([
    getInstagramAccounts(dateRange),
    getTopPosts(dateRange),
    getTrendData(dateRange),
  ])

  const totalPosts = instagramAccounts.reduce((s, a) => s + a.post_count, 0)

  return (
    <>
      <Header
        dateFrom={from}
        dateTo={to}
        minDate={MIN_DATE}
        maxDate={maxDate}
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
        logoutAction={logout as () => Promise<void>}
        updateButton={<UpdateButton latestDate={latestDate} />}
      />
      <main className="max-w-screen-xl mx-auto px-6 pb-16">
        <InstagramSection accounts={instagramAccounts} dateLabel={dateLabel} dateFrom={from} dateTo={to} />
        <TrendSection posts={trendPosts} dateLabel={dateLabel} />
        <PostsSection posts={topPosts} dateLabel={dateLabel} />
      </main>
      <Footer />
    </>
  )
}
