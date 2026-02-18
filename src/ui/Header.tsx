interface HeaderProps {
  bleConnected: boolean
  connecting: boolean
  disconnecting: boolean
  beyAttached: boolean
  lastError: string | null
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
  onConnect,
  onDisconnect,
}: HeaderProps) {
  const connectionLabel = connecting
    ? 'BBP 接続中...'
    : disconnecting
      ? 'BBP 切断中...'
    : bleConnected
      ? 'BBP 接続中'
      : 'BBP 未接続'
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
      <button
        className="connect-pill"
        onClick={bleConnected ? onDisconnect : onConnect}
        type="button"
        disabled={connecting || disconnecting}
      >
        {actionLabel}
      </button>
      <div className="status-row">
        <StatusDot active={bleConnected || connecting} label={connectionLabel} variant={connecting || disconnecting ? 'connecting' : 'default'} />
        <StatusDot active={bleConnected && beyAttached} label={attachLabel} />
        {lastError ? <StatusDot active={true} label="通信エラー" variant="error" /> : null}
      </div>
      {lastError ? (
        <div className="hint-line error">{lastError}</div>
      ) : null}
    </header>
  )
}
