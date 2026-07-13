'use client'

import { useRef, useState } from 'react'
import { Button, Card } from './ui'
import { scrapeChunk, refreshChunk, classifyChunk, sendRunNotification } from '@/app/actions/admin'

type LogLine = { text: string; kind: 'info' | 'phase' | 'ok' | 'error' }

/** POST a JSON route and parse the body; throws on non-2xx (except handled). */
async function post(url: string, jsonBody?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    ...(jsonBody !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonBody),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = (body.error as string) ?? `${res.status} ${res.statusText}`
    throw new Error(msg)
  }
  return body
}

function useRunner() {
  const [running, setRunning] = useState(false)
  const [lines, setLines] = useState<LogLine[]>([])
  // Guard against overlapping runs even across quick re-renders.
  const activeRef = useRef(false)
  // Plain-text transcript of the current run, readable synchronously when we
  // send the notification email (state updates are async, so we can't read
  // `lines` back at the end of runUpdate/runReclassify).
  const transcriptRef = useRef<string[]>([])

  function resetLog() {
    transcriptRef.current = []
    setLines([])
  }

  function log(text: string, kind: LogLine['kind'] = 'info') {
    transcriptRef.current.push(text)
    setLines((prev) => [...prev, { text, kind }])
  }

  return { running, setRunning, lines, resetLog, log, activeRef, transcriptRef }
}

