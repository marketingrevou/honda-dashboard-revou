'use client'

import { useState } from 'react'

function proxied(src: string): string {
  if (!src || src.startsWith('/') || src.startsWith('data:')) return src
  return `/api/image-proxy?url=${encodeURIComponent(src)}`
}

interface PostImageProps {
  src: string
  rank: number
  alt: string
}

export default function PostImage({ src, rank, alt }: PostImageProps) {
  const [hasError, setHasError] = useState(false)

  return (
    <div className="relative">
      <span className="rank-badge absolute top-0 left-0 z-10">#{rank}</span>
      {hasError || !src ? (
        <div style={{ background: '#F0F0F0', aspectRatio: '1/1', width: '100%' }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxied(src)}
          alt={alt}
          className="w-full object-cover"
          style={{ aspectRatio: '1/1', display: 'block' }}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  )
}
