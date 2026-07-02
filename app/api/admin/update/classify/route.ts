import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { classifyUnclassified, makeSupabase } from '@/lib/run-update'
import { guardAdmin } from '@/lib/admin-route'

// Phase 2 of the admin Update: classify a bounded batch of posts whose
// classification_source IS NULL. The client loops until `done`. Each batch is
// sized to stay under the function limit (OpenAI calls dominate the time).
export const maxDuration = 60

const BATCH_LIMIT = 8

export async function POST() {
  const denied = await guardAdmin()
  if (denied) return denied

  const supabase = makeSupabase()
  const result = await classifyUnclassified(supabase, { limit: BATCH_LIMIT })

  if (result.classified > 0) revalidatePath('/dashboard')

  return NextResponse.json(result)
}
