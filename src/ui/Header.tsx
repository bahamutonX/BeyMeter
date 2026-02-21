import type { LauncherType } from '../features/meter/shootType'
import { useTranslation } from 'react-i18next'

interface HeaderProps {
  bleConnected: boolean
  connecting: boolean
  disconnecting: boolean
  beyAttached: boolean
  lastError: string | null
  launcherType: LauncherType
  launcherOptions: Array<{ value: LauncherType; label: string }>
  connectNotice?: string | null
  onLauncherTypeChange: (value: LauncherType) => void
  onConnect: () => void
  onDisconnect: () => void
}

function StatusDot({
  active,
  label,
  variant,
}: {
  active: boolean
  label: string
  variant?: 'default' | 'error' | 'connecting'
}) {
  return (
    <div className="status-item">
      <span className={`status-dot ${active ? 'on' : 'off'} ${variant ?? 'default'}`} />
      <span>{label}</span>
    </div>
  )
}

export function Header({
  bleConnected,
  connecting,
  disconnecting,
  beyAttached,
  lastError,
  launcherType,
  launcherOptions,
  connectNotice,
  onLauncherTypeChange,
  onConnect,
  onDisconnect,
}: HeaderProps) {
  const { t } = useTranslation()
  const connectionLabel = connecting
    ? t('ble.connecting')
    : disconnecting
      ? t('ble.disconnecting')
    : bleConnected
      ? t('ble.connected')
      : t('ble.disconnected')
  const attachLabel = bleConnected ? (beyAttached ? t('ble.attachOn') : t('ble.attachOff')) : t('ble.attachUnknown')
  const actionLabel = connecting
    ? t('common.connecting')
    : disconnecting
      ? t('common.disconnecting')
      : bleConnected
        ? t('common.disconnect')
        : t('common.connect')

  return (
    <header className="app-header">
      <div className="app-title-row">
        <h1 className="app-title">{t('app.title')}</h1>
        <a
          className="app-credit"
          href="https://x.com/bahamutonX"
          target="_blank"
          rel="noreferrer"
        >
          by @bahamutonX
        </a>
      </div>
      <div className="status-row">
        <button
          className="connect-pill"
          onClick={bleConnected ? onDisconnect : onConnect}
          type="button"
          disabled={connecting || disconnecting}
        >
          {actionLabel}
        </button>
        <StatusDot active={bleConnected || connecting} label={connectionLabel} variant={connecting || disconnecting ? 'connecting' : 'default'} />
        <StatusDot active={bleConnected && beyAttached} label={attachLabel} />
        {lastError ? <StatusDot active={true} label={t('ble.commError')} variant="error" /> : null}
        <div className="header-launcher-toggle" role="group" aria-label={t('launcher.label')}>
          <span className="launcher-toggle-label">{t('launcher.label')}</span>
          <div className="launcher-toggle-buttons">
            {launcherOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`launcher-toggle-btn ${launcherType === opt.value ? 'active' : ''}`}
                onClick={() => onLauncherTypeChange(opt.value)}
                aria-pressed={launcherType === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {connecting ? <div className="hint-line">{t('ble.holdToPair')}</div> : null}
      {connectNotice ? <div className="hint-line success">{connectNotice}</div> : null}
      {lastError ? (
        <div className="hint-line error">{lastError}</div>
      ) : null}
    </header>
  )
}
