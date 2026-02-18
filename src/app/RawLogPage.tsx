import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BleService } from '../features/ble/BleService'
import type { BbpPacket, ProtocolError } from '../features/ble/bbpTypes'
import { NeonPanel } from '../ui/NeonPanel'

interface RawLogState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  attached: boolean
  error: string | null
  packets: BbpPacket[]
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const mss = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${mss}`
}

export function RawLogPage() {
  const { t } = useTranslation()
  const bleRef = useRef(new BleService())
  const [state, setState] = useState<RawLogState>({
    connected: false,
    connecting: false,
    disconnecting: false,
    attached: false,
    error: null,
    packets: [],
  })

  useEffect(() => {
    const ble = bleRef.current
    ble.setHandlers({
      onState: (s) => {
        setState((prev) => ({
          ...prev,
          connected: s.connected,
          disconnecting: false,
          attached: s.connected ? s.beyAttached : false,
        }))
      },
      onRaw: (packet) => {
        setState((prev) => ({
          ...prev,
          packets: [packet, ...prev.packets],
        }))
      },
      onError: (err: ProtocolError) => {
        const msg = err.detail ? `${err.message}: ${err.detail}` : err.message
        setState((prev) => ({ ...prev, error: msg }))
      },
    })
    ble.autoReconnectLoop(2500)

    return () => {
      ble.stopAutoReconnectLoop()
      ble.disconnect()
    }
  }, [])

  async function handleConnect() {
    setState((prev) => ({ ...prev, connecting: true, error: null }))
    try {
      await bleRef.current.connect()
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setState((prev) => ({ ...prev, connecting: false }))
    }
  }

  function handleDisconnect() {
    setState((prev) => ({ ...prev, disconnecting: true }))
    try {
      bleRef.current.disconnect()
    } finally {
      setState((prev) => ({
        ...prev,
        connected: false,
        disconnecting: false,
        attached: false,
      }))
    }
  }

  function clearLogs() {
    setState((prev) => ({ ...prev, packets: [] }))
  }

  const headerCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const p of state.packets) {
      counts.set(p.header, (counts.get(p.header) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => a[0] - b[0])
  }, [state.packets])

  return (
    <main className="layout app-mobile app-compact neon-theme rawlog-page">
      <NeonPanel className="rawlog-header">
        <h1>{t('rawlog.title')}</h1>
        <div className="rawlog-actions">
          <button
            className="mini-btn subtle"
            type="button"
            onClick={state.connected ? handleDisconnect : () => void handleConnect()}
            disabled={state.connecting || state.disconnecting}
          >
            {state.connecting
              ? t('common.connecting')
              : state.disconnecting
                ? t('common.disconnecting')
                : state.connected
                  ? t('common.disconnect')
                  : t('common.connect')}
          </button>
          <button className="mini-btn subtle" type="button" onClick={clearLogs}>{t('rawlog.clear')}</button>
          <a className="mini-btn subtle" href="/">{t('rawlog.back')}</a>
        </div>
        <section className="rawlog-status">
          <div>{t('rawlog.connected')}: {state.connected ? t('rawlog.on') : t('rawlog.off')}</div>
          <div>{t('rawlog.attached')}: {state.attached ? t('rawlog.on') : t('rawlog.off')}</div>
          <div>{t('rawlog.packetCount')}: {state.packets.length}</div>
        </section>

        {state.error ? <p className="rawlog-error">{state.error}</p> : null}
      </NeonPanel>

      <NeonPanel className="rawlog-summary">
        <h2>{t('rawlog.headerSummary')}</h2>
        <div className="rawlog-counts">
          {headerCounts.map(([h, c]) => (
            <span key={h}>{`0x${h.toString(16).toUpperCase().padStart(2, '0')}: ${c}`}</span>
          ))}
        </div>
      </NeonPanel>

      <NeonPanel className="rawlog-list-wrap">
        <h2>{t('rawlog.receivedAll')}</h2>
        <div className="rawlog-list">
          {state.packets.map((p, idx) => (
            <div className="rawlog-row" key={`${p.timestamp}-${idx}`}>
              <span>{formatTimestamp(p.timestamp)}</span>
              <span>{`0x${p.header.toString(16).toUpperCase().padStart(2, '0')}`}</span>
              <span>{`len=${p.length}`}</span>
              <code>{p.hex}</code>
            </div>
          ))}
        </div>
      </NeonPanel>
    </main>
  )
}
