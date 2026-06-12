'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'

/** Shared visual shell + form primitives for the login / forgot / reset pages. */

const HONDA_RED = '#E62533'

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F7F7F7' }}>
      <div className="w-full max-w-sm">
        <div
          className="bg-white rounded-lg overflow-hidden"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div style={{ height: '4px', background: HONDA_RED }} />
          <div className="p-8">
            <div className="flex justify-center mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://asset.honda-indonesia.com/2023/10/19/logo-side.svg"
                alt="Honda"
                style={{ height: '36px' }}
              />
            </div>

            <h1
              className="text-center font-roboto font-bold"
              style={{ fontSize: '16px', color: '#111827', marginBottom: '4px' }}
            >
              {title}
            </h1>
            <p className="text-center" style={{ fontSize: '13px', color: '#555555', marginBottom: '28px' }}>
              {subtitle}
            </p>

            {children}
          </div>
        </div>

        <p className="text-center mt-4" style={{ fontSize: '12px', color: '#BBBBBB' }}>
          Honda Indonesia · Authorized Access Only
        </p>
      </div>
    </div>
  )
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #E5E7EB',
  borderRadius: '6px',
  fontSize: '14px',
  color: '#111827',
  outline: 'none',
  background: '#fff',
  width: '100%',
}

const labelStyle: CSSProperties = {
  fontSize: '13px',
  color: '#333333',
  marginBottom: '6px',
}

export function Field({
  id,
  label,
  ...rest
}: {
  id: string
  label: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block font-semibold" style={labelStyle}>
        {label}
      </label>
      <input id={id} className="w-full" style={inputStyle} {...rest} />
    </div>
  )
}

/** Password field with a show/hide toggle. */
export function PasswordField({
  id,
  label,
  name,
  autoComplete = 'current-password',
  placeholder = 'Enter password',
}: {
  id: string
  label: string
  name: string
  autoComplete?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="block font-semibold" style={labelStyle}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          style={{ ...inputStyle, paddingRight: '52px' }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            color: HONDA_RED,
            fontWeight: 600,
            padding: '2px 4px',
          }}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

export function SubmitButton({
  pending,
  idleLabel,
  pendingLabel,
}: {
  pending: boolean
  idleLabel: string
  pendingLabel: string
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full font-semibold"
      style={{
        marginTop: '8px',
        padding: '11px',
        background: HONDA_RED,
        color: 'white',
        borderRadius: '6px',
        fontSize: '14px',
        border: 'none',
        cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.7 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: '13px', color: HONDA_RED, margin: 0 }}>{children}</p>
}

export function InfoText({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: '13px', color: '#2F7D32', margin: 0 }}>{children}</p>
}
