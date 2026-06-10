import { getInstagramAccounts, getTopPosts, getTrendData, getLatestPostDate } from '@/lib/instagram-data'
import type { DateRange } from '@/lib/instagram-data'
import Header from '../components/Header'
import PostsSection from '../components/PostsSection'
import InstagramSection from '../components/InstagramSection'
import TrendSection from '../components/TrendSection'
import Footer from '../components/Footer'
import { logout } from '@/app/actions/auth'

const MIN_DATE = '2026-05-18'

function getYesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// Returns the most recent complete Mon–Sun week (the last Sunday on or before
// `anchor`, plus the Monday 6 days prior).
function getLastCompleteWeek(anchor: string): { from: string; to: string } {
  const d = new Date(anchor + 'T00:00:00Z')
  const dow = d.getUTCDay() // 0 = Sun, 1 = Mon, ... 6 = Sat
  // Step back to the most recent Sunday (if anchor is Sunday, use it).
  const daysSinceSunday = dow === 0 ? 0 : dow
  const sunday = new Date(d)
  sunday.setUTCDate(sunday.getUTCDate() - daysSinceSunday)
  const monday = new Date(sunday)
  monday.setUTCDate(monday.getUTCDate() - 6)
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  }
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

  // Top 10 Post only considers the most recent complete week (Mon–Sun),
  // always anchored to today's actual date regardless of the date picker.
  const today = new Date().toISOString().slice(0, 10)
  const lastWeek = getLastCompleteWeek(today)
  const topRange: DateRange = { from: lastWeek.from, to: lastWeek.to }
  const topDateLabel = formatDateLabel(lastWeek.from, lastWeek.to)

  const [instagramAccounts, topPosts, trendPosts] = await Promise.all([
    getInstagramAccounts(dateRange),
    getTopPosts(topRange),
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
      />
      <main className="max-w-screen-xl mx-auto px-6 pb-16">
        <InstagramSection accounts={instagramAccounts} dateLabel={dateLabel} dateFrom={from} dateTo={to} />
        <TrendSection posts={trendPosts} dateLabel={dateLabel} />
        <PostsSection posts={topPosts} dateLabel={topDateLabel} />
      </main>
      <Footer />
    </>
  )
}
