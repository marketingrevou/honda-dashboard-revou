import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { refreshThumbnails, makeSupabase } from '@/lib/run-update'

// Refreshing every account's posts takes a while; allow the full window.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await refreshThumbnails(makeSupabase())
  revalidatePath('/dashboard')

  return NextResponse.json({ success: true, ...result })
}
