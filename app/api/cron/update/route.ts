import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { runUpdate, makeSupabase } from '@/lib/run-update'

// Full update scrapes every account — allow the full execution window.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = makeSupabase()
  const result = await runUpdate(supabase)
  revalidatePath('/dashboard')

  return NextResponse.json({ success: true, ...result })
}
