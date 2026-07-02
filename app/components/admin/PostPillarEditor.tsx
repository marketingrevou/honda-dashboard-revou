'use client'

import { useState, useTransition } from 'react'
import { searchPosts, updatePostPillar, type PostSearchRow } from '@/app/actions/admin'
import { Button, Card, StatusText, inputStyle, type SaveState } from './ui'

function PostRow({ post, pillars }: { post: PostSearchRow; pillars: readonly string[] }) {
  const [pillar, setPillar] = useState(post.pillar ?? pillars[0])
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const dirty = pillar !== (post.pillar ?? pillars[0])

  function save() {
    setState('saving')
    startTransition(async () => {
      const res = await updatePostPillar(post.post_id, pillar)
      if (res.ok) setState('saved')
      else {
        setState('error')
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex gap-3" style={{ padding: '12px 0', borderBottom: '1px solid #F0F0F0' }}>
      {post.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnail_url}
          alt=""
          style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', flex: '0 0 auto', background: '#F0F0F0' }}
        />
      ) : (
        <div style={{ width: '56px', height: '56px', borderRadius: '6px', background: '#F0F0F0', flex: '0 0 auto' }} />
      )}
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: '#111827', fontWeight: 600 }}>@{post.account_username}</div>
        <div
          style={{
            fontSize: '12px',
            color: '#555555',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {post.caption || <em>(no caption)</em>}
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: '6px', flexWrap: 'wrap' }}>
          <select
            value={pillar}
            onChange={(e) => {
              setPillar(e.target.value)
              if (state !== 'idle') setState('idle')
            }}
            style={{ ...inputStyle, width: 'auto', padding: '6px 8px' }}
          >
            {pillars.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Button onClick={save} disabled={pending || !dirty} variant="secondary">
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <StatusText state={state} error={error} />
        </div>
      </div>
    </div>
  )
}

export default function PostPillarEditor({ pillars }: { pillars: readonly string[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PostSearchRow[]>([])
  const [searched, setSearched] = useState(false)
  const [pending, startTransition] = useTransition()

  function runSearch(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const rows = await searchPosts(query)
        setResults(rows)
        setSearched(true)
      } catch {
        setResults([])
        setSearched(true)
      }
    })
  }

  return (
    <Card title="Post Classification" description="Search by account or caption, then override a post's pillar.">
      <form onSubmit={runSearch} className="flex gap-2" style={{ marginBottom: '12px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts…"
          style={{ ...inputStyle }}
        />
        <Button type="submit" disabled={pending || !query.trim()}>
          {pending ? 'Searching…' : 'Search'}
        </Button>
      </form>
      <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
        {results.map((p) => (
          <PostRow key={p.post_id} post={p} pillars={pillars} />
        ))}
        {searched && results.length === 0 && !pending && (
          <p style={{ fontSize: '13px', color: '#555555', padding: '8px 0' }}>No posts found.</p>
        )}
      </div>
    </Card>
  )
}
