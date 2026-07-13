import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, makeAuthClient } from '@/lib/auth-db'
import { VALID_PILLARS, PILLAR_DESCRIPTIONS_FALLBACK } from '@/lib/pillar-config'
import { logout } from '@/app/actions/auth'
import PillarConfigEditor from '@/app/components/admin/PillarConfigEditor'
import AccountEditor, { type AccountRow } from '@/app/components/admin/AccountEditor'
import UpdateStatus from '@/app/components/admin/UpdateStatus'

function AdminHeader() {
  return (
    <header className="bg-white" style={{ borderTop: '4px solid #E62533', borderBottom: '1px solid #E5E7EB' }}>
      <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://asset.honda-indonesia.com/2023/10/19/logo-side.svg" alt="Honda" className="h-8 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="font-roboto font-bold truncate" style={{ fontSize: '15px', color: '#111827' }}>
            Admin · Data Management
          </h1>
        </div>
        <Link href="/dashboard" style={{ fontSize: '12px', color: '#555555' }}>
          ← Dashboard
        </Link>
        <form action={logout as () => Promise<void>}>
          <button
            type="submit"
            style={{ fontSize: '12px', color: '#999999', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
          >
            Sign Out
          </button>
        </form>
      </div>
    </header>
  )
}

/** Auth-gated, data-dependent body. Kept behind <Suspense> so the uncached
 *  cookie read + Supabase fetches render at request time (Cache Components). */
async function AdminContent() {
  const user = await getCurrentUser()
  if (!user) redirect('/')
  if (!user.is_admin) redirect('/dashboard')

  const supabase = makeAuthClient()
  const [{ data: pillarRows }, { data: accountRows }] = await Promise.all([
    supabase.from('pillar_config').select('pillar, description'),
    supabase.from('instagram_accounts').select('username, dealer_name, main_dealer').order('username'),
  ])

  // Effective description per pillar: DB row if present + non-empty, else the
  // hardcoded fallback — so the editor always shows what the classifier uses.
  const byPillar = new Map((pillarRows ?? []).map((r) => [r.pillar, r.description as string]))
  const pillars = VALID_PILLARS.map((pillar) => {
    const dbDesc = byPillar.get(pillar)
    return { pillar, description: dbDesc && dbDesc.trim() ? dbDesc : PILLAR_DESCRIPTIONS_FALLBACK[pillar] }
  })

  const accounts = (accountRows ?? []) as AccountRow[]

  return (
    <>
      <UpdateStatus />
      <PillarConfigEditor rows={pillars} />
      <AccountEditor accounts={accounts} />
    </>
  )
}

export default function AdminPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F7F7' }}>
      <AdminHeader />
      <main className="max-w-screen-md mx-auto px-4 sm:px-6 py-6">
        <Suspense fallback={<p style={{ fontSize: '13px', color: '#555555' }}>Loading…</p>}>
          <AdminContent />
        </Suspense>
      </main>
    </div>
  )
}
