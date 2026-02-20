import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BleService } from '../features/ble/BleService'
import type { BbpPacket, ProtocolError } from '../features/ble/bbpTypes'
import {
  HEADER_ATTACH,
  HEADER_CHECKSUM,
  HEADER_LIST_FIRST,
  HEADER_LIST_LAST,
  HEADER_PROF_FIRST,
  HEADER_PROF_LAST,
} from '../features/ble/bbpTypes'
import { NeonPanel } from '../ui/NeonPanel'

interface RawLogState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  attached: boolean
  error: string | null
  packets: BbpPacket[]
}

interface RawShotBundleView {
  id: number
  tStart: number
  tEnd: number
  packets: Array<{
    packet: BbpPacket
    decoded: string[]
  }>
  isCompleteShot: boolean
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const mss = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${mss}`
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 1 >= bytes.length) return 0
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function toHexByte(v: number): string {
  return `0x${v.toString(16).toUpperCase().padStart(2, '0')}`
}

function buildContextMap(packets: BbpPacket[], startIndex: number): Map<number, BbpPacket> {
  const map = new Map<number, BbpPacket>()
  for (let i = startIndex; i < packets.length; i += 1) {
    const p = packets[i]
    if (!map.has(p.header)) {
      map.set(p.header, p)
    }
  }
  return map
}

type TLike = (key: string, options?: Record<string, unknown>) => string

function decodePacket(packet: BbpPacket, contextMap: Map<number, BbpPacket>, t: TLike): string[] {
  const b = packet.bytes
  const h = packet.header

  if (h === HEADER_ATTACH) {
    const state = b[3] ?? 0
    const attached = state === 0x04 || state === 0x14
    const event = attached ? t('rawlog.decode.attachEvent') : t('rawlog.decode.detachEvent')
    const maxSp = readU16LE(b, 7)
    const totalShots = readU16LE(b, 9)
    const uid = Array.from(b.slice(11, 17))
      .map((v) => v.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ')
    return [
      t('rawlog.decode.a0Title'),
      t('rawlog.decode.a0State', { value: toHexByte(state), event }),
      t('rawlog.decode.a0Offset4', { value: b[4] ?? 0 }),
      t('rawlog.decode.a0MaxSp', { value: maxSp }),
      t('rawlog.decode.a0TotalShots', { value: totalShots }),
      t('rawlog.decode.a0Uid', { value: uid }),
    ]
  }

  if (h >= HEADER_PROF_FIRST && h <= HEADER_PROF_LAST) {
    const base = (h - HEADER_PROF_FIRST) * 8 + 1
    const lines: string[] = [t('rawlog.decode.profileTitle', { header: toHexByte(h) })]
    for (let i = 1, slot = 0; i < b.length; i += 2, slot += 1) {
      const nRefs = readU16LE(b, i)
      if (nRefs === 0) continue
      const dtMs = nRefs / 125
      const sp = Math.floor(7_500_000 / nRefs)
      const ch = base + slot
      lines.push(t('rawlog.decode.profileLine', { ch, nRefs, dtMs: dtMs.toFixed(3), sp }))
    }
    if (lines.length === 1) {
      lines.push(t('rawlog.decode.profileNoData'))
    }
    return lines
  }

  if (h >= HEADER_LIST_FIRST && h <= HEADER_LIST_LAST) {
    const base = (h - HEADER_LIST_FIRST) * 8 + 1
    const lines: string[] = [t('rawlog.decode.listTitle', { header: toHexByte(h) })]
    const maxSlots = h === HEADER_LIST_LAST ? 2 : 8
    for (let slot = 0; slot < maxSlots; slot += 1) {
      const off = 1 + slot * 2
      const sp = readU16LE(b, off)
      lines.push(t('rawlog.decode.listLine', { index: base + slot, sp, offStart: off, offEnd: off + 1 }))
    }
    if (h === HEADER_LIST_LAST) {
      lines.push(t('rawlog.decode.b6MaxSp', { value: readU16LE(b, 7) }))
      lines.push(t('rawlog.decode.b6ShotCount', { value: readU16LE(b, 9) }))
      lines.push(t('rawlog.decode.b6ListCount', { value: b[11] ?? 0 }))
    }
    return lines
  }

  if (h === HEADER_CHECKSUM) {
    const checksum = b[16] ?? 0
    let sum = 0
    let complete = true
    for (let hh = HEADER_LIST_FIRST; hh <= HEADER_LIST_LAST; hh += 1) {
      const src = contextMap.get(hh)
      if (!src) {
        complete = false
        continue
      }
      for (let i = 1; i < src.bytes.length; i += 1) {
        sum += src.bytes[i]
      }
    }
    const sum8 = sum & 0xff
    return [
      t('rawlog.decode.checksumTitle', { header: toHexByte(h) }),
      t('rawlog.decode.checksumByte', { value: checksum }),
      complete
        ? t('rawlog.decode.checksumCompare', {
          value: sum8,
          result: sum8 === checksum ? t('rawlog.decode.match') : t('rawlog.decode.mismatch'),
        })
        : t('rawlog.decode.checksumMissing'),
      t('rawlog.decode.checksumRule'),
    ]
  }

  return [t('rawlog.decode.unknownHeader', { header: toHexByte(h) })]
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

  const shotBundles = useMemo(() => {
    if (state.packets.length === 0) return []
    const chronological = [...state.packets].reverse()
    const bundles: RawShotBundleView[] = []
    let current: RawShotBundleView | null = null
    let nextId = 1

    for (let i = 0; i < chronological.length; i += 1) {
      const p = chronological[i]
      const decoded = decodePacket(p, buildContextMap(chronological, i), t)

      if (!current) {
        current = {
          id: nextId,
          tStart: p.timestamp,
          tEnd: p.timestamp,
          packets: [],
          isCompleteShot: false,
        }
      }

      current.packets.push({ packet: p, decoded })
      current.tEnd = p.timestamp

      if (p.header === HEADER_PROF_LAST) {
        current.isCompleteShot = true
        bundles.push(current)
        nextId += 1
        current = null
      }
    }

    if (current && current.packets.length > 0) {
      bundles.push(current)
    }

    return bundles.reverse()
  }, [state.packets, t])

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

      <NeonPanel className="rawlog-list-wrap">
        <h2>{t('rawlog.receivedAll')}</h2>
        <div className="rawlog-list">
          {shotBundles.map((bundle) => (
            <details className="rawlog-bundle" key={`bundle-${bundle.id}`} open={bundle.id === shotBundles[0]?.id}>
              <summary className="rawlog-bundle-summary">
                <span>{`${t('rawlog.bundle')} #${bundle.id}`}</span>
                <span>{`${formatTimestamp(bundle.tStart)} - ${formatTimestamp(bundle.tEnd)}`}</span>
                <span>{`${t('rawlog.packetCount')}: ${bundle.packets.length}`}</span>
                <span>{bundle.isCompleteShot ? t('rawlog.complete') : t('rawlog.partial')}</span>
              </summary>
              {bundle.packets.map(({ packet: p, decoded }, idx) => (
                <div className="rawlog-row" key={`${bundle.id}-${p.timestamp}-${idx}`}>
                  <div className="rawlog-meta">
                    <span>{formatTimestamp(p.timestamp)}</span>
                    <span>{`0x${p.header.toString(16).toUpperCase().padStart(2, '0')}`}</span>
                    <span>{`len=${p.length}`}</span>
                  </div>
                  <code>{p.hex}</code>
                  <div className="rawlog-decoded">
                    {decoded.map((line, i) => (
                      <div key={`${bundle.id}-${p.timestamp}-${idx}-${i}`}>{line}</div>
                    ))}
                  </div>
                </div>
              ))}
            </details>
          ))}
        </div>
      </NeonPanel>
    </main>
  )
}
