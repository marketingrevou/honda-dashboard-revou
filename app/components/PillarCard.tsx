'use client'

import { useState } from 'react'
import type { Pillar } from '@/lib/types'
import IdeaCard from './IdeaCard'

interface PillarCardProps {
  pillar: Pillar
}

export default function PillarCard({ pillar }: PillarCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const postCountText =
    pillar.postCount === 0 && pillar.postCountNote
      ? `0 posts this week · ${pillar.postCountNote}`
      : `${pillar.postCount} posts this week`

  return (
    <div className="pillar overflow-hidden" style={{ border: '1px solid #E5E7EB', borderTop: '3px solid #E62533' }}>
      <div
        className="pillar-header px-4 py-4 bg-white flex items-start justify-between"
        style={{ borderBottom: '1px solid #F0F0F0' }}
        onClick={() => setIsCollapsed((prev) => !prev)}
      >
        <div>
          <div className="font-mulish font-semibold mb-1" style={{ fontSize: '9px', color: '#E62533', letterSpacing: '1.4px', textTransform: 'uppercase' }}>
            {pillar.label}
          </div>
          <div className="font-roboto font-bold" style={{ fontSize: '13px', color: '#111827', lineHeight: '1.25' }}>
            {pillar.title}
          </div>
          <div className="font-mulish mt-1" style={{ fontSize: '9.5px', color: '#9CA3AF' }}>
            {postCountText}
          </div>
        </div>
        <div className={`pillar-toggle${isCollapsed ? ' is-collapsed' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div className={`pillar-body p-4 flex flex-col gap-3${isCollapsed ? ' is-collapsed' : ''}`} style={{ background: '#FAFAFA' }}>
        {pillar.ideas.map((idea, i) => (
          <IdeaCard key={i} idea={idea} />
        ))}
      </div>
    </div>
  )
}
