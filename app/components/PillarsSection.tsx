import type { Pillar } from '@/lib/types'
import PillarCard from './PillarCard'

interface PillarsSectionProps {
  pillars: Pillar[]
}

export default function PillarsSection({ pillars }: PillarsSectionProps) {
  return (
    <section className="mt-14">
      <div className="mb-5">
        <h2 className="section-heading">Ideas of the Week</h2>
        <p className="font-mulish mt-1" style={{ fontSize: '11.5px', color: '#555555' }}>
          Selaraskan konten dealermu dengan 4 Communication Pillar &nbsp;&middot;&nbsp; Honda Dealer Digital Alignment Framework
        </p>
        <hr className="section-rule mt-3" />
      </div>

      <div className="ideas-grid grid gap-5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {pillars.map((pillar) => (
          <PillarCard key={pillar.number} pillar={pillar} />
        ))}
      </div>
    </section>
  )
}
