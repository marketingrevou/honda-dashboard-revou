'use client'

import { useState } from 'react'
import type { InstagramAccount, PillarLabel } from '@/lib/types'
import { PILLAR_COLOR } from '@/lib/types'

const PILLAR_SHORT: Record<PillarLabel, string> = {
  'Product Value & Information': 'Product Info',
  'Dealer Credibility': 'Credibility',
  'Customer Story': 'Customer Story',
  'Promo Activation': 'Promo',
  'Negative': 'Negative',
  'Others': 'Others',
}

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

interface Props {
  account: InstagramAccount
}

export default function InstagramAccountCard({ account }: Props) {
  const [imgError, setImgError] = useState(false)

  const pillarsWithPosts = Object.entries(account.pillar_breakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a) as [PillarLabel, number][]

  return (
    <div
      className="bg-white overflow-hidden flex flex-col"
      style={{ border: '1px solid #E5E7EB', transition: 'border-color 0.15s ease' }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = '#E62533')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = '#E5E7EB')}
    >
      {/* Header: profile pic + name */}
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid #F0F0F0' }}>
        {!imgError && account.profile_picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.profile_picture_url}
            alt={account.username}
            width={36}
            height={36}
            className="flex-shrink-0 object-cover"
            style={{ borderRadius: '50%', width: 36, height: 36 }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="flex-shrink-0 flex items-center justify-center text-white font-bold"
            style={{ borderRadius: '50%', width: 36, height: 36, background: '#E62533', fontSize: '13px' }}
          >
            H
          </div>
        )}
        <div className="min-w-0">
          <div
            className="font-mulish font-bold truncate"
            style={{ fontSize: '11px', color: '#111827' }}
          >
            {account.full_name || account.username}
          </div>
          <div style={{ fontSize: '9.5px', color: '#9CA3AF' }}>
            @{account.username}
          </div>
        </div>
        <a
          href={`https://www.instagram.com/${account.username}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex-shrink-0"
          style={{ fontSize: '9px', color: '#E62533', border: '1px solid #E62533', padding: '2px 7px', fontFamily: 'var(--font-mulish-var)', fontWeight: 600, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}
        >
          ↗
        </a>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 px-3 py-2" style={{ borderBottom: '1px solid #F0F0F0', gap: '2px 0' }}>
        {[
          { label: 'Posts', value: account.post_count },
          { label: 'Likes', value: formatNum(account.total_likes) },
          { label: 'Views', value: formatNum(account.total_views) },
          { label: 'Comments', value: formatNum(account.total_comments) },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center">
            <span className="font-roboto font-bold" style={{ fontSize: '14px', color: '#E62533', lineHeight: 1.1 }}>
              {value}
            </span>
            <span style={{ fontSize: '8px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Last post date */}
      <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ borderBottom: '1px solid #F0F0F0' }}>
        <span style={{ fontSize: '9px', color: '#9CA3AF' }}>Last post:</span>
        <span className="font-mulish font-semibold" style={{ fontSize: '9px', color: '#555555' }}>
          {formatDate(account.last_post_date)}
        </span>
      </div>

      {/* Pillar tags */}
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {pillarsWithPosts.length === 0 ? (
          <span
            className="cat-tag text-white"
            style={{ background: PILLAR_COLOR['Negative'] }}
          >
            Negative
          </span>
        ) : (
          pillarsWithPosts.map(([pillar, count]) => (
            <span
              key={pillar}
              className="cat-tag text-white"
              style={{ background: PILLAR_COLOR[pillar] }}
              title={`${count} post${count > 1 ? 's' : ''}`}
            >
              {PILLAR_SHORT[pillar]} {count > 0 && `(${count})`}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
