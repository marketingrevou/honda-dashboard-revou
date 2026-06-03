import type { Idea } from '@/lib/types'

interface IdeaCardProps {
  idea: Idea
}

export default function IdeaCard({ idea }: IdeaCardProps) {
  return (
    <div className="idea-card bg-white p-3" style={{ border: '1px solid #E5E7EB', borderLeft: '3px solid #E62533' }}>
      <div className="font-poppins font-semibold mb-1" style={{ fontSize: '11.5px', color: '#111827' }}>
        {idea.title}
      </div>
      <p className="font-mulish leading-relaxed mb-2.5" style={{ fontSize: '10.5px', color: '#555555' }}>
        {idea.description}
      </p>
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="fmt-tag text-white" style={{ background: '#333333' }}>
          {idea.format}
        </span>
      </div>
    </div>
  )
}
