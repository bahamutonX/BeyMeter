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
  modeNotice?: string | null
  isPro: boolean
  displayMode: 'free' | 'pro'
  onLauncherTypeChange: (value: LauncherType) => void
  onConnect: () => void
  onDisconnect: () => void
  onTogglePro: () => void
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
  modeNotice,
  isPro,
  displayMode,
  onLauncherTypeChange,
  onConnect,
  onDisconnect,
  onTogglePro,
}: HeaderProps) {
  const { t } = useTranslation()
  const isProView = isPro && displayMode === 'pro'
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
      <div className="app-header-top">
        <div className="app-title-row">
          <h1 className="app-title">{isProView ? t('app.titlePro') : t('app.titleSimple')}</h1>
          <a
            className="app-credit"
            href="https://x.com/bahamutonX"
            target="_blank"
            rel="noreferrer"
          >
            by @bahamutonX
          </a>
          <button type="button" className="mini-btn subtle pro-switch-btn" onClick={onTogglePro}>
            {!isPro
              ? t('pro.switchToPro')
              : displayMode === 'pro'
                ? t('pro.switchToFreeView')
                : t('pro.switchToProView')}
          </button>
          {modeNotice ? <span className="mode-switch-notice">{modeNotice}</span> : null}
        </div>
        <div className="status-row top-status-row">
          <StatusDot active={bleConnected || connecting} label={connectionLabel} variant={connecting || disconnecting ? 'connecting' : 'default'} />
          <StatusDot active={bleConnected && beyAttached} label={attachLabel} />
          {lastError ? <StatusDot active={true} label={t('ble.commError')} variant="error" /> : null}
          {bleConnected ? <div className="status-ready">{t('ble.readyToShoot')}</div> : null}
        </div>
      </div>

      <div className="header-settings-panel">
        <div className="header-settings-head">
          <div className="section-en">{t('settings.connectionEn')}</div>
          <h2>{t('mobile.settingsTitle')}</h2>
        </div>
        <div className="header-controls-row">
          <div className="header-control-block header-launcher-block">
            <span className="header-control-title">{t('launcher.selectPrompt')}</span>
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
          <div className="header-control-block header-connect-block">
            <span className="header-control-title">{t('ble.connectGuideHeader')}</span>
            <button
              className="connect-pill"
              onClick={bleConnected ? onDisconnect : onConnect}
              type="button"
              disabled={connecting || disconnecting}
            >
              {actionLabel}
            </button>
            {connectNotice ? <span className="mode-switch-notice">{connectNotice}</span> : null}
          </div>
        </div>
      </div>
    </header>
  )
}
