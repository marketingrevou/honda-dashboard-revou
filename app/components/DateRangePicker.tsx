'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface DateRangePickerProps {
  dateFrom: string
  dateTo: string
  minDate: string
  maxDate: string
}

const inputStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'inherit',
  background: 'transparent',
  border: 'none',
  color: '#555555',
  cursor: 'pointer',
  outline: 'none',
  padding: '0',
  width: '88px',
}

const applyStyle: React.CSSProperties = {
  fontSize: '10px',
  fontFamily: 'inherit',
  fontWeight: 700,
  background: '#E62533',
  color: '#fff',
  border: 'none',
  borderRadius: '2px',
  padding: '2px 8px',
  cursor: 'pointer',
  letterSpacing: '0.3px',
  marginLeft: '4px',
}

export default function DateRangePicker({ dateFrom, dateTo, minDate, maxDate }: DateRangePickerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [from, setFrom] = useState(dateFrom)
  const [to, setTo] = useState(dateTo)

  function apply() {
    if (!from || !to || from > to) return
    startTransition(() => {
      router.push(`/dashboard?from=${from}&to=${to}`)
    })
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); apply() }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: '#F0F0F0',
        padding: '3px 10px',
        borderRadius: '2px',
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <input
        type="date"
        value={from}
        min={minDate}
        max={to || maxDate}
        onChange={(e) => setFrom(e.target.value)}
        style={inputStyle}
      />
      <span style={{ fontSize: '10px', color: '#9CA3AF' }}>–</span>
      <input
        type="date"
        value={to}
        min={from || minDate}
        max={maxDate}
        onChange={(e) => setTo(e.target.value)}
        style={inputStyle}
      />
      <button type="submit" style={applyStyle}>
        {isPending ? '…' : 'Apply'}
      </button>
    </form>
  )
}
