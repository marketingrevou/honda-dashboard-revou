'use client'

import { useState, useTransition } from 'react'
import { updatePillarDescription } from '@/app/actions/admin'
import { Button, Card, StatusText, inputStyle, type SaveState } from './ui'

interface PillarRow {
  pillar: string
  description: string
}

function Row({ pillar, initial }: { pillar: string; initial: string }) {
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const dirty = value !== initial

  function save() {
    setState('saving')
    startTransition(async () => {
      const res = await updatePillarDescription(pillar, value)
      if (res.ok) {
        setState('saved')
      } else {
        setState('error')
        setError(res.error)
      }
    })
  }

  return (
    <div style={{ marginBottom: '18px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
        <label className="font-semibold" style={{ fontSize: '13px', color: '#333333' }}>
          {pillar}
        </label>
        <StatusText state={state} error={error} />
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (state !== 'idle') setState('idle')
        }}
        rows={pillar === 'Negative' ? 8 : 3}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
      />
      <div style={{ marginTop: '8px' }}>
        <Button onClick={save} disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

export default function PillarConfigEditor({ rows }: { rows: PillarRow[] }) {
  return (
    <Card
      title="Pillar Descriptions"
      description="These descriptions are fed into the AI classifier. Edits apply to NEW classifications after the server restarts. To re-apply to existing posts, run a reclassify or the reclassify-all script."
    >
      {rows.map((r) => (
        <Row key={r.pillar} pillar={r.pillar} initial={r.description} />
      ))}
    </Card>
  )
}
