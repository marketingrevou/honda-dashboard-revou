'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card } from './ui'
import { triggerUpdate, getLatestRun, type UpdateRun } from '@/app/actions/admin'

// Poll cadence for the update_runs status row while a run is active.
const POLL_MS = 5000

const PHASE_LABEL: Record<string, string> = {
  scrape: 'Scraping Instagram',
  refresh: 'Refreshing metrics',
  classify: 'Classifying new posts',
  done: 'Done',
}

function elapsed(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const secs = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/**
 * Update pipeline runner + live status panel.
 *
 * The pipeline runs on GitHub Actions (escaping the Edge Function 546
 * WORKER_LIMIT). "Run Update" dispatches the workflow via triggerUpdate(); the
 * run streams progress into update_runs, which this panel polls via
 * getLatestRun() every 5s and renders — phase, counts, elapsed, log — until the
 * run reaches a terminal status. Because it reads the newest row, it also shows
 * the Monday scheduled run to anyone who opens /admin while it's in flight.
 */
export default function UpdateStatus() {
  const [run, setRun] = useState<UpdateRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [reclassifyLog, setReclassifyLog] = useState<string[]>([])
  const [reclassifying, setReclassifying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const latest = await getLatestRun()
      setRun(latest)
    } catch {
      // transient read failure — keep the last known state, try again next tick
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll while the newest run is still running; stop once it's terminal.
  useEffect(() => {
    let cancelled = false
    async function tick() {
      await refresh()
      if (cancelled) return
      timerRef.current = setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [refresh])

  const isRunning = run?.status === 'running'

  async function onRunUpdate() {
    if (dispatching || isRunning) return
    if (
      !window.confirm(
        'Trigger a full Update on GitHub Actions? This scrapes Instagram, refreshes metrics, then classifies new posts. It uses Apify and OpenAI credits and takes ~10–20 minutes. You can safely close this tab — the run continues on GitHub.',
      )
    ) {
      return
    }
    setDispatching(true)
    setDispatchError(null)
    const r = await triggerUpdate()
    if (!r.ok) setDispatchError(r.error)
    // Give the runner a moment to create its update_runs row, then poll it in.
    setTimeout(refresh, 3000)
    setDispatching(false)
  }

  async function onReclassify() {
    if (reclassifying) return
    if (!window.confirm('Re-run vision classification on all posts marked Negative? Uses OpenAI credits.')) return
    setReclassifying(true)
    setReclassifyLog(['Reclassifying Negative posts…'])
    try {
      let total = 0
      for (;;) {
        const res = await fetch('/api/admin/reclassify', { method: 'POST' })
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
        if (!res.ok) throw new Error((body.error as string) ?? `${res.status} ${res.statusText}`)
        const reclassified = (body.reclassified as number) ?? 0
        const remaining = (body.remaining as number) ?? 0
        total += reclassified
        setReclassifyLog((l) => [
          ...l,
          `  Checked ${body.processed}, moved off Negative: ${reclassified}, ${remaining} remaining`,
        ])
        if (body.done) break
      }
      setReclassifyLog((l) => [...l, `Reclassify complete ✓ (${total} moved off Negative)`])
    } catch (err) {
      setReclassifyLog((l) => [...l, `Failed: ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setReclassifying(false)
    }
  }

  return (
    <Card
      title="Data Pipelines"
      description="Update runs on GitHub Actions: scrapes Instagram → refreshes metrics → classifies new posts. Also runs automatically every Monday. This panel shows the latest run live. Reclassify re-checks posts marked Negative."
    >
      <div className="flex items-center gap-3" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
        <Button onClick={onRunUpdate} disabled={dispatching || isRunning}>
          {dispatching ? 'Triggering…' : isRunning ? 'Running…' : 'Run Update'}
        </Button>
        <Button onClick={onReclassify} disabled={reclassifying} variant="secondary">
          {reclassifying ? 'Reclassifying…' : 'Reclassify Negatives'}
        </Button>
        {dispatchError && (
          <span style={{ fontSize: '12px', color: '#E62533' }}>Trigger failed: {dispatchError}</span>
        )}
      </div>

      {/* Latest run status */}
      {loading ? (
        <p style={{ fontSize: '12px', color: '#555555' }}>Loading latest run…</p>
      ) : run ? (
        <RunPanel run={run} />
      ) : (
        <p style={{ fontSize: '12px', color: '#555555' }}>No update run recorded yet.</p>
      )}

      {reclassifyLog.length > 0 && <LogBox lines={reclassifyLog} />}
    </Card>
  )
}

function RunPanel({ run }: { run: UpdateRun }) {
  const badge =
    run.status === 'success'
      ? { text: 'Success ✓', color: '#166534', bg: '#DCFCE7' }
      : run.status === 'failed'
        ? { text: 'Failed ✕', color: '#991B1B', bg: '#FEE2E2' }
        : { text: 'Running…', color: '#92400E', bg: '#FEF3C7' }

  const phase = run.phase ? PHASE_LABEL[run.phase] ?? run.phase : '—'

  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: '8px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: badge.color,
            background: badge.bg,
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          {badge.text}
        </span>
        <span style={{ fontSize: '12px', color: '#555555' }}>
          {run.trigger === 'manual' ? 'Manual' : 'Scheduled'} · phase: <strong>{phase}</strong> ·{' '}
          {elapsed(run.started_at, run.finished_at)}
        </span>
      </div>

      <div className="flex gap-4" style={{ fontSize: '12px', color: '#333333', marginBottom: run.log ? '10px' : 0, flexWrap: 'wrap' }}>
        <span>Accounts: <strong>{run.accounts_processed ?? 0}</strong></span>
        <span>Posts added: <strong>{run.posts_added ?? 0}</strong></span>
        <span>Classified: <strong>{run.posts_classified ?? 0}</strong></span>
      </div>

      {run.error && (
        <p style={{ fontSize: '12px', color: '#991B1B', marginBottom: '8px' }}>Error: {run.error}</p>
      )}

      {run.log && <LogBox lines={run.log.split('\n')} />}
    </div>
  )
}

function LogBox({ lines }: { lines: string[] }) {
  return (
    <div
      style={{
        background: '#111827',
        borderRadius: '6px',
        padding: '12px 14px',
        maxHeight: '340px',
        overflowY: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        lineHeight: 1.6,
        color: '#E5E7EB',
        whiteSpace: 'pre-wrap',
      }}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            color: /fail|error|✕/i.test(l) ? '#FCA5A5' : /complete|✓|done/i.test(l) ? '#86EFAC' : '#E5E7EB',
          }}
        >
          {l}
        </div>
      ))}
    </div>
  )
}
