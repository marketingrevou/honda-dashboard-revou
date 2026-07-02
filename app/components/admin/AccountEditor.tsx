'use client'

import { useMemo, useState, useTransition } from 'react'
import { updateAccount } from '@/app/actions/admin'
import { Button, Card, StatusText, inputStyle, type SaveState } from './ui'

export interface AccountRow {
  username: string
  dealer_name: string | null
  main_dealer: string | null
}

function Row({ account }: { account: AccountRow }) {
  const [dealerName, setDealerName] = useState(account.dealer_name ?? '')
  const [mainDealer, setMainDealer] = useState(account.main_dealer ?? '')
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const dirty = dealerName !== (account.dealer_name ?? '') || mainDealer !== (account.main_dealer ?? '')

  function save() {
    setState('saving')
    startTransition(async () => {
      const res = await updateAccount(account.username, {
        dealer_name: dealerName,
        main_dealer: mainDealer,
      })
      if (res.ok) setState('saved')
      else {
        setState('error')
        setError(res.error)
      }
    })
  }

  function onChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value)
      if (state !== 'idle') setState('idle')
    }
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      style={{ padding: '10px 0', borderBottom: '1px solid #F0F0F0' }}
    >
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <span className="font-semibold" style={{ fontSize: '13px', color: '#111827' }}>@{account.username}</span>
      </div>
      <input
        value={mainDealer}
        onChange={onChange(setMainDealer)}
        placeholder="Main dealer"
        style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }}
      />
      <input
        value={dealerName}
        onChange={onChange(setDealerName)}
        placeholder="Dealer name"
        style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }}
      />
      <div className="flex items-center gap-2" style={{ flex: '0 0 auto' }}>
        <Button onClick={save} disabled={pending || !dirty} variant="secondary">
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <StatusText state={state} error={error} />
      </div>
    </div>
  )
}

export default function AccountEditor({ accounts }: { accounts: AccountRow[] }) {
  const [filter, setFilter] = useState('')
  // Re-mount rows if the incoming server data changes, but keep local edits
  // stable while typing in the filter.
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter(
      (a) =>
        a.username.toLowerCase().includes(q) ||
        (a.dealer_name ?? '').toLowerCase().includes(q) ||
        (a.main_dealer ?? '').toLowerCase().includes(q),
    )
  }, [accounts, filter])

  return (
    <Card title="Account Details" description={`Edit dealer labels. ${accounts.length} accounts.`}>
      <input
        value={filter}
        onChange={(e) => startTransition(() => setFilter(e.target.value))}
        placeholder="Filter accounts…"
        style={{ ...inputStyle, marginBottom: '12px' }}
      />
      <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
        {filtered.map((a) => (
          <Row key={a.username} account={a} />
        ))}
        {filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: '#555555', padding: '12px 0' }}>No matching accounts.</p>
        )}
      </div>
    </Card>
  )
}
