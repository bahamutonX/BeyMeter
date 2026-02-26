import { useTranslation } from 'react-i18next'

interface HeaderProps {
  bleConnected: boolean
  connecting: boolean
  disconnecting: boolean
  beyAttached: boolean
  modeNotice?: string | null
  isPro: boolean
  displayMode: 'free' | 'pro'
  onStatusAction: () => void
  onTogglePro: () => void
}

function StatusDot({
  active,
  label,
  shortLabel,
  variant,
}: {
  active: boolean
  label: string
  shortLabel?: string
  variant?: 'default' | 'error' | 'connecting'
}) {
  return (
    <div className="status-item">
      <span className={`status-dot ${active ? 'on' : 'off'} ${variant ?? 'default'}`} />
      <span className="status-label-full">{label}</span>
      <span className="status-label-short">{shortLabel ?? label}</span>
    </div>
  )
}

export function Header({
  bleConnected,
  connecting,
  disconnecting,
  beyAttached,
  modeNotice,
  isPro,
  displayMode,
  onStatusAction,
  onTogglePro,
}: HeaderProps) {
  const { t } = useTranslation()
  const _isProView = isPro && displayMode === 'pro'
  const connectionLabel = connecting
    ? t('ble.connecting')
    : disconnecting
      ? t('ble.disconnecting')
    : bleConnected
      ? t('ble.connected')
      : t('ble.disconnected')
  const connectionLabelShort = connecting
    ? t('ble.stateConnecting')
    : disconnecting
      ? t('ble.stateDisconnecting')
    : bleConnected
      ? t('ble.stateConnected')
      : t('ble.stateDisconnected')
  const attachLabel = bleConnected ? (beyAttached ? t('ble.attachOn') : t('ble.attachOff')) : t('ble.attachUnknown')
  const attachLabelShort = bleConnected
    ? (beyAttached ? t('ble.attachOnShort') : t('ble.attachOffShort'))
    : t('ble.attachUnknownShort')

  return (
    <header className="app-header">
      <div className="app-header-top">
        <div className="app-title-row">
          <h1 className="app-title">{_isProView ? t('app.titlePro') : t('app.titleSimple')}</h1>
          <button type="button" className="mini-btn subtle pro-switch-btn" onClick={onTogglePro}>
            {!isPro
              ? t('pro.switchToPro')
              : displayMode === 'pro'
                ? t('pro.switchToFreeView')
                : t('pro.switchToProView')}
          </button>
        </div>
        <div className="status-row top-status-row">
          <button
            type="button"
            className="status-touch-btn"
            onClick={onStatusAction}
            disabled={connecting || disconnecting}
          >
            <StatusDot
              active={bleConnected || connecting}
              label={connectionLabel}
              shortLabel={connectionLabelShort}
              variant={connecting || disconnecting ? 'connecting' : 'default'}
            />
          </button>
          <button
            type="button"
            className="status-touch-btn"
            onClick={onStatusAction}
            disabled={connecting || disconnecting}
          >
            <StatusDot active={bleConnected && beyAttached} label={attachLabel} shortLabel={attachLabelShort} />
          </button>
          {bleConnected ? <div className="status-ready">{t('ble.readyToShoot')}</div> : null}
        </div>
      </div>
      {modeNotice ? <span className="mode-switch-notice app-header-mode-notice">{modeNotice}</span> : null}
    </header>
  )
}
