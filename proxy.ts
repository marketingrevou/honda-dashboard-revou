import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

// Self-contained session verification. Proxy should not rely on shared
// modules/globals (per Next.js proxy docs), so the HMAC check is inlined.
// The auth cookie value is `username.HMAC(username)` — see lib/auth-db.ts.
function isValidSession(value: string | undefined): boolean {
  if (!value) return false
  const secret = process.env.AUTH_SECRET
  if (!secret) return false

  const idx = value.lastIndexOf('.')
  if (idx <= 0) return false

  const username = value.slice(0, idx)
  const sig = value.slice(idx + 1)
  const expected = createHmac('sha256', secret).update(username).digest('hex')

  let a: Buffer
  let b: Buffer
  try {
    a = Buffer.from(sig, 'hex')
    b = Buffer.from(expected, 'hex')
  } catch {
    return false
  }
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function proxy(request: NextRequest) {
  const auth = request.cookies.get('honda_auth')

  if (!isValidSession(auth?.value)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
