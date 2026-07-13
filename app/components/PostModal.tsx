'use client'

import { useEffect, useState } from 'react'
import type { Post } from '@/lib/types'

/** Extract the Instagram shortcode from a post URL like .../p/<code>/ or .../reel/<code>/. */
export function shortcodeFromUrl(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/)
  return m ? m[1] : null
}

interface PostModalProps {
  post: Post
  onClose: () => void
}

/**
 * Modal that previews a post by embedding the live Instagram post via the
 * official embed iframe (instagram.com/p/<code>/embed). This always renders the
 * current image/video straight from Instagram, sidestepping the expiring CDN
 * thumbnail URLs entirely.
 */
export default function PostModal({ post, onClose }: PostModalProps) {
  const shortcode = shortcodeFromUrl(post.instagramUrl)
  // Instagram embeds vary in height (image vs caption length). Default to a tall
  // value so the full post + caption + actions are visible even before (or if)
  // the embed reports its real height via postMessage; the listener refines it.
  const [embedHeight, setEmbedHeight] = useState(880)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Instagram's embed posts a { type: 'MEASURE', details: { height } } message
  // (the same mechanism its embed.js uses) once it has laid out. Resize to it.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      let host = ''
      try { host = new URL(e.origin).hostname } catch { return }
      if (!/(^|\.)instagram\.com$/.test(host)) return
      let data = e.data
      if (typeof data === 'string') {
        try { data = JSON.parse(data) } catch { return }
      }
      const h = data?.details?.height
      if (data?.type === 'MEASURE' && typeof h === 'number' && h > 0) {
        setEmbedHeight(Math.ceil(h))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white overflow-hidden flex flex-col"
        style={{ width: '100%', maxWidth: 400, maxHeight: '90vh', borderRadius: 8 }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid #F0F0F0' }}
        >
          <div className="font-mulish font-semibold" style={{ fontSize: '11px', color: '#111827' }}>
            {post.accountHandle}
          </div>
          {post.isCollab && (
            <span
              className="font-mulish font-semibold"
              title={post.collabWith.length ? `Collab with ${post.collabWith.join(', ')}` : 'Collab post'}
              style={{ fontSize: '9px', color: '#6D28D9', background: '#EDE9FE', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}
            >
              Collab
            </span>
          )}
          <span style={{ fontSize: '10px', color: '#9CA3AF' }}>{post.date}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto"
            style={{ fontSize: '16px', color: '#9CA3AF', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto" style={{ background: '#FAFAFA', minHeight: 0 }}>
          {shortcode ? (
            <iframe
              src={`https://www.instagram.com/p/${shortcode}/embed/`}
              title={`Instagram post ${shortcode}`}
              className="w-full"
              style={{ border: 'none', height: embedHeight, display: 'block' }}
              loading="lazy"
              scrolling="no"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center">
              <p className="font-mulish" style={{ fontSize: '11px', color: '#9CA3AF' }}>
                Preview unavailable.
              </p>
              <a
                href={post.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mulish font-semibold"
                style={{ fontSize: '10px', color: '#E62533' }}
              >
                Open on Instagram ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
