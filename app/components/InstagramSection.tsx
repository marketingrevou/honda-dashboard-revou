'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { InstagramAccount, PillarLabel } from '@/lib/types'
import { PILLAR_COLOR } from '@/lib/types'
import { supabase } from '@/lib/supabase'

function proxied(src: string): string {
  if (!src || src.startsWith('/') || src.startsWith('data:')) return src
  return `/api/image-proxy?url=${encodeURIComponent(src)}`
}

const PILLAR_COLS: { key: PillarLabel; label: string }[] = [
  { key: 'Product Value & Information', label: 'Product Info' },
  { key: 'Dealer Credibility',          label: 'Credibility' },
  { key: 'Customer Story',              label: 'Customer Story' },
  { key: 'Promo Activation',            label: 'Promo' },
  { key: 'Negative',                    label: 'Negative' },
]

const CENTER_COLS = new Set(['#', 'Posts', 'Likes', 'Views', 'Comments', ...PILLAR_COLS.map(p => p.label)])

interface ModalPost {
  post_id: string
  post_date: string | null
  caption: string | null
  post_url: string | null
  pillar: PillarLabel
}

interface ModalState {
  username: string
  fullName: string
  pillar: PillarLabel | null
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PostsModal({ modal, onClose }: { modal: ModalState; onClose: () => void }) {
  const [posts, setPosts] = useState<ModalPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    let q = supabase
      .from('instagram_posts')
      .select('post_id, post_date, caption, post_url, pillar')
      .eq('account_username', modal.username)
      .order('post_date', { ascending: false })

    if (modal.pillar) {
      q = q.eq('pillar', modal.pillar) as typeof q
    }

    q.then(({ data }) => {
      setPosts((data as ModalPost[]) ?? [])
      setLoading(false)
    })
  }, [modal.username, modal.pillar])

  const pillarEntry = modal.pillar ? PILLAR_COLS.find(p => p.key === modal.pillar) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', padding: '16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: '100%', maxWidth: 600, maxHeight: 'calc(100vh - 32px)', border: '1px solid #E5E7EB', borderTop: '3px solid #E62533', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
          <div>
            <div className="font-roboto font-bold" style={{ fontSize: '14px', color: '#111827' }}>
              {modal.fullName}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mulish" style={{ fontSize: '10px', color: '#9CA3AF' }}>@{modal.username}</span>
              {pillarEntry && (
                <>
                  <span style={{ fontSize: '10px', color: '#D1D5DB' }}>·</span>
                  <span
                    className="cat-tag text-white"
                    style={{ background: PILLAR_COLOR[modal.pillar!] }}
                  >
                    {pillarEntry.label}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center"
            style={{ width: 28, height: 28, background: '#F0F0F0', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#555', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Post list */}
        <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="font-mulish" style={{ fontSize: '11px', color: '#9CA3AF' }}>Loading...</span>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span className="font-mulish" style={{ fontSize: '11px', color: '#9CA3AF' }}>No posts found</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 96 }} />
                <col />
              </colgroup>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: '#F7F7F7', borderBottom: '1px solid #E5E7EB' }}>
                  <th className="font-mulish font-bold" style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '8px 16px', textAlign: 'left' }}>Date</th>
                  <th className="font-mulish font-bold" style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '8px 16px', textAlign: 'left' }}>Caption</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p, i) => (
                  <tr
                    key={p.post_id}
                    style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}
                  >
                    <td style={{ padding: '10px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <span className="font-mulish" style={{ fontSize: '10px', color: '#555555' }}>
                        {formatDate(p.post_date)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                      <p className="font-mulish" style={{ fontSize: '10px', color: '#555555', lineHeight: 1.55, margin: '0 0 6px 0' }}>
                        {p.caption || <span style={{ color: '#D1D5DB' }}>No caption</span>}
                      </p>
                      {p.post_url && (
                        <a
                          href={p.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mulish font-semibold"
                          style={{ fontSize: '9px', color: '#E62533', border: '1px solid #E62533', padding: '2px 8px', whiteSpace: 'nowrap', letterSpacing: '0.3px', display: 'inline-block' }}
                        >
                          View post ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        {!loading && posts.length > 0 && (
          <div className="px-5 py-2.5 flex items-center" style={{ borderTop: '1px solid #F0F0F0', flexShrink: 0 }}>
            <span className="font-mulish" style={{ fontSize: '10px', color: '#9CA3AF' }}>
              {posts.length} post{posts.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function AccountCell({ account }: { account: InstagramAccount }) {
  const [imgErr, setImgErr] = useState(false)
  return (
    <div className="flex items-center gap-2.5">
      {!imgErr && account.profile_picture_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxied(account.profile_picture_url)}
          alt={account.username}
          width={32}
          height={32}
          className="flex-shrink-0 object-cover"
          style={{ borderRadius: '50%', width: 32, height: 32 }}
          onError={() => setImgErr(true)}
        />
      ) : (
        <div
          className="flex-shrink-0 flex items-center justify-center text-white font-bold"
          style={{ borderRadius: '50%', width: 32, height: 32, background: '#E62533', fontSize: '12px' }}
        >
          H
        </div>
      )}
      <div className="min-w-0">
        <div className="font-mulish font-semibold truncate" style={{ fontSize: '11px', color: '#111827', maxWidth: 160 }}>
          {account.full_name || account.username}
        </div>
        <a
          href={`https://www.instagram.com/${account.username}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mulish"
          style={{ fontSize: '9.5px', color: '#9CA3AF' }}
        >
          @{account.username} ↗
        </a>
      </div>
    </div>
  )
}

interface Props {
  accounts: InstagramAccount[]
}

export default function InstagramSection({ accounts }: Props) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const [selectedDealers, setSelectedDealers] = useState<string[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const openModal = useCallback((username: string, fullName: string, pillar: PillarLabel | null) => {
    setModal({ username, fullName, pillar })
  }, [])

  const closeModal = useCallback(() => setModal(null), [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const mainDealers = Array.from(
    new Set(accounts.map(a => a.main_dealer).filter(Boolean) as string[])
  ).sort()

  const filtered = selectedDealers.length > 0
    ? accounts.filter(a => a.main_dealer && selectedDealers.includes(a.main_dealer))
    : accounts

  const totalPosts = filtered.reduce((s, a) => s + a.post_count, 0)
  const totalLikes = filtered.reduce((s, a) => s + a.total_likes, 0)
  const totalViews = filtered.reduce((s, a) => s + a.total_views, 0)

  function toggleDealer(dealer: string) {
    setSelectedDealers(prev =>
      prev.includes(dealer) ? prev.filter(d => d !== dealer) : [...prev, dealer]
    )
  }

  function clearDealers() {
    setSelectedDealers([])
    setDropdownOpen(false)
  }

  if (!accounts.length) {
    return (
      <section className="mt-14">
        <div className="mb-5">
          <h2 className="section-heading">Instagram Account Performance</h2>
          <p className="font-mulish mt-1" style={{ fontSize: '11.5px', color: '#555555' }}>
            1 Mei – 2 Jun 2026 &nbsp;&middot;&nbsp; 10 akun dealer Honda
          </p>
          <hr className="section-rule mt-3" />
        </div>
        <div className="flex items-center justify-center py-16 bg-white" style={{ border: '1px solid #E5E7EB' }}>
          <div className="text-center">
            <p className="font-roboto font-bold" style={{ fontSize: '20px', color: '#E62533' }}>No data yet</p>
            <p className="font-mulish mt-1" style={{ fontSize: '11px', color: '#9CA3AF' }}>
              Run: <code style={{ background: '#F0F0F0', padding: '2px 6px', fontSize: '10px' }}>node --env-file=.env.local scripts/scrape.mjs</code>
            </p>
          </div>
        </div>
      </section>
    )
  }

  const sorted = [...filtered].sort((a, b) => b.post_count - a.post_count)
  const headers = ['#', 'Account', 'Posts', 'Likes', 'Views', 'Comments', 'Last Post', ...PILLAR_COLS.map(p => p.label)]

  return (
    <>
      {modal && <PostsModal modal={modal} onClose={closeModal} />}

      <section className="mt-14">
        <div className="mb-5">
          <h2 className="section-heading">Instagram Account Performance</h2>
          <p className="font-mulish mt-1" style={{ fontSize: '11.5px', color: '#555555' }}>
            1 Mei – 2 Jun 2026 &nbsp;&middot;&nbsp; {filtered.length} akun dealer
            &nbsp;&middot;&nbsp; {totalPosts} post
            &nbsp;&middot;&nbsp; {totalLikes.toLocaleString('id-ID')} likes
            {totalViews > 0 && <> &nbsp;&middot;&nbsp; {totalViews.toLocaleString('id-ID')} views</>}
          </p>
          <hr className="section-rule mt-3" />
        </div>

        {/* Main Dealer dropdown checklist */}
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mulish font-semibold" style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Filter by Main Dealer
          </span>
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
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
                  ? 'All Dealers'
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
                {/* Clear all */}
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
                    {selectedDealers.length > 0 ? '✕ Clear filter' : 'All Dealers'}
                  </button>
                </div>

                {/* Dealer options */}
                {mainDealers.map(dealer => {
                  const count = accounts.filter(a => a.main_dealer === dealer).length
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
                      <span className="font-mulish" style={{ fontSize: '10.5px', color: '#374151', flex: 1 }}>
                        {dealer}
                      </span>
                      <span className="font-roboto font-bold" style={{ fontSize: '10px', color: '#9CA3AF' }}>
                        {count}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {selectedDealers.length > 0 && (
            <span className="font-mulish" style={{ fontSize: '10px', color: '#9CA3AF' }}>
              Showing {filtered.length} of {accounts.length} accounts
            </span>
          )}
        </div>

        <div className="overflow-x-auto" style={{ border: '1px solid #E5E7EB', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB', background: '#F7F7F7' }}>
                {headers.map((h) => {
                  const pillarEntry = PILLAR_COLS.find(p => p.label === h)
                  return (
                    <th
                      key={h}
                      className="font-mulish font-bold"
                      style={{
                        fontSize: '9px',
                        color: pillarEntry ? PILLAR_COLOR[pillarEntry.key] : '#9CA3AF',
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        padding: h === '#' ? '10px 12px' : '10px 14px',
                        textAlign: CENTER_COLS.has(h) ? 'center' : 'left',
                        whiteSpace: 'nowrap',
                        borderLeft: h === PILLAR_COLS[0].label ? '1px solid #E5E7EB' : undefined,
                      }}
                    >
                      {h}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((account, i) => (
                <tr
                  key={account.username}
                  style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '#FFF5F5')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '')}
                >
                  {/* Rank */}
                  <td style={{ textAlign: 'center', padding: '12px', width: 36 }}>
                    <span className="font-roboto font-bold" style={{ fontSize: '11px', color: i < 3 ? '#E62533' : '#9CA3AF' }}>
                      {i + 1}
                    </span>
                  </td>

                  {/* Account */}
                  <td style={{ padding: '10px 14px', minWidth: 190 }}>
                    <AccountCell account={account} />
                  </td>

                  {/* Posts — clickable, shows all posts */}
                  <td style={{ textAlign: 'center', padding: '12px 14px', width: 60 }}>
                    <button
                      onClick={() => openModal(account.username, account.full_name ?? account.username, null)}
                      className="font-roboto font-bold"
                      style={{ fontSize: '14px', color: '#E62533', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                    >
                      {account.post_count}
                    </button>
                  </td>

                  {/* Likes */}
                  <td style={{ textAlign: 'center', padding: '12px 14px', width: 68 }}>
                    <span className="font-roboto font-bold" style={{ fontSize: '14px', color: account.total_likes > 0 ? '#E62533' : '#D1D5DB' }}>
                      {account.total_likes > 0 ? formatNum(account.total_likes) : '—'}
                    </span>
                  </td>

                  {/* Views */}
                  <td style={{ textAlign: 'center', padding: '12px 14px', width: 72 }}>
                    <span className="font-roboto font-bold" style={{ fontSize: '14px', color: account.total_views > 0 ? '#E62533' : '#D1D5DB' }}>
                      {account.total_views > 0 ? formatNum(account.total_views) : '—'}
                    </span>
                  </td>

                  {/* Comments */}
                  <td style={{ textAlign: 'center', padding: '12px 14px', width: 76 }}>
                    <span className="font-roboto font-bold" style={{ fontSize: '14px', color: account.total_comments > 0 ? '#E62533' : '#D1D5DB' }}>
                      {account.total_comments > 0 ? formatNum(account.total_comments) : '—'}
                    </span>
                  </td>

                  {/* Last Post */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: 100 }}>
                    <span className="font-mulish" style={{ fontSize: '10px', color: '#555555' }}>
                      {formatDate(account.last_post_date)}
                    </span>
                  </td>

                  {/* Pillar columns — each clickable, filtered by pillar */}
                  {PILLAR_COLS.map(({ key }, pi) => {
                    const count = account.pillar_breakdown[key] ?? 0
                    return (
                      <td
                        key={key}
                        style={{
                          textAlign: 'center',
                          padding: '12px 14px',
                          width: 72,
                          borderLeft: pi === 0 ? '1px solid #E5E7EB' : undefined,
                        }}
                      >
                        {count > 0 ? (
                          <button
                            onClick={() => openModal(account.username, account.full_name ?? account.username, key)}
                            className="font-roboto font-bold"
                            style={{ fontSize: '14px', color: PILLAR_COLOR[key], background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                          >
                            {count}
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#E5E7EB' }}>—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
