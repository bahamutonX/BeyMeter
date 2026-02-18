import type { LauncherType } from '../features/meter/shootType'

interface HeaderProps {
  bleConnected: boolean
  connecting: boolean
  disconnecting: boolean
  beyAttached: boolean
  lastError: string | null
  launcherType: LauncherType
  launcherOptions: Array<{ value: LauncherType; label: string }>
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
  onLauncherTypeChange,
  onConnect,
  onDisconnect,
}: HeaderProps) {
  const connectionLabel = connecting
    ? 'ベイバトルパス 接続中...'
    : disconnecting
      ? 'ベイバトルパス 切断中...'
    : bleConnected
      ? 'ベイバトルパス 接続中'
      : 'ベイバトルパス 未接続'
  const attachLabel = bleConnected ? (beyAttached ? 'ベイ装着' : 'ベイ未装着') : 'ベイ状態: 不明'
  const actionLabel = connecting
    ? '接続中...'
    : disconnecting
      ? '切断中...'
      : bleConnected
        ? '切断する'
        : '接続する'

  return (
    <header className="app-header">
      <div className="app-title-row">
        <h1 className="app-title">BeyMeter</h1>
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
        {lastError ? <StatusDot active={true} label="通信エラー" variant="error" /> : null}
        <div className="header-launcher-toggle" role="group" aria-label="ランチャー選択">
          <span className="launcher-toggle-label">ランチャー</span>
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
      {connecting ? <div className="hint-line">ベイバトルパスを長押ししてください</div> : null}
      {lastError ? (
        <div className="hint-line error">{lastError}</div>
      ) : null}
    </header>
  )
}
