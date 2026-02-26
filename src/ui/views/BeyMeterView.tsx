import type { ReactNode } from 'react'
import { NeonPanel } from '../NeonPanel'
import { SectionHeader } from '../SectionHeader'

interface BeyMeterViewProps {
  en: string
  title: string
  description: string
  toggleButton?: ReactNode
  meterContent: ReactNode
}

export function BeyMeterView({
  en,
  title,
  description,
  toggleButton,
  meterContent,
}: BeyMeterViewProps) {
  return (
    <section className="section-shell meter-shell">
      <div className="section-head-row meter-head-row">
        <SectionHeader en={en} title={title} description={description} />
        {toggleButton ? <div className="section-head-actions meter-mode-actions">{toggleButton}</div> : null}
      </div>
      <NeonPanel className="meter-main-panel">{meterContent}</NeonPanel>
    </section>
  )
}
