import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_TOKEN = 'hrd2026-authenticated'

export function proxy(request: NextRequest) {
  const auth = request.cookies.get('honda_auth')

  if (!auth || auth.value !== AUTH_TOKEN) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
