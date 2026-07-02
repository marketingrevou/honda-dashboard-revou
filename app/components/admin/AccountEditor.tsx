'use client'

import { useMemo, useState, useTransition } from 'react'
import { addAccount, deleteAccount, updateAccount } from '@/app/actions/admin'
import { Button, Card, StatusText, inputStyle, type SaveState } from './ui'

export interface AccountRow {
  username: string
  dealer_name: string | null
  main_dealer: string | null
}

function Row({ account, onDeleted }: { account: AccountRow; onDeleted: (username: string) => void }) {
  const [dealerName, setDealerName] = useState(account.dealer_name ?? '')
  const [mainDealer, setMainDealer] = useState(account.main_dealer ?? '')
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const [deleting, startDelete] = useTransition()

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

  function remove() {
    if (
      !window.confirm(
        `Remove @${account.username}? This permanently deletes the account AND all its posts from the dashboard, and stops it being scraped. This cannot be undone.`,
      )
    ) {
      return
    }
    setState('idle')
    setError(undefined)
    startDelete(async () => {
      const res = await deleteAccount(account.username)
      if (res.ok) {
        onDeleted(account.username)
      } else {
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
        <Button onClick={save} disabled={pending || deleting || !dirty} variant="secondary">
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <button
          onClick={remove}
          disabled={pending || deleting}
          title={`Remove @${account.username}`}
          style={{
            fontSize: '12px',
            color: '#B91C1C',
            background: 'none',
            border: '1px solid #FCA5A5',
            borderRadius: '6px',
            padding: '5px 10px',
            cursor: pending || deleting ? 'default' : 'pointer',
            opacity: pending || deleting ? 0.5 : 1,
          }}
        >
          {deleting ? 'Removing…' : 'Remove'}
        </button>
        <StatusText state={state} error={error} />
      </div>
    </div>
  )
}

function AddAccountForm({ onAdded }: { onAdded: (account: AccountRow) => void }) {
  const [username, setUsername] = useState('')
  const [mainDealer, setMainDealer] = useState('')
  const [dealerName, setDealerName] = useState('')
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function add() {
    if (!username.trim()) return
    setState('saving')
    setError(undefined)
    startTransition(async () => {
      const res = await addAccount(username, { dealer_name: dealerName, main_dealer: mainDealer })
      if (res.ok) {
        // Optimistically show the new row; the server also revalidates so a
        // reload reflects the canonical (normalised) username.
        const normalised = username.trim().replace(/^@/, '').toLowerCase()
        onAdded({
          username: normalised,
          dealer_name: dealerName.trim() || null,
          main_dealer: mainDealer.trim() || null,
        })
        setUsername('')
        setMainDealer('')
        setDealerName('')
        setState('saved')
      } else {
        setState('error')
        setError(res.error)
      }
    })
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      style={{ padding: '12px', background: '#F9FAFB', borderRadius: '8px', marginBottom: '14px' }}
    >
      <input
        value={username}
        onChange={(e) => {
          setUsername(e.target.value)
          if (state !== 'idle') setState('idle')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
        }}
        placeholder="New IG username (or profile URL)"
        style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }}
      />
      <input
        value={mainDealer}
        onChange={(e) => setMainDealer(e.target.value)}
        placeholder="Main dealer (optional)"
        style={{ ...inputStyle, flex: '1 1 150px', width: 'auto' }}
      />
      <input
        value={dealerName}
        onChange={(e) => setDealerName(e.target.value)}
        placeholder="Dealer name (optional)"
        style={{ ...inputStyle, flex: '1 1 150px', width: 'auto' }}
      />
      <div className="flex items-center gap-2" style={{ flex: '0 0 auto' }}>
        <Button onClick={add} disabled={pending || !username.trim()}>
          {pending ? 'Adding…' : 'Add account'}
        </Button>
        <StatusText state={state} error={error} />
      </div>
    </div>
  )
}

export default function AccountEditor({ accounts }: { accounts: AccountRow[] }) {
  const [filter, setFilter] = useState('')
  // Local overlay so add/remove reflect immediately without a full reload; the
  // server actions also revalidate /admin so a refresh shows the canonical data.
  const [added, setAdded] = useState<AccountRow[]>([])
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const merged = useMemo(() => {
    const all = [...accounts, ...added].filter((a) => !removed.has(a.username))
    // De-dupe by username (an added row may also arrive via revalidated props).
    const seen = new Set<string>()
    const unique: AccountRow[] = []
    for (const a of all) {
      if (seen.has(a.username)) continue
      seen.add(a.username)
      unique.push(a)
    }
    return unique.sort((a, b) => a.username.localeCompare(b.username))
  }, [accounts, added, removed])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return merged
    return merged.filter(
      (a) =>
        a.username.toLowerCase().includes(q) ||
        (a.dealer_name ?? '').toLowerCase().includes(q) ||
        (a.main_dealer ?? '').toLowerCase().includes(q),
    )
  }, [merged, filter])

  return (
    <Card
      title="Account Details"
      description={`Add or remove dealers and edit their labels. ${merged.length} accounts scraped.`}
    >
      <AddAccountForm onAdded={(a) => setAdded((prev) => [...prev, a])} />

      <input
        value={filter}
        onChange={(e) => startTransition(() => setFilter(e.target.value))}
        placeholder="Filter accounts…"
        style={{ ...inputStyle, marginBottom: '12px' }}
      />
      <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
        {filtered.map((a) => (
          <Row
            key={a.username}
            account={a}
            onDeleted={(username) => setRemoved((prev) => new Set(prev).add(username))}
          />
        ))}
        {filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: '#555555', padding: '12px 0' }}>No matching accounts.</p>
        )}
      </div>
    </Card>
  )
}
