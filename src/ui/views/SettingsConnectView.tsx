import type { ReactNode } from 'react'
import { SectionHeader } from '../SectionHeader'

interface SettingsConnectViewProps {
  en: string
  title: string
  launcherBlock: ReactNode
  connectBlock: ReactNode
  resetBlock: ReactNode
  errorNode?: ReactNode
}

export function SettingsConnectView({
  en,
  title,
  launcherBlock,
  connectBlock,
  resetBlock,
  errorNode,
}: SettingsConnectViewProps) {
  return (
    <section className="section-shell settings-shell">
      <div className="section-head-row">
        <SectionHeader en={en} title={title} description="" />
      </div>
      <div className="settings-main-panel">
        <div className="mobile-settings-content settings-content-fill settings-grid-three">
          <div className="settings-left-card">{launcherBlock}</div>
          <div className="settings-middle-card">{connectBlock}</div>
          <div className="settings-reset-card">{resetBlock}</div>
          {errorNode ?? null}
        </div>
      </div>
    </section>
  )
}

