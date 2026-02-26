import type { ReactNode } from 'react'
import { NeonPanel } from '../NeonPanel'
import { SectionHeader } from '../SectionHeader'

interface RawLogViewProps {
  en: string
  title: string
  description: string
  content: ReactNode
  mobileClassName?: string
}

export function RawLogView({
  en,
  title,
  description,
  content,
  mobileClassName = '',
}: RawLogViewProps) {
  return (
    <section className={`section-shell history-shell ${mobileClassName}`.trim()}>
      <div className="section-head-row">
        <SectionHeader en={en} title={title} description={description} />
      </div>
      <div className="history-section rawlog-history-shell">
        <NeonPanel className="history-right rawlog-history-panel">{content}</NeonPanel>
      </div>
    </section>
  )
}

