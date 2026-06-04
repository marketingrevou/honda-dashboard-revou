import type { InstagramAccount, PillarLabel } from '@/lib/types'
import { PILLAR_COLOR } from '@/lib/types'

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

const PILLARS: { key: PillarLabel; label: string }[] = [
  { key: 'Product Value & Information', label: 'Product Info' },
  { key: 'Dealer Credibility', label: 'Credibility' },
  { key: 'Customer Story', label: 'Customer Story' },
  { key: 'Promo Activation', label: 'Promo' },
  { key: 'Negative', label: 'Negative' },
]

interface Props {
  accounts: InstagramAccount[]
}

export default function SummarySection({ accounts }: Props) {
  const totalPosts    = accounts.reduce((s, a) => s + a.post_count,      0)
  const totalLikes    = accounts.reduce((s, a) => s + a.total_likes,     0)
  const totalViews    = accounts.reduce((s, a) => s + a.total_views,     0)
  const totalComments = accounts.reduce((s, a) => s + a.total_comments,  0)

  const pillarTotals = PILLARS.map(({ key, label }) => ({
    key,
    label,
    count: accounts.reduce((s, a) => s + (a.pillar_breakdown[key] ?? 0), 0),
  }))

  const scorecards = [
    { label: 'Accounts Tracked', value: String(accounts.length), accent: '#E62533' },
    { label: 'Total Posts',      value: String(totalPosts),       accent: '#E62533' },
    { label: 'Total Likes',      value: formatNum(totalLikes),    accent: '#E62533' },
    { label: 'Total Views',      value: formatNum(totalViews),    accent: '#E62533' },
    { label: 'Total Comments',   value: formatNum(totalComments), accent: '#E62533' },
  ]

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="section-heading">Summary Overview</h2>
        <p className="font-mulish mt-1" style={{ fontSize: '11.5px', color: '#555555' }}>
          18 – 31 Mei 2026 &nbsp;&middot;&nbsp; all {accounts.length} akun dealer Honda
        </p>
        <hr className="section-rule mt-3" />
      </div>

      {/* Metric scorecards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '10px' }}>
        {scorecards.map(({ label, value }) => (
          <div
            key={label}
            className="bg-white"
            style={{
              border: '1px solid #E5E7EB',
              borderTop: '3px solid #E62533',
              padding: '18px 20px 16px',
            }}
          >
            <div
              className="font-roboto font-bold"
              style={{ fontSize: '32px', color: '#111827', lineHeight: 1, letterSpacing: '-0.5px' }}
            >
              {value}
            </div>
            <div
              className="font-mulish"
              style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.7px', marginTop: '8px' }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Pillar breakdown row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
        {pillarTotals.map(({ key, label, count }) => (
          <div
            key={key}
            className="flex items-center justify-between"
            style={{
              background: '#FAFAFA',
              border: '1px solid #F0F0F0',
              borderLeft: `3px solid ${PILLAR_COLOR[key]}`,
              padding: '10px 14px',
            }}
          >
            <span className="font-mulish" style={{ fontSize: '10px', color: '#555555' }}>
              {label}
            </span>
            <span
              className="font-roboto font-bold"
              style={{ fontSize: '15px', color: PILLAR_COLOR[key], marginLeft: 8 }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