export default function UpdateRunner() {
  const { running, setRunning, lines, resetLog, log, activeRef, transcriptRef } = useRunner()

  /**
   * Email the run outcome to the ops address. Best-effort: a failed send is
   * logged inline but never rethrown, so it can't turn a good run bad.
   */
  async function notify(job: string, status: 'success' | 'failure', summary: string) {
    try {
      const r = await sendRunNotification({
        job,
        status,
        summary,
        logLines: transcriptRef.current,
      })
      if (!r.ok) log(`  (notification email not sent: ${r.error})`, 'error')
    } catch (err) {
      log(`  (notification email not sent: ${err instanceof Error ? err.message : String(err)})`, 'error')
    }
  }

  async function runUpdate() {
    if (activeRef.current) return
    if (!window.confirm('Run full Update on Supabase? This scrapes Instagram, refreshes metrics, then classifies new posts via the Supabase Edge Functions — it uses Apify and OpenAI credits and can take ~15 minutes. Keep this tab open.')) {
      return
    }
    activeRef.current = true
    setRunning(true)
    resetLog()

    try {
      // ── Phase 1: scrape latest posts, all account chunks (Supabase `scrape`) ─
      // Scrape-only — each chunk upserts its posts but does NOT classify. The
      // client loops chunks so no single call runs longer than one chunk (~96s).
      log('Phase 1 — Scraping latest posts (Supabase)…', 'phase')
      for (let chunk = 0; ; chunk++) {
        const r = await scrapeChunk(chunk)
        if (!r.ok) throw new Error(r.error)
        log(
          `  Chunk ${r.chunk + 1}/${r.totalChunks}: ${r.accountsProcessed} accounts, ${r.postsAdded} posts scraped`,
          'ok',
        )
        if (r.errors?.length) {
          log(`    ${r.errors.length} account note(s) — first: ${r.errors[0]}`, 'error')
        }
        if (r.done) break
      }

      // ── Phase 2: refresh metrics (last 14 days, Supabase `refresh-metrics`) ─
      log('Phase 2 — Refreshing metrics (last 14 days, Supabase)…', 'phase')
      let offset = 0
      for (;;) {
        const r = await refreshChunk(offset)
        if (!r.ok) throw new Error(r.error)
        if (r.total === 0) {
          log('  Nothing to refresh (0 posts in window)', 'ok')
          break
        }
        log(
          `  Metrics ${Math.min(offset + r.processed, r.total)}/${r.total} (updated ${r.updated})`,
          'ok',
        )
        if (r.errors?.length) {
          log(`    ${r.errors.length} post note(s) — first: ${r.errors[0]}`, 'error')
        }
        if (r.done) break
        offset = r.nextOffset
      }

      // ── Phase 3: classify the newly-scraped posts (Supabase `classify`) ──────
      // Classifies posts left unclassified by Phase 1, in bounded batches. The
      // client loops until `done` so each Edge Function call stays under the
      // worker limit (the image + vision work is the expensive part).
      log('Phase 3 — Classifying new posts (Supabase)…', 'phase')
      let totalClassified = 0
      for (;;) {
        const r = await classifyChunk()
        if (!r.ok) throw new Error(r.error)
        if (r.processed === 0) {
          log('  Nothing to classify (0 new posts)', 'ok')
          break
        }
        totalClassified += r.classified
        log(
          `  Classified ${r.classified}/${r.processed} (${r.remaining} remaining)`,
          'ok',
        )
        if (r.errors?.length) {
          log(`    ${r.errors.length} post note(s) — first: ${r.errors[0]}`, 'error')
        }
        if (r.done) break
      }

      log(`Update complete ✓ (${totalClassified} posts classified)`, 'phase')
      await notify('Update', 'success', `The full Update pipeline (scrape → refresh metrics → classify) finished successfully. ${totalClassified} posts classified.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Failed: ${msg}`, 'error')
      await notify('Update', 'failure', `The Update pipeline failed: ${msg}`)
    } finally {
      activeRef.current = false
      setRunning(false)
    }
  }

  async function runReclassify() {
    if (activeRef.current) return
    if (!window.confirm('Re-run vision classification on all posts marked Negative? Uses OpenAI credits.')) return
    activeRef.current = true
    setRunning(true)
    resetLog()
    try {
      log('Reclassifying Negative posts…', 'phase')
      let totalReclassified = 0
      for (;;) {
        const r = await post('/api/admin/reclassify')
        const reclassified = r.reclassified as number
        const remaining = r.remaining as number
        totalReclassified += reclassified
        log(`  Checked ${r.processed}, moved off Negative: ${reclassified}, ${remaining} remaining`, 'ok')
        if (Array.isArray(r.errors) && r.errors.length) {
          log(`    ${r.errors.length} error(s) — first: ${(r.errors as string[])[0]}`, 'error')
        }
        if (r.done) break
      }
      log(`Reclassify complete ✓ (${totalReclassified} moved off Negative)`, 'phase')
      await notify('Reclassify Negatives', 'success', `Reclassify finished successfully (${totalReclassified} posts moved off Negative).`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Failed: ${msg}`, 'error')
      await notify('Reclassify Negatives', 'failure', `Reclassify failed: ${msg}`)
    } finally {
      activeRef.current = false
      setRunning(false)
    }
  }

  return (
    <Card
      title="Data Pipelines"
      description="Update runs on Supabase: scrapes Instagram → refreshes metrics → classifies new posts. Also runs automatically every Monday. Reclassify re-checks posts marked Negative."
    >
      <div className="flex items-center gap-3" style={{ marginBottom: lines.length ? '16px' : 0, flexWrap: 'wrap' }}>
        <Button onClick={runUpdate} disabled={running}>
          {running ? 'Running…' : 'Run Update'}
        </Button>
        <Button onClick={runReclassify} disabled={running} variant="secondary">
          Reclassify Negatives
        </Button>
      </div>

      {lines.length > 0 && (
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
          }}
        >
          {lines.map((l, i) => (
            <div
              key={i}
              style={{
                color:
                  l.kind === 'error' ? '#FCA5A5' : l.kind === 'phase' ? '#FBBF24' : l.kind === 'ok' ? '#86EFAC' : '#E5E7EB',
                fontWeight: l.kind === 'phase' ? 700 : 400,
                whiteSpace: 'pre-wrap',
              }}
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
