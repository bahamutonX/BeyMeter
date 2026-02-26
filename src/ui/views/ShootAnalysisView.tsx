import type { ReactNode } from 'react'
import { NeonPanel } from '../NeonPanel'
import { SectionHeader } from '../SectionHeader'

interface ShootAnalysisViewProps {
  en: string
  title: string
  description: string
  leftContent: ReactNode
  rightContent: ReactNode
}

export function ShootAnalysisView({
  en,
  title,
  description,
  leftContent,
  rightContent,
}: ShootAnalysisViewProps) {
  return (
    <section className="section-shell recent-shell">
      <div className="section-head-row recent-head-row">
        <SectionHeader en={en} title={title} description={description} />
      </div>
      <div className="current-section">
        <NeonPanel className="current-left">{leftContent}</NeonPanel>
        <NeonPanel className="current-right">{rightContent}</NeonPanel>
      </div>
    </section>
  )
}

