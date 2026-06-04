'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null)

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F7F7F7' }}>
      <div className="w-full max-w-sm">
        <div
          className="bg-white rounded-lg overflow-hidden"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div style={{ height: '4px', background: '#E62533' }} />
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
              style={{ fontSize: '15px', color: '#111827', marginBottom: '4px' }}
            >
              Digital Content Intelligence
            </h1>
            <p className="text-center" style={{ fontSize: '13px', color: '#555555', marginBottom: '28px' }}>
              Dashboard
            </p>

            <form action={formAction} className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="block font-semibold"
                  style={{ fontSize: '13px', color: '#333333', marginBottom: '6px' }}
                >
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="Enter username"
                  className="w-full"
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#111827',
                    outline: 'none',
                    background: '#fff',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block font-semibold"
                  style={{ fontSize: '13px', color: '#333333', marginBottom: '6px' }}
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter password"
                  className="w-full"
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#111827',
                    outline: 'none',
                    background: '#fff',
                  }}
                />
              </div>

              {state?.error && (
                <p style={{ fontSize: '13px', color: '#E62533', margin: '0' }}>{state.error}</p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full font-semibold"
                style={{
                  marginTop: '8px',
                  padding: '11px',
                  background: '#E62533',
                  color: 'white',
                  borderRadius: '6px',
                  fontSize: '14px',
                  border: 'none',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {isPending ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center mt-4" style={{ fontSize: '12px', color: '#BBBBBB' }}>
          Honda Indonesia · Authorized Access Only
        </p>
      </div>
    </div>
  )
}
