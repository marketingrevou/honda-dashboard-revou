import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { runUpdate, makeSupabase } from '@/lib/run-update'

const AUTH_TOKEN = 'hrd2026-authenticated'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const auth = cookieStore.get('honda_auth')
  if (auth?.value !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let dateFrom: Date | undefined
  let dateTo: Date | undefined

  try {
    const body = await req.json()
    if (body.dateFrom) dateFrom = new Date(body.dateFrom)
    if (body.dateTo) dateTo = new Date(body.dateTo)
  } catch {
    // no body — use auto-calculated range
  }

  const result = await runUpdate(makeSupabase(), dateFrom, dateTo)
  revalidatePath('/dashboard')

  return NextResponse.json({ success: true, ...result })
}
