'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TrendRawPost, PillarLabel } from '@/lib/types'
import { PILLAR_COLOR } from '@/lib/types'

type Timeframe = 'daily' | 'weekly'
type Breakdown = 'main_dealer' | 'account' | 'pillar'
type Metric = 'likes' | 'views' | 'posts'

const CHART_COLORS = [
  '#E62533',
  '#1D6FA4',
  '#D97706',
  '#333333',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
]

function getWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

function formatLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

interface Props {
  posts: TrendRawPost[]
  dateLabel: string
}

export default function TrendSection({ posts, dateLabel }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('daily')
  const [breakdown, setBreakdown] = useState<Breakdown>('main_dealer')
  const [metric, setMetric] = useState<Metric>('likes')
  const [selectedDealers, setSelectedDealers] = useState<string[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const accountDropdownRef = useRef<HTMLDivElement>(null)

  const mainDealers = useMemo(
    () => Array.from(new Set(posts.map((p) => p.main_dealer).filter(Boolean) as string[])).sort(),
    [posts],
  )

  const mainDealerFiltered = useMemo(
    () =>
      selectedDealers.length > 0
        ? posts.filter((p) => p.main_dealer && selectedDealers.includes(p.main_dealer))
        : posts,
    [posts, selectedDealers],
  )

  const filteredPosts = useMemo(
    () =>
      selectedAccounts.length > 0
        ? mainDealerFiltered.filter((p) => selectedAccounts.includes(p.account_username))
        : mainDealerFiltered,
    [mainDealerFiltered, selectedAccounts],
  )

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of mainDealerFiltered) {
      if (!seen.has(p.account_username)) {
        seen.set(p.account_username, p.dealer_name ?? p.account_username)
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [mainDealerFiltered])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleDealer(dealer: string) {
    setSelectedDealers((prev) =>
      prev.includes(dealer) ? prev.filter((d) => d !== dealer) : [...prev, dealer],
    )
    setSelectedAccounts([])
  }

  function clearDealers() {
    setSelectedDealers([])
    setDropdownOpen(false)
    setSelectedAccounts([])
  }

  function toggleAccount(username: string) {
    setSelectedAccounts((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username],
    )
  }

  function clearAccounts() {
    setSelectedAccounts([])
    setAccountDropdownOpen(false)
  }

  const { chartData, groups } = useMemo(() => {
    const validPosts = filteredPosts.filter((p) => p.post_date)

    function getGroup(p: TrendRawPost): string {
      if (breakdown === 'pillar') return p.pillar
      if (breakdown === 'account') return `@${p.account_username}`
      return p.main_dealer ?? 'Unknown'
    }

    function getDateKey(p: TrendRawPost): string {
      const raw = p.post_date!.slice(0, 10)
      return timeframe === 'weekly' ? getWeekStart(raw) : raw
    }

    const groupSet = new Set<string>()
    const dateSet = new Set<string>()

    for (const p of validPosts) {
      groupSet.add(getGroup(p))
      dateSet.add(getDateKey(p))
    }

    const sortedDates = [...dateSet].sort()
    const groupList = [...groupSet].sort()

    const acc = new Map<string, Map<string, number>>()
    for (const date of sortedDates) {
      acc.set(date, new Map(groupList.map((g) => [g, 0])))
    }

    for (const p of validPosts) {
      const dateKey = getDateKey(p)
      const group = getGroup(p)
      const dateMap = acc.get(dateKey)!
      const val =
        metric === 'likes' ? p.likes_count : metric === 'views' ? p.views_count : 1
      dateMap.set(group, (dateMap.get(group) ?? 0) + val)
    }

    const chartData = sortedDates.map((date) => {
      const row: Record<string, string | number> = { date: formatLabel(date) }
      const dateMap = acc.get(date)!
      for (const g of groupList) {
        row[g] = dateMap.get(g) ?? 0
      }
      return row
    })

    return { chartData, groups: groupList }
  }, [filteredPosts, timeframe, breakdown, metric])

  function getLineColor(group: string, index: number): string {
    if (breakdown === 'pillar') {
      return PILLAR_COLOR[group as PillarLabel] ?? '#9CA3AF'
    }
    return CHART_COLORS[index % CHART_COLORS.length]
  }

  const metricLabel =
    metric === 'likes' ? 'Total Likes' : metric === 'views' ? 'Total Views' : 'Posts Published'

  const xInterval =
    timeframe === 'daily' ? Math.max(0, Math.floor(chartData.length / 7) - 1) : 0

  if (!posts.length) {
    return (
      <section className="mt-14">
        <div className="mb-5">
          <h2 className="section-heading">Performance Trend</h2>
          <hr className="section-rule mt-3" />
        </div>
        <div
          className="flex items-center justify-center py-16 bg-white"
          style={{ border: '1px solid #E5E7EB' }}
        >
          <p className="font-mulish" style={{ fontSize: '11px', color: '#9CA3AF' }}>
            No data available
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-14">
      <div className="mb-5">
        <h2 className="section-heading">Performance Trend</h2>
        <p className="font-mulish mt-1" style={{ fontSize: '11.5px', color: '#555555' }}>
          {dateLabel} &nbsp;&middot;&nbsp; {metricLabel} over time
        </p>
        <hr className="section-rule mt-3" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Main Dealer filter */}
        <div className="flex items-center gap-2">
          <span
            className="font-mulish font-semibold"
            style={{
              fontSize: '10px',
              color: '#9CA3AF',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              whiteSpace: 'nowrap',
            }}
          >
            Filter
          </span>
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="font-mulish font-semibold flex items-center gap-2"
              style={{
                fontSize: '10px',
                padding: '5px 10px',
                border: '1px solid',
                borderColor: selectedDealers.length > 0 ? '#E62533' : '#D1D5DB',
                background: '#fff',
                color: selectedDealers.length > 0 ? '#E62533' : '#6B7280',
                cursor: 'pointer',
                letterSpacing: '0.3px',
                minWidth: 160,
                justifyContent: 'space-between',
              }}
            >
              <span>
                {selectedDealers.length === 0
                  ? 'Main Dealer'
                  : selectedDealers.length === 1
                    ? selectedDealers[0]
                    : `${selectedDealers.length} dealers selected`}
              </span>
              <span style={{ fontSize: '8px', marginLeft: 4 }}>{dropdownOpen ? '▲' : '▼'}</span>
            </button>

            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 60,
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  minWidth: 220,
                }}
              >
                <div style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <button
                    onClick={clearDealers}
                    className="font-mulish font-semibold w-full text-left"
                    style={{
                      fontSize: '10px',
                      padding: '8px 12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: selectedDealers.length > 0 ? '#E62533' : '#9CA3AF',
                      letterSpacing: '0.3px',
                    }}
                  >
                    {selectedDealers.length > 0 ? '✕ Clear filter' : 'Main Dealer'}
                  </button>
                </div>
                {mainDealers.map((dealer) => {
                  const count = posts.filter((p) => p.main_dealer === dealer).length
                  const checked = selectedDealers.includes(dealer)
                  return (
                    <label
                      key={dealer}
                      className="flex items-center gap-2.5 cursor-pointer"
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid #F9F9F9',
                        background: checked ? '#FFF5F5' : '#fff',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDealer(dealer)}
                        style={{ accentColor: '#E62533', width: 12, height: 12, flexShrink: 0 }}
                      />
                      <span
                        className="font-mulish"
                        style={{ fontSize: '10.5px', color: '#374151', flex: 1 }}
                      >
                        {dealer}
                      </span>
                      <span
                        className="font-roboto font-bold"
                        style={{ fontSize: '10px', color: '#9CA3AF' }}
                      >
                        {count}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Account dropdown */}
          <div ref={accountDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setAccountDropdownOpen((o) => !o)}
              className="font-mulish font-semibold flex items-center gap-2"
              style={{
                fontSize: '10px',
                padding: '5px 10px',
                border: '1px solid',
                borderColor: selectedAccounts.length > 0 ? '#E62533' : '#D1D5DB',
                background: '#fff',
                color: selectedAccounts.length > 0 ? '#E62533' : '#6B7280',
                cursor: 'pointer',
                letterSpacing: '0.3px',
                minWidth: 160,
                justifyContent: 'space-between',
              }}
            >
              <span>
                {selectedAccounts.length === 0
                  ? 'Username Dealer'
                  : selectedAccounts.length === 1
                    ? (accountOptions.find(([u]) => u === selectedAccounts[0])?.[1] ?? selectedAccounts[0])
                    : `${selectedAccounts.length} accounts selected`}
              </span>
              <span style={{ fontSize: '8px', marginLeft: 4 }}>{accountDropdownOpen ? '▲' : '▼'}</span>
            </button>

            {accountDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 60,
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  minWidth: 240,
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                <div style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <button
                    onClick={clearAccounts}
                    className="font-mulish font-semibold w-full text-left"
                    style={{
                      fontSize: '10px',
                      padding: '8px 12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: selectedAccounts.length > 0 ? '#E62533' : '#9CA3AF',
                      letterSpacing: '0.3px',
                    }}
                  >
                    {selectedAccounts.length > 0 ? '✕ Clear filter' : 'Username Dealer'}
                  </button>
                </div>
                {accountOptions.map(([username, label]) => {
                  const checked = selectedAccounts.includes(username)
                  return (
                    <label
                      key={username}
                      className="flex items-center gap-2.5 cursor-pointer"
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid #F9F9F9',
                        background: checked ? '#FFF5F5' : '#fff',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAccount(username)}
                        style={{ accentColor: '#E62533', width: 12, height: 12, flexShrink: 0 }}
                      />
                      <span className="font-mulish" style={{ fontSize: '10.5px', color: '#374151', flex: 1 }}>
                        {label}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Timeframe */}
        <ControlGroup label="Timeframe">
          {(['daily', 'weekly'] as const).map((t, i) => (
            <ToggleButton
              key={t}
              active={timeframe === t}
              first={i === 0}
              activeColor="#E62533"
              onClick={() => setTimeframe(t)}
            >
              {t === 'daily' ? 'Daily' : 'Weekly'}
            </ToggleButton>
          ))}
        </ControlGroup>

        {/* Breakdown */}
        <ControlGroup label="Breakdown">
          {(
            [
              { value: 'main_dealer', label: 'Main Dealer' },
              { value: 'account', label: 'Instagram Account' },
              { value: 'pillar', label: 'Pillars' },
            ] as const
          ).map(({ value, label }, i) => (
            <ToggleButton
              key={value}
              active={breakdown === value}
              first={i === 0}
              activeColor="#E62533"
              onClick={() => setBreakdown(value)}
            >
              {label}
            </ToggleButton>
          ))}
        </ControlGroup>

        {/* Metric */}
        <ControlGroup label="Metric">
          {(
            [
              { value: 'likes', label: 'Likes' },
              { value: 'views', label: 'Views' },
              { value: 'posts', label: 'Posts' },
            ] as const
          ).map(({ value, label }, i) => (
            <ToggleButton
              key={value}
              active={metric === value}
              first={i === 0}
              activeColor="#333333"
              onClick={() => setMetric(value)}
            >
              {label}
            </ToggleButton>
          ))}
        </ControlGroup>
      </div>

      {/* Chart */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', padding: '24px 8px 16px 0' }}>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fontFamily: 'Mulish, sans-serif', fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              interval={xInterval}
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: 'Mulish, sans-serif', fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={formatNum}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid #E5E7EB',
                borderRadius: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                fontSize: '10px',
                fontFamily: 'Mulish, sans-serif',
              }}
              labelStyle={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}
              formatter={(value, name) => [formatNum(Number(value ?? 0)), String(name)]}
            />
            <Legend
              wrapperStyle={{
                fontSize: '10px',
                fontFamily: 'Mulish, sans-serif',
                paddingTop: 16,
                paddingLeft: 16,
              }}
              iconType="circle"
              iconSize={8}
            />
            {groups.map((group, i) => (
              <Line
                key={group}
                type="monotone"
                dataKey={group}
                stroke={getLineColor(group, i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function ControlGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="font-mulish font-semibold"
        style={{
          fontSize: '10px',
          color: '#9CA3AF',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div className="flex" style={{ border: '1px solid #E5E7EB' }}>
        {children}
      </div>
    </div>
  )
}

function ToggleButton({
  active,
  first,
  activeColor,
  onClick,
  children,
}: {
  active: boolean
  first: boolean
  activeColor: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="font-mulish font-semibold"
      style={{
        padding: '5px 12px',
        fontSize: '10px',
        letterSpacing: '0.3px',
        border: 'none',
        borderLeft: first ? 'none' : '1px solid #E5E7EB',
        cursor: 'pointer',
        background: active ? activeColor : '#fff',
        color: active ? '#fff' : '#6B7280',
        transition: 'all 0.1s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
