import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { getBleService } from '../features/ble/bleSingleton'
import { clearRawPackets, getRawPackets, pushRawPacket, subscribeRawPackets } from '../features/ble/rawPacketStore'
import { navigateTo } from './navigation'

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
  }>
  isCompleteShot: boolean
}

interface BundleSummaryRow {
  label: string
  value: string
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

type TLike = (key: string, options?: Record<string, unknown>) => string

function findPacket(packets: BbpPacket[], header: number): BbpPacket | null {
  return packets.find((p) => p.header === header) ?? null
}

function getA0StateText(state: number, t: TLike): string {
  switch (state) {
    case 0x00:
      return t('rawlog.summary.a0State00')
    case 0x04:
      return t('rawlog.summary.a0State04')
    case 0x10:
      return t('rawlog.summary.a0State10')
    case 0x14:
      return t('rawlog.summary.a0State14')
    default:
      return t('rawlog.summary.a0StateUnknown')
  }
}

function collectProfileMetrics(packets: BbpPacket[]) {
  const refs: number[] = []
  for (let h = HEADER_PROF_FIRST; h <= HEADER_PROF_LAST; h += 1) {
    const p = findPacket(packets, h)
    if (!p) continue
    for (let off = 1; off < p.bytes.length; off += 2) {
      const nRefs = readU16LE(p.bytes, off)
      if (nRefs > 0) refs.push(nRefs)
    }
  }
  if (refs.length === 0) {
    return {
      points: 0,
      tPeakMs: null as number | null,
      peakSp: null as number | null,
      totalMs: null as number | null,
    }
  }

  let elapsed = 0
  let peakSp = 0
  let tPeakMsRaw = 0
  let tStartRaw: number | null = null
  let tEndRaw = 0
  for (const nRefs of refs) {
    const dtMs = nRefs / 125
    elapsed += dtMs
    const sp = Math.floor(7_500_000 / nRefs)
    if (tStartRaw === null && nRefs > 0 && sp > 0) {
      tStartRaw = elapsed
    }
    if (sp > peakSp) {
      peakSp = sp
      tPeakMsRaw = elapsed
    }
    tEndRaw = elapsed
  }
  const t0 = tStartRaw ?? 0
  const tPeakMs = Math.max(0, tPeakMsRaw - t0)
  const totalMs = Math.max(0, tEndRaw - t0)
  return {
    points: refs.length,
    tPeakMs,
    peakSp,
    totalMs,
  }
}

function buildSummaryRows(bundle: RawShotBundleView, t: TLike): BundleSummaryRow[] {
  const packets = bundle.packets.map((x) => x.packet)
  const uniqueHeaders = Array.from(new Set(packets.map((p) => p.header)))
    .sort((a, b) => a - b)
    .map((h) => toHexByte(h))
    .join(' ')

  const a0Packets = packets.filter((p) => p.header === HEADER_ATTACH)
  const a0Last = a0Packets[a0Packets.length - 1] ?? null
  const launchA0 = a0Packets.find((p) => (p.bytes[3] ?? 0) === 0x00) ?? null
  const attachedA0 = a0Packets.find((p) => (p.bytes[3] ?? 0) === 0x04) ?? null

  const bPackets: Array<BbpPacket | null> = []
  for (let h = HEADER_LIST_FIRST; h <= HEADER_LIST_LAST; h += 1) {
    bPackets.push(findPacket(packets, h))
  }
  const b6 = findPacket(packets, HEADER_LIST_LAST)
  const b7 = findPacket(packets, HEADER_CHECKSUM)
  const hasB0ToB6 = bPackets.every((p) => p !== null)
  const flatHistory: number[] = []
  for (let i = 0; i < bPackets.length; i += 1) {
    const p = bPackets[i]
    if (!p) continue
    const slotCount = i === 6 ? 2 : 8
    for (let slot = 0; slot < slotCount; slot += 1) {
      const off = 1 + slot * 2
      flatHistory.push(readU16LE(p.bytes, off))
    }
  }

  const profile = collectProfileMetrics(packets)

  let checksumText = t('common.none')
  let checksumCalculated = t('common.none')
  if (b7) {
    const checksum = b7.bytes[16] ?? 0
    let sum = 0
    let complete = true
    for (let h = HEADER_LIST_FIRST; h <= HEADER_LIST_LAST; h += 1) {
      const p = findPacket(packets, h)
      if (!p) {
        complete = false
        continue
      }
      for (let i = 1; i < p.bytes.length; i += 1) sum += p.bytes[i]
    }
    const sum8 = sum & 0xff
    checksumCalculated = complete ? `${sum8}` : t('common.none')
    checksumText = complete
      ? `${checksum} (${sum8 === checksum ? t('rawlog.decode.match') : t('rawlog.decode.mismatch')})`
      : `${checksum} (${t('rawlog.decode.checksumMissing')})`
  }

  const latestListIndex = b6 ? (b6.bytes[11] ?? 0) : 0
  const latestRingIndex = latestListIndex > 0 ? ((latestListIndex - 1) % 50) : -1
  const latestListSp =
    latestRingIndex >= 0 && latestRingIndex < flatHistory.length
      ? flatHistory[latestRingIndex]
      : null
  const latestHeader =
    latestRingIndex >= 0
      ? HEADER_LIST_FIRST + Math.floor(latestRingIndex / 8)
      : null
  const latestOffset =
    latestRingIndex >= 0
      ? 1 + (latestRingIndex % 8) * 2
      : null

  const a0Uid = a0Last
    ? Array.from(a0Last.bytes.slice(11, 17))
      .map((v) => v.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ')
    : null

  const rows: BundleSummaryRow[] = [
    { label: t('rawlog.summary.headers'), value: uniqueHeaders || t('common.none') },
    {
      label: t('rawlog.summary.a0Offset1'),
      value: a0Last ? `${a0Last.bytes[1] ?? 0} (${toHexByte(a0Last.bytes[1] ?? 0)})` : t('common.none'),
    },
    {
      label: t('rawlog.summary.attachState'),
      value:
        a0Last === null
          ? t('common.none')
          : `${toHexByte(a0Last.bytes[3] ?? 0)} (${getA0StateText(a0Last.bytes[3] ?? 0, t)})`,
    },
    {
      label: t('rawlog.summary.a0Offset4'),
      value: a0Last ? `${a0Last.bytes[4] ?? 0}` : t('common.none'),
    },
    {
      label: t('rawlog.summary.a0MaxSp'),
      value: a0Last ? `${readU16LE(a0Last.bytes, 7)} rpm` : t('common.none'),
    },
    {
      label: t('rawlog.summary.a0TotalShots'),
      value: a0Last ? `${readU16LE(a0Last.bytes, 9)}` : t('common.none'),
    },
    {
      label: t('rawlog.summary.a0Uid'),
      value: a0Uid ?? t('common.none'),
    },
    {
      label: t('rawlog.summary.attachEventAt'),
      value: attachedA0 ? formatTimestamp(attachedA0.timestamp) : t('common.none'),
    },
    {
      label: t('rawlog.summary.launchEventAt'),
      value: launchA0 ? formatTimestamp(launchA0.timestamp) : t('common.none'),
    },
    {
      label: t('rawlog.summary.profilePoints'),
      value: profile.points > 0 ? `${profile.points}` : t('common.none'),
    },
    {
      label: t('rawlog.summary.profilePacketCount'),
      value: `${packets.filter((p) => p.header >= HEADER_PROF_FIRST && p.header <= HEADER_PROF_LAST).length}/4`,
    },
    {
      label: t('rawlog.summary.profilePeak'),
      value:
        profile.peakSp !== null && profile.tPeakMs !== null
          ? `${profile.peakSp} rpm @ ${profile.tPeakMs.toFixed(2)} ms`
          : t('common.none'),
    },
    {
      label: t('rawlog.summary.profileDuration'),
      value: profile.totalMs !== null ? `${profile.totalMs.toFixed(2)} ms` : t('common.none'),
    },
    {
      label: t('rawlog.summary.b6MaxSp'),
      value: b6 ? `${readU16LE(b6.bytes, 7)} rpm` : t('common.none'),
    },
    {
      label: t('rawlog.summary.b6ShotCount'),
      value: b6 ? `${readU16LE(b6.bytes, 9)}` : t('common.none'),
    },
    {
      label: t('rawlog.summary.b6ListCount'),
      value: b6 ? `${b6.bytes[11] ?? 0}` : t('common.none'),
    },
    {
      label: t('rawlog.summary.bHistoryPackets'),
      value: `${packets.filter((p) => p.header >= HEADER_LIST_FIRST && p.header <= HEADER_LIST_LAST).length}/7`,
    },
    {
      label: t('rawlog.summary.bHistoryCount'),
      value: `${flatHistory.length}/50`,
    },
    {
      label: t('rawlog.summary.latestSpFromRing'),
      value:
        latestListSp !== null
          ? `${latestListSp} rpm (n=${latestListIndex})`
          : t('common.none'),
    },
    {
      label: t('rawlog.summary.latestSpPosition'),
      value:
        latestHeader !== null && latestOffset !== null
          ? `${toHexByte(latestHeader)} Off${latestOffset}-${latestOffset + 1}`
          : t('common.none'),
    },
    { label: t('rawlog.summary.checksum'), value: checksumText },
    { label: t('rawlog.summary.checksumCalc'), value: checksumCalculated },
    {
      label: t('rawlog.summary.b0ToB6Complete'),
      value: hasB0ToB6 ? t('rawlog.decode.match') : t('rawlog.decode.mismatch'),
    },
  ]

  return rows
}

export function RawLogPage() {
  const { t } = useTranslation()
  const bleRef = useRef(getBleService())
  const [state, setState] = useState<RawLogState>({
    connected: false,
    connecting: false,
    disconnecting: false,
    attached: false,
    error: null,
    packets: getRawPackets(),
  })

  useEffect(() => {
    const ble = bleRef.current
    const unsubscribe = subscribeRawPackets(() => {
      setState((prev) => ({ ...prev, packets: getRawPackets() }))
    })
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
        pushRawPacket(packet)
      },
      onError: (err: ProtocolError) => {
        const msg = err.detail ? `${err.message}: ${err.detail}` : err.message
        setState((prev) => ({ ...prev, error: msg }))
      },
    })
    return () => {
      unsubscribe()
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
    clearRawPackets()
  }

  const shotBundles = useMemo(() => {
    if (state.packets.length === 0) return []
    const chronological = [...state.packets].reverse()
    const bundles: RawShotBundleView[] = []
    let current: RawShotBundleView | null = null
    let nextId = 1

    for (let i = 0; i < chronological.length; i += 1) {
      const p = chronological[i]

      if (!current) {
        current = {
          id: nextId,
          tStart: p.timestamp,
          tEnd: p.timestamp,
          packets: [],
          isCompleteShot: false,
        }
      }

      current.packets.push({ packet: p })
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
          <button type="button" className="mini-btn subtle" onClick={() => navigateTo('./')}>
            {t('rawlog.back')}
          </button>
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
              <div className="rawlog-bundle-body">
                <div className="rawlog-packets-compact">
                  {bundle.packets.map(({ packet: p }, idx) => (
                    <div className="rawlog-row compact" key={`${bundle.id}-${p.timestamp}-${idx}`}>
                      <div className="rawlog-meta">
                        <span>{formatTimestamp(p.timestamp)}</span>
                        <span>{`0x${p.header.toString(16).toUpperCase().padStart(2, '0')}`}</span>
                        <span>{`len=${p.length}`}</span>
                      </div>
                      <code>{p.hex}</code>
                    </div>
                  ))}
                </div>
                <div className="rawlog-summary-table-wrap">
                  <div className="rawlog-summary-title">{t('rawlog.summary.title')}</div>
                  <table className="rawlog-summary-table">
                    <tbody>
                      {buildSummaryRows(bundle, t).map((row) => (
                        <tr key={`${bundle.id}-${row.label}`}>
                          <th>{row.label}</th>
                          <td>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}
        </div>
      </NeonPanel>
    </main>
  )
}
