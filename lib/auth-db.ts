import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

/**
 * Server-side auth helpers for the dashboard login system.
 *
 * Uses the Supabase service-role key so it bypasses RLS on `dashboard_users`
 * (the table has RLS enabled with no public policies). NEVER import this from a
 * client component — the service-role key must stay server-only.
 */

export const AUTH_COOKIE = 'honda_auth'
export const USER_COOKIE = 'honda_user'

function authSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return secret
}

/** Service-role client. Mirrors the pattern in lib/run-update.ts. */
export function makeAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface DashboardUser {
  username: string
  password_hash: string
  email: string | null
  is_admin: boolean
  must_change_password: boolean
  reset_token: string | null
  reset_token_expires_at: string | null
}

export async function getUserByUsername(username: string): Promise<DashboardUser | null> {
  const supabase = makeAuthClient()
  const { data } = await supabase
    .from('dashboard_users')
    .select('*')
    .eq('username', username)
    .maybeSingle()
  return (data as DashboardUser | null) ?? null
}

/**
 * Auth cookie value is `username.HMAC(username)`. The HMAC makes it
 * unforgeable without AUTH_SECRET, so the proxy can verify a session without
 * a DB lookup.
 */
export function signSession(username: string): string {
  const sig = createHmac('sha256', authSecret()).update(username).digest('hex')
  return `${username}.${sig}`
}

/** Verifies a session cookie value and returns the username, or null. */
export function verifySession(value: string | undefined): string | null {
  if (!value) return null
  const idx = value.lastIndexOf('.')
  if (idx <= 0) return null
  const username = value.slice(0, idx)
  const sig = value.slice(idx + 1)
  const expected = createHmac('sha256', authSecret()).update(username).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? username : null
}

/**
 * Resolve the currently logged-in user from the request cookies, verifying the
 * HMAC-signed session before trusting the username. Returns null if there's no
 * valid session or the user no longer exists. Server-only (reads cookies + the
 * service-role client).
 */
export async function getCurrentUser(): Promise<DashboardUser | null> {
  const cookieStore = await cookies()
  const username = verifySession(cookieStore.get(AUTH_COOKIE)?.value)
  if (!username) return null
  return getUserByUsername(username)
}

/**
 * Guard for admin-only server actions and route handlers. Returns the user on
 * success; throws otherwise. NEVER trust the client — every admin mutation must
 * call this first, since server actions and routes are reachable via direct
 * POST regardless of the UI or proxy.
 */
export async function requireAdmin(): Promise<DashboardUser> {
  const user = await getCurrentUser()
  if (!user || !user.is_admin) {
    throw new Error('Forbidden: admin access required')
  }
  return user
}
