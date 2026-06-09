import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { runUpdate, makeSupabase } from '@/lib/run-update'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runUpdate(makeSupabase())
  revalidatePath('/dashboard')

  return NextResponse.json({ success: true, ...result })
}
