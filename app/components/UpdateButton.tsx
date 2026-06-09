'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface UpdateButtonProps {
  latestDate: string | null
}

export default function UpdateButton({ latestDate }: UpdateButtonProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleUpdate() {
    setStatus('loading')
    try {
      const res = await fetch('/api/update', { method: 'POST' })
      if (!res.ok) throw new Error('Update failed')
      setStatus('done')
      router.refresh()
    } catch {
      setStatus('error')
    }
  }

  // Status checks first — so success/error always render regardless of date state
  if (status === 'done') {
    return (
      <span className="meta-chip text-white" style={{ background: '#16a34a', fontSize: '12px' }}>
        ✓ Updated
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span
        className="meta-chip"
        style={{ background: '#fee2e2', color: '#991b1b', fontSize: '12px', cursor: 'pointer' }}
        onClick={handleUpdate}
      >
        Update failed — retry
      </span>
    )
  }

  // Hide button if data is already current through yesterday
  if (!latestDate) return null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setUTCDate(today.getUTCDate() - 1)
  const latestDay = new Date(latestDate)
  latestDay.setUTCHours(0, 0, 0, 0)
  if (yesterday <= latestDay) return null

  return (
    <button
      onClick={handleUpdate}
      disabled={status === 'loading'}
      className="meta-chip"
      style={{
        background: status === 'loading' ? '#E5E7EB' : '#E62533',
        color: status === 'loading' ? '#6B7280' : '#ffffff',
        border: 'none',
        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        fontSize: '12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {status === 'loading' && (
        <span
          style={{
            width: '10px',
            height: '10px',
            border: '2px solid #9CA3AF',
            borderTopColor: '#374151',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      )}
      {status === 'loading' ? 'Updating…' : 'Update'}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}
