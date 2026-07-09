import type { InstagramAccount, PillarLabel } from './types'

const PILLAR_KEYS: PillarLabel[] = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
  'Negative',
  'Others',
]

function cell(val: string | number | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

export function exportAccountsCSV(
  accounts: InstagramAccount[],
  filename = 'honda-instagram-performance.csv',
): void {
  const headers = [
    'Rank',
    'Username',
    'Full Name',
    'Main Dealer',
    'Dealer Name',
    'Posts',
    'Likes',
    'Views',
    'Comments',
    'Last Post',
    'Product Value & Information',
    'Dealer Credibility',
    'Customer Story',
    'Promo Activation',
    'Negative',
    'Others',
  ]

  const rows = accounts.map((a, i) => [
    i + 1,
    a.username,
    a.full_name ?? '',
    a.main_dealer ?? '',
    a.dealer_name ?? '',
    a.post_count,
    a.total_likes,
    a.total_views,
    a.total_comments,
    a.last_post_date ?? '',
    ...PILLAR_KEYS.map(k => a.pillar_breakdown[k] ?? 0),
  ])

  const csv = [headers, ...rows].map(row => row.map(cell).join(',')).join('\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
