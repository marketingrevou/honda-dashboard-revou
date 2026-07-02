import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-db'

/**
 * Route-handler guard for the /api/admin/* endpoints. These are triggered from
 * the authenticated admin browser (not the cron), so they authorize on the
 * `is_admin` flag rather than the CRON_SECRET header. Returns a 403 NextResponse
 * to short-circuit with, or null when the caller is a verified admin.
 *
 * Usage:
 *   const denied = await guardAdmin()
 *   if (denied) return denied
 */
export async function guardAdmin(): Promise<NextResponse | null> {
  const user = await getCurrentUser()
  if (!user || !user.is_admin) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }
  return null
}
