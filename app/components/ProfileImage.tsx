'use client'

import { useState } from 'react'

function proxied(src: string): string {
  if (!src || src.startsWith('/') || src.startsWith('data:')) return src
  return `/api/image-proxy?url=${encodeURIComponent(src)}`
}

interface ProfileImageProps {
  src: string
  username: string
}

export default function ProfileImage({ src, username }: ProfileImageProps) {
  const [hasError, setHasError] = useState(false)

  if (hasError || !src) {
    return (
      <div
        className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-white font-bold"
        style={{ borderRadius: '2px', background: '#E62533', fontSize: '10px' }}
      >
        H
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxied(src)}
      alt={username}
      width={28}
      height={28}
      className="w-7 h-7 flex-shrink-0 object-cover"
      style={{ borderRadius: '2px' }}
      onError={() => setHasError(true)}
    />
  )
}
