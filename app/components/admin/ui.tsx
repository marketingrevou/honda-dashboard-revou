'use client'

import type { CSSProperties, ReactNode } from 'react'

/** Shared visual primitives for the admin editors, matching the Honda theme. */

export const HONDA_RED = '#E62533'

export const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #E5E7EB',
  borderRadius: '6px',
  fontSize: '13px',
  color: '#111827',
  outline: 'none',
  background: '#fff',
  width: '100%',
}

export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section
      className="bg-white rounded-lg"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}
    >
      <div style={{ height: '3px', background: HONDA_RED, borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }} />
      <div className="p-6">
        <h2 className="font-roboto font-bold" style={{ fontSize: '15px', color: '#111827', marginBottom: description ? '2px' : '16px' }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: '12px', color: '#555555', marginBottom: '16px' }}>{description}</p>
        )}
        {children}
      </div>
    </section>
  )
}

export function Button({
  onClick,
  disabled,
  variant = 'primary',
  children,
  type = 'button',
}: {
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  children: ReactNode
  type?: 'button' | 'submit'
}) {
  const bg = variant === 'primary' ? HONDA_RED : '#fff'
  const color = variant === 'primary' ? '#fff' : '#333333'
  const border = variant === 'primary' ? 'none' : '1px solid #E5E7EB'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="font-semibold"
      style={{
        padding: '8px 14px',
        background: bg,
        color,
        border,
        borderRadius: '6px',
        fontSize: '13px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {children}
    </button>
  )
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function StatusText({ state, error }: { state: SaveState; error?: string }) {
  if (state === 'saving') return <span style={{ fontSize: '12px', color: '#555555' }}>Saving…</span>
  if (state === 'saved') return <span style={{ fontSize: '12px', color: '#2F7D32' }}>Saved ✓</span>
  if (state === 'error') return <span style={{ fontSize: '12px', color: HONDA_RED }}>{error ?? 'Error'}</span>
  return null
}
