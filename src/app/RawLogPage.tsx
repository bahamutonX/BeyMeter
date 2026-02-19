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

function decodePacket(packet: BbpPacket, contextMap: Map<number, BbpPacket>): string[] {
  const b = packet.bytes
  const h = packet.header

  if (h === HEADER_ATTACH) {
    const state = b[3] ?? 0
    const attached = state === 0x04 || state === 0x14
    const event = attached ? '装着イベント' : '未装着/射出イベント'
    const maxSp = readU16LE(b, 7)
    const totalShots = readU16LE(b, 9)
    const uid = Array.from(b.slice(11, 17))
      .map((v) => v.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ')
    return [
      'A0 着脱・状態通知',
      `state(Off2-3): ${toHexByte(state)} (${event})`,
      `Off4(変動値): ${b[4] ?? 0}`,
      `Off7-8 最大SP: ${maxSp} rpm`,
      `Off9-10 累積シュート数: ${totalShots}`,
      `Off11-16 UID: ${uid}`,
    ]
  }

  if (h >= HEADER_PROF_FIRST && h <= HEADER_PROF_LAST) {
    const base = (h - HEADER_PROF_FIRST) * 8 + 1
    const lines: string[] = [`${toHexByte(h)} プロファイル (8点)`]
    for (let i = 1, slot = 0; i < b.length; i += 2, slot += 1) {
      const nRefs = readU16LE(b, i)
      if (nRefs === 0) continue
      const dtMs = nRefs / 125
      const sp = Math.floor(7_500_000 / nRefs)
      const ch = base + slot
      lines.push(`ch${ch}: nRefs=${nRefs}, dt=${dtMs.toFixed(3)}ms, SP=${sp}rpm`)
    }
    if (lines.length === 1) {
      lines.push('有効データなし（0埋め）')
    }
    return lines
  }

  if (h >= HEADER_LIST_FIRST && h <= HEADER_LIST_LAST) {
    const base = (h - HEADER_LIST_FIRST) * 8 + 1
    const lines: string[] = [`${toHexByte(h)} シュートパワー履歴`] 
    const maxSlots = h === HEADER_LIST_LAST ? 2 : 8
    for (let slot = 0; slot < maxSlots; slot += 1) {
      const off = 1 + slot * 2
      const sp = readU16LE(b, off)
      lines.push(`#${base + slot}: ${sp} rpm (off${off}-${off + 1})`)
    }
    if (h === HEADER_LIST_LAST) {
      lines.push(`Off7-8 最大SP: ${readU16LE(b, 7)} rpm`)
      lines.push(`Off9-10 シュート数: ${readU16LE(b, 9)}`)
      lines.push(`Off11 リスト上のシュート数: ${b[11] ?? 0}`)
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
      `${toHexByte(h)} チェックサム`,
      `Off16 checksum: ${checksum}`,
      complete
        ? `B0..B6合計&0xFF: ${sum8} (${sum8 === checksum ? '一致' : '不一致'})`
        : 'B0..B6 が揃っていないため再計算不可',
      '仕様: checksum は B0..B6 の Off1..16 合計の下位8bit',
    ]
  }

  return [`${toHexByte(h)} 未定義ヘッダ`]
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

  const decodedRows = useMemo(() => {
    return state.packets.map((p, idx) => ({
      packet: p,
      decoded: decodePacket(p, buildContextMap(state.packets, idx)),
    }))
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

      <NeonPanel className="rawlog-list-wrap">
        <h2>{t('rawlog.receivedAll')}</h2>
        <div className="rawlog-list">
          {decodedRows.map(({ packet: p, decoded }, idx) => (
            <div className="rawlog-row" key={`${p.timestamp}-${idx}`}>
              <div className="rawlog-meta">
                <span>{formatTimestamp(p.timestamp)}</span>
                <span>{`0x${p.header.toString(16).toUpperCase().padStart(2, '0')}`}</span>
                <span>{`len=${p.length}`}</span>
              </div>
              <code>{p.hex}</code>
              <div className="rawlog-decoded">
                {decoded.map((line, i) => (
                  <div key={`${p.timestamp}-${idx}-${i}`}>{line}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </NeonPanel>
    </main>
  )
}
