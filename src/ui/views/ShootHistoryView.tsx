import type { ReactNode } from 'react'
import { NeonPanel } from '../NeonPanel'
import { SectionHeader } from '../SectionHeader'

interface ShootHistoryViewProps {
  en: string
  title: string
  description: string
  leftPanel: ReactNode
  rightPanel: ReactNode
}

export function ShootHistoryView({
  en,
  title,
  description,
  leftPanel,
  rightPanel,
}: ShootHistoryViewProps) {
  return (
    <section className="section-shell history-shell">
      <div className="section-head-row">
        <SectionHeader en={en} title={title} description={description} />
      </div>
      <div className="history-section">
        <NeonPanel className="history-left">{leftPanel}</NeonPanel>
        <NeonPanel className="history-right">{rightPanel}</NeonPanel>
      </div>
    </section>
  )
}

