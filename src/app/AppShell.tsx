import { useEffect, useMemo, useRef, useState } from 'react'
import { BleService } from '../features/ble/BleService'
import type { ProtocolError, ShotProfile, ShotSnapshot } from '../features/ble/bbpTypes'
import { ShotStore, type MeterViewState } from '../features/meter/ShotStore'
import { isSuspectShot } from '../features/meter/stats'
import { Header } from '../ui/Header'
import { ProfileChart } from '../ui/ProfileChart'
import { BandChart } from '../ui/BandChart'
import { NeonPanel } from '../ui/NeonPanel'
import { SectionHeader } from '../ui/SectionHeader'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { MetricLabel } from '../ui/MetricLabel'
import { computeShotFeatures, type ShotFeatures } from '../features/meter/shotFeatures'
import { clearShots, listShots, saveShot, type PersistentShot } from '../features/meter/shotStorage'
import { BAND_DEFS, buildBandStats } from '../features/meter/statsBands'
import { detectDecaySegment } from '../analysis/decayDetect'
import { fitFriction } from '../analysis/frictionFit'
import { computeTorque } from '../analysis/torque'
import { findFirstPeakIndex } from '../analysis/firstPeak'
import { METRIC_LABELS } from '../ui/metricLabels'
import { aggregateSeries } from '../analysis/aggregateSeries'
import {
  classifyShootType,
  LAUNCHER_OPTIONS,
  launcherLabel,
  type LauncherType,
} from '../features/meter/shootType'

const RECENT_X_MAX_MS = 400
const RECENT_Y_MAX_SP = 12000
const RECENT_Y_MAX_TAU = 250
const LAUNCHER_TYPE_KEY = 'beymeter.launcherType'

type ChartTarget = 'sp' | 'tau'
type ChartMode = 'avg' | 'overlay'

interface BleUiState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  isBeyAttached: boolean
  lastError: string | null
}

function getInitialLauncherType(): LauncherType {
  const saved = window.localStorage.getItem(LAUNCHER_TYPE_KEY)
  if (saved === 'string' || saved === 'winder' || saved === 'longWinder') {
    return saved
  }
  return 'string'
}

function ensureProfile(profile: ShotProfile): ShotProfile {
  if (profile.profilePoints && profile.profilePoints.length === profile.tMs.length) {
    return profile
  }
  const profilePoints = profile.tMs.map((tMs, i) => {
    const prev = i > 0 ? profile.tMs[i - 1] : 0
    return {
      tMs,
      sp: profile.sp[i] ?? 0,
      nRefs: profile.nRefs[i] ?? 0,
      dtMs: i > 0 ? tMs - prev : tMs,
    }
  })
  return {
    ...profile,
    profilePoints,
  }
}

function getStartAlignedPeakTimeMs(profile: ShotProfile | null, peakIndex: number): number {
  if (!profile || profile.tMs.length === 0) return 0
  const idx0 = profile.profilePoints.findIndex((p) => p.nRefs > 0 && p.sp > 0)
  const t0 = idx0 >= 0 ? profile.profilePoints[idx0].tMs : profile.tMs[0]
  const peakT = profile.tMs[Math.max(0, Math.min(peakIndex, profile.tMs.length - 1))] ?? t0
  return Math.max(0, Math.round(peakT - t0))
}

function toSnapshot(shot: PersistentShot): ShotSnapshot {
  return {
    yourSp: shot.yourSp,
    estSp: shot.estSp,
    maxSp: shot.maxSp,
    count: 0,
    profile: ensureProfile(shot.profile),
    estReason: 'persisted',
    receivedAt: shot.createdAt,
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((x) => (x - m) ** 2)))
}

function formatMaybe(value: number, hasData: boolean, digits = 2): string {
  if (!hasData) return '—'
  return Number(value.toFixed(digits)).toString()
}

function toJapaneseErrorMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('bbp device not found') || m.includes('device not found')) {
    return 'BBPが見つかりません。ベイバトルパスを長押ししてから再度お試しください。'
  }
  if (m.includes('not implemented on ios') || m.includes('plugin is not implemented')) {
    return 'Bluetooth機能の初期化に失敗しました。アプリを再起動して再接続してください。'
  }
  if (m.includes('failed to connect') || m.includes('gatt')) {
    return '接続に失敗しました。BBPを長押ししてからもう一度お試しください。'
  }
  if (m.includes('notavailableerror') || m.includes('bluetooth is not available')) {
    return 'この端末ではBluetooth接続が利用できません。'
  }
  return message
}

function summarizeFeature(
  shots: PersistentShot[],
  key: keyof ShotFeatures,
): { mean: number; p50: number } {
  const values = shots
    .map((s) => s.features?.[key])
    .filter((x): x is number => Number.isFinite(x))
  return {
    mean: Number(mean(values).toFixed(3)),
    p50: Number(median(values).toFixed(3)),
  }
}

export function AppShell() {
  const bleRef = useRef(new BleService())
  const storeRef = useRef(new ShotStore())

  const [bleUi, setBleUi] = useState<BleUiState>({
    connected: false,
    connecting: false,
    disconnecting: false,
    isBeyAttached: false,
    lastError: null,
  })
  const [viewState, setViewState] = useState<MeterViewState>(storeRef.current.getState())
  const [persistedShots, setPersistedShots] = useState<PersistentShot[]>([])
  const [launcherType, setLauncherType] = useState<LauncherType>(() => getInitialLauncherType())
  const launcherTypeRef = useRef(launcherType)

  const [selectedBandId, setSelectedBandId] = useState(BAND_DEFS[0].id)
  const [currentChartTarget, setCurrentChartTarget] = useState<ChartTarget>('sp')
  const [bandChartTarget, setBandChartTarget] = useState<ChartTarget>('sp')
  const [bandChartMode, setBandChartMode] = useState<ChartMode>('avg')
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => window.matchMedia('(max-width: 980px)').matches,
  )
  const [activeMobilePage, setActiveMobilePage] = useState(0)
  const [recentNotice, setRecentNotice] = useState<string | null>(null)
  const [sessionShotCount, setSessionShotCount] = useState(0)
  const mobilePagerRef = useRef<HTMLDivElement | null>(null)

  const isBayAttached = bleUi.connected && bleUi.isBeyAttached

  useEffect(() => {
    launcherTypeRef.current = launcherType
    window.localStorage.setItem(LAUNCHER_TYPE_KEY, launcherType)
  }, [launcherType])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)')
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches)
      if (!event.matches) {
        setActiveMobilePage(0)
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!isMobileLayout) return
    const el = mobilePagerRef.current
    if (!el) return
    const onScroll = () => {
      const width = el.clientWidth || 1
      const page = Math.round(el.scrollLeft / width)
      setActiveMobilePage(Math.max(0, Math.min(2, page)))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobileLayout])

  useEffect(() => {
    if (!isMobileLayout) return
    const el = mobilePagerRef.current
    if (!el) return
    el.scrollTo({ left: 0, behavior: 'auto' })
    setActiveMobilePage(0)
  }, [isMobileLayout])

  const moveToMobilePage = (page: number) => {
    const el = mobilePagerRef.current
    if (!el) return
    const width = el.clientWidth || 1
    el.scrollTo({
      left: width * page,
      behavior: 'smooth',
    })
  }

  useEffect(() => {
    const ble = bleRef.current

    ble.setHandlers({
      onState: (state) => {
        setBleUi((prev) => ({
          ...prev,
          connected: state.connected,
          disconnecting: false,
          // Authoritative attached state from A0 payload decode in parser.
          isBeyAttached: state.connected ? state.beyAttached : false,
        }))
      },
      onShot: (snapshot: ShotSnapshot) => {
        setSessionShotCount((prev) => prev + 1)
        setRecentNotice(null)
        setBleUi((prev) => ({
          ...prev,
          lastError: null,
        }))
        const store = storeRef.current
        store.push(snapshot)
        setViewState(store.finalizeBundle(snapshot.receivedAt, snapshot))

        if (!snapshot.profile) {
          return
        }

        const profile = ensureProfile(snapshot.profile)

        void (async () => {
          const decaySegment = detectDecaySegment(profile)
          const frictionFit = fitFriction(profile, decaySegment)
          const { torqueSeries, torqueFeatures } = computeTorque(profile, frictionFit, decaySegment)

          const shot: PersistentShot = {
            id: `${snapshot.receivedAt}-${Math.random().toString(36).slice(2, 8)}`,
            launcherType: launcherTypeRef.current,
            createdAt: snapshot.receivedAt,
            yourSp: snapshot.yourSp,
            estSp: snapshot.estSp,
            maxSp: snapshot.maxSp,
            chosenSpType: 'est',
            profile,
            features: computeShotFeatures(profile),
            decaySegment,
            frictionFit,
            torqueSeries,
            torqueFeatures,
            label: snapshot.estSp >= 10000 ? 'HIGH' : snapshot.estSp >= 3000 ? 'MID' : 'LOW',
          }
          await saveShot(shot)
          const loaded = (await listShots()).map((s) => ({
            ...s,
            launcherType: s.launcherType ?? 'string',
            profile: ensureProfile(s.profile),
          }))
          setPersistedShots(loaded)
        })()
      },
      onError: (error: ProtocolError) => {
        const msg = error.detail ? `${error.message}: ${error.detail}` : error.message
        setBleUi((prev) => ({ ...prev, lastError: toJapaneseErrorMessage(msg) }))
        setViewState(storeRef.current.setError(error))
      },
      onRaw: (packet) => {
        void packet
      },
    })
    ble.autoReconnectLoop(2500)

    void (async () => {
      const loaded = (await listShots()).map((s) => ({
        ...s,
        launcherType: s.launcherType ?? 'string',
        profile: ensureProfile(s.profile),
      }))
      const recalculated = loaded.map((s) => {
        const decaySegment = detectDecaySegment(s.profile)
        const frictionFit = fitFriction(s.profile, decaySegment)
        const { torqueSeries, torqueFeatures } = computeTorque(s.profile, frictionFit, decaySegment)
        return {
          ...s,
          features: computeShotFeatures(s.profile),
          decaySegment,
          frictionFit,
          torqueSeries: torqueSeries ?? s.torqueSeries,
          torqueFeatures: torqueFeatures ?? s.torqueFeatures,
        }
      })
      setPersistedShots(recalculated)
      setViewState(storeRef.current.hydrateHistory(recalculated.map(toSnapshot)))
    })()

    return () => {
      ble.stopAutoReconnectLoop()
      ble.disconnect()
    }
  }, [])

  const latest = viewState.latest
  const latestProfile = latest?.profile ?? null
  const peakIndex = latestProfile ? findFirstPeakIndex(latestProfile.tMs, latestProfile.sp) : 0
  const latestPersisted = useMemo(
    () => (latest ? persistedShots.find((s) => s.createdAt === latest.receivedAt) ?? null : null),
    [latest, persistedShots],
  )
  const latestShootType = useMemo(
    () => classifyShootType(latestPersisted?.features),
    [latestPersisted?.features],
  )
  const latestLauncherText = useMemo(
    () => launcherLabel((latestPersisted?.launcherType ?? launcherType) as LauncherType),
    [latestPersisted?.launcherType, launcherType],
  )
  const latestTorqueSeries = latestPersisted?.torqueSeries ?? null
  const isYourSuspicious = useMemo(() => isSuspectShot(latest), [latest])
  const latestPeakTimeMs = useMemo(
    () => getStartAlignedPeakTimeMs(latestProfile, peakIndex),
    [latestProfile, peakIndex],
  )

  const yourScores = useMemo(() => persistedShots.map((s) => s.yourSp), [persistedShots])
  const historySummary = useMemo(
    () => ({
      total: yourScores.length,
      avg: Number(mean(yourScores).toFixed(2)),
      max: yourScores.length > 0 ? Math.max(...yourScores) : 0,
      stddev: Number(stddev(yourScores).toFixed(2)),
    }),
    [yourScores],
  )

  const bandStats = useMemo(() => buildBandStats(persistedShots, (s) => s.yourSp), [persistedShots])
  const selectedBandShots = useMemo(() => {
    const def = BAND_DEFS.find((d) => d.id === selectedBandId)
    if (!def) return []
    return persistedShots.filter((s) => {
      const score = s.yourSp
      if (score < def.min) return false
      if (def.maxExclusive !== null && score >= def.maxExclusive) return false
      return true
    })
  }, [persistedShots, selectedBandId])
  const selectedBandMaxTau = useMemo(() => {
    const values = selectedBandShots
      .map((s) => s.torqueFeatures?.maxInputTau ?? s.torqueFeatures?.maxTau)
      .filter((x): x is number => x !== undefined)
    return Number(mean(values).toFixed(6))
  }, [selectedBandShots])
  const launcherCountByType = useMemo(() => {
    return LAUNCHER_OPTIONS.map((opt) => {
      const count = selectedBandShots.filter((s) => (s.launcherType ?? 'string') === opt.value).length
      return { ...opt, count }
    })
  }, [selectedBandShots])
  const selectedBandShootType = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const shot of selectedBandShots) {
      const type = classifyShootType(shot.features)
      buckets.set(type, (buckets.get(type) ?? 0) + 1)
    }
    if (buckets.size === 0) return '—'
    return [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }, [selectedBandShots])
  const selectedBandShootFeatures = useMemo(() => {
    return {
      t50: summarizeFeature(selectedBandShots, 't_50'),
      tPeak: summarizeFeature(selectedBandShots, 't_peak'),
      slopeMax: summarizeFeature(selectedBandShots, 'slope_max'),
      auc0Peak: summarizeFeature(selectedBandShots, 'auc_0_peak'),
      spikeScore: summarizeFeature(selectedBandShots, 'spike_score'),
      earlyInputRatio: summarizeFeature(selectedBandShots, 'early_input_ratio'),
      lateInputRatio: summarizeFeature(selectedBandShots, 'late_input_ratio'),
      peakInputTime: summarizeFeature(selectedBandShots, 'peak_input_time'),
      inputStability: summarizeFeature(selectedBandShots, 'input_stability'),
    }
  }, [selectedBandShots])

  const selectedBandStat = bandStats[selectedBandId]
  const hasSelectedBandData = (selectedBandStat?.count ?? 0) > 0
  const selectedBandChartMeta = useMemo(() => {
    const series = selectedBandShots
      .map((shot) => {
        if (bandChartTarget === 'sp') {
          const p = shot.profile
          if (!p || p.tMs.length < 2 || p.sp.length < 2) return null
          const t0 = p.tMs[0] ?? 0
          return { t: p.tMs.map((t) => t - t0), y: p.sp }
        }
        const tau = shot.torqueSeries
        if (!tau || tau.tMs.length < 2 || tau.tau.length < 2) return null
        const t0 = tau.tMs[0] ?? 0
        return { t: tau.tMs.map((t) => t - t0), y: tau.tau }
      })
      .filter((s): s is { t: number[]; y: number[] } => s !== null)

    if (series.length === 0) return null
    const agg = aggregateSeries(series, 0, RECENT_X_MAX_MS, 10)
    let peakTimeMs = 0
    let maxValue = Number.NaN
    for (let i = 0; i < agg.newTime.length; i += 1) {
      const v = agg.mean[i]
      if (!Number.isFinite(v)) continue
      if (!Number.isFinite(maxValue) || v > maxValue) {
        maxValue = v
        peakTimeMs = agg.newTime[i] ?? 0
      }
    }
    if (!Number.isFinite(maxValue)) return null
    return { peakTimeMs: Math.round(peakTimeMs), maxValue }
  }, [bandChartTarget, selectedBandShots])
  const maxBandCount = useMemo(
    () => Math.max(1, ...BAND_DEFS.map((b) => bandStats[b.id]?.count ?? 0)),
    [bandStats],
  )

  async function handleConnect() {
    setBleUi((prev) => ({ ...prev, lastError: null, connecting: true }))
    try {
      await bleRef.current.connect()
      setSessionShotCount(0)
      setRecentNotice('接続できました')
      if (isMobileLayout) {
        moveToMobilePage(1)
        setActiveMobilePage(1)
      }
    } catch (error) {
      setBleUi((prev) => ({
        ...prev,
        lastError: toJapaneseErrorMessage(error instanceof Error ? error.message : String(error)),
      }))
    } finally {
      setBleUi((prev) => ({ ...prev, connecting: false }))
    }
  }

  function handleDisconnect() {
    setBleUi((prev) => ({
      ...prev,
      disconnecting: true,
      isBeyAttached: false,
    }))
    try {
      bleRef.current.disconnect()
      setRecentNotice(null)
      setSessionShotCount(0)
    } finally {
      setBleUi((prev) => ({
        ...prev,
        connected: false,
        disconnecting: false,
        isBeyAttached: false,
      }))
    }
  }

  async function handleResetAll() {
    const ok = window.confirm('履歴データをすべて削除します。元に戻せません。実行しますか？')
    if (!ok) {
      return
    }
    await clearShots()
    setPersistedShots([])
    setViewState(storeRef.current.hydrateHistory([]))
    setSelectedBandId(BAND_DEFS[0].id)
  }

  const headerNode = (
    <Header
      bleConnected={bleUi.connected}
      connecting={bleUi.connecting}
      disconnecting={bleUi.disconnecting}
      beyAttached={isBayAttached}
      lastError={bleUi.lastError}
      launcherType={launcherType}
      launcherOptions={LAUNCHER_OPTIONS}
      onLauncherTypeChange={setLauncherType}
      onConnect={() => void handleConnect()}
      onDisconnect={handleDisconnect}
    />
  )

  const mobileGuideMessage = bleUi.connected && sessionShotCount === 0
    ? 'ベイを装着して、シュートしてください。連続してシュートできます。'
    : null

  const recentNode = (
    <section className="section-shell recent-shell">
      <div className="section-head-row recent-head-row">
        <SectionHeader
          en="RECENT"
          title="直近のシュート"
          description="いまの1本を表示"
        />
        <div className="recent-status-row" aria-label="直近画面ステータス">
          <div className="status-item compact">
            <span
              className={`status-dot ${bleUi.connected || bleUi.connecting ? 'on' : 'off'} ${bleUi.connecting || bleUi.disconnecting ? 'connecting' : 'default'}`}
            />
            <span>
              {bleUi.connecting
                ? '接続中...'
                : bleUi.disconnecting
                  ? '切断中...'
                  : bleUi.connected
                    ? 'BBP 接続中'
                    : 'BBP 未接続'}
            </span>
          </div>
          <div className="status-item compact">
            <span className={`status-dot ${isBayAttached ? 'on' : 'off'} default`} />
            <span>{bleUi.connected ? (isBayAttached ? 'ベイ装着' : 'ベイ未装着') : 'ベイ状態: 不明'}</span>
          </div>
          {bleUi.lastError ? (
            <div className="status-item compact">
              <span className="status-dot on error" />
              <span>通信エラー</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="current-section">
        <NeonPanel className="current-left">
          <article className="main-card">
            <h2>記録シュートパワー（BBP公式値）</h2>
            <div className="main-value">
              {latest ? (
                <>
                  {latest.yourSp}
                  <span className="value-unit">rpm</span>
                </>
              ) : (
                '--'
              )}
            </div>
            <div className="card-help launcher-line">ランチャー: {latest ? latestLauncherText : '--'}</div>
            <div className="shoot-type-label">
              シュートタイプ: {latest ? latestShootType : '--'}
            </div>
            {isYourSuspicious ? <span className="warn-badge">異常値の可能性</span> : null}
          </article>
          <div className="sub-card-row">
            <article className="sub-card">
              <h3>推定シュートパワー（波形補正値）</h3>
              <div className="sub-value">
                {latest ? (
                  <>
                    {latest.estSp}
                    <span className="value-unit">rpm</span>
                  </>
                ) : (
                  '--'
                )}
              </div>
            </article>
            <article className="sub-card">
              <h3>最大シュートパワー（ピーク値）</h3>
              <div className="sub-value">
                {latest ? (
                  <>
                    {latest.maxSp}
                    <span className="value-unit">rpm</span>
                  </>
                ) : (
                  '--'
                )}
              </div>
            </article>
          </div>
        </NeonPanel>

        <NeonPanel className="current-right">
          <div className="chart-head-row">
            <h3>直近のシュート波形</h3>
            <div className="shot-meta">
              <span>ピーク: {latest ? `${latestPeakTimeMs}ms` : '--'}</span>
              <span>最大シュートパワー: {latest ? `${latest.maxSp} rpm` : '--'}</span>
            </div>
          </div>
          {recentNotice ? <div className="mobile-recent-msg success">{recentNotice}</div> : null}
          {mobileGuideMessage ? <div className="mobile-recent-msg">{mobileGuideMessage}</div> : null}
          <SegmentedToggle
            value={currentChartTarget}
            onChange={setCurrentChartTarget}
            options={[
              { value: 'sp', label: 'シュートパワー' },
              { value: 'tau', label: 'トルク (a.u.)' },
            ]}
          />
          {currentChartTarget === 'sp' ? (
            <ProfileChart
              profile={latestProfile}
              peakIndex={peakIndex}
              timeMode="start"
              yLabel="シュートパワー (rpm)"
              fixedXMaxMs={RECENT_X_MAX_MS}
              fixedYMax={RECENT_Y_MAX_SP}
              fixedXTicks={[0, 100, 200, 300, 400]}
              fixedYTicks={[0, 3000, 6000, 9000, 12000]}
            />
          ) : latestTorqueSeries ? (
            <ProfileChart
              profile={{
                profilePoints: latestTorqueSeries.tMs.map((tMs, i) => ({
                  tMs,
                  sp: latestTorqueSeries.tau[i] ?? 0,
                  nRefs: 0,
                  dtMs: i > 0 ? tMs - latestTorqueSeries.tMs[i - 1] : tMs,
                })),
                tMs: latestTorqueSeries.tMs,
                sp: latestTorqueSeries.tau,
                nRefs: latestTorqueSeries.tau.map(() => 0),
              }}
              peakIndex={Math.max(0, latestTorqueSeries.tau.findIndex((x) => x === Math.max(...latestTorqueSeries.tau)))}
              timeMode="start"
              yLabel="入力トルク (推定, a.u.)"
              fixedXMaxMs={RECENT_X_MAX_MS}
              fixedYMax={RECENT_Y_MAX_TAU}
              fixedXTicks={[0, 100, 200, 300, 400]}
              fixedYTicks={[0, 50, 100, 150, 200, 250]}
            />
          ) : (
            <div className="empty">推定トルク (a.u.): --</div>
          )}
        </NeonPanel>
      </div>
    </section>
  )

  const historyNode = (
    <section className="section-shell history-shell">
      <div className="section-head-row">
        <SectionHeader
          en="HISTORY"
          title="履歴と分析"
          description="過去のデータから帯域別に特徴を解析することができます"
        />
        <div className="section-head-actions">
          <button className="mini-btn subtle history-reset-btn" onClick={() => void handleResetAll()} type="button">
            データリセット
          </button>
        </div>
      </div>
      <div className="history-section">
        <NeonPanel className="history-left">
          <div className="panel-head">
            <h3>シュートパワー帯域</h3>
          </div>
          <ul className="band-list compact">
            {BAND_DEFS.map((band) => {
              const stat = bandStats[band.id]
              const active = selectedBandId === band.id
              const count = stat?.count ?? 0
              const ratio = Math.round((count / maxBandCount) * 100)
              return (
                <li key={band.id}>
                  <button className={`band-item ${active ? 'active' : ''}`} onClick={() => setSelectedBandId(band.id)} type="button">
                    <span className="band-bar" style={{ width: `${ratio}%` }} />
                    <span>
                      {band.label}
                      <span className="inline-unit"> rpm</span>
                    </span>
                    <span>{count}件</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="history-summary-row history-summary-left">
            シュートパワー統計: 合計 {historySummary.total}本 / 平均 {historySummary.avg}<span className="inline-unit"> rpm</span> / 最高 {historySummary.max}<span className="inline-unit"> rpm</span> / SD {historySummary.stddev}
          </div>
        </NeonPanel>

        <NeonPanel className="history-right">
          <div className="chart-head-row">
            <h3>
              シュート波形：帯域{selectedBandId}
              <span className="inline-unit"> rpm</span>
            </h3>
            <div className="shot-meta">
              <span>ピーク(平均): {selectedBandChartMeta ? `${selectedBandChartMeta.peakTimeMs}ms` : '--'}</span>
              <span>
                {bandChartTarget === 'sp' ? '最大シュートパワー(平均): ' : '最大トルク(平均): '}
                {selectedBandChartMeta
                  ? `${bandChartTarget === 'sp'
                    ? Math.round(selectedBandChartMeta.maxValue)
                    : Number(selectedBandChartMeta.maxValue.toFixed(2))} ${bandChartTarget === 'sp' ? 'rpm' : 'a.u.'}`
                  : '--'}
              </span>
            </div>
          </div>
          <div className="segment-row">
            <SegmentedToggle
              value={bandChartTarget}
              onChange={setBandChartTarget}
              options={[
                { value: 'sp', label: 'シュートパワー' },
                { value: 'tau', label: 'トルク (a.u.)' },
              ]}
            />
            <SegmentedToggle
              value={bandChartMode}
              onChange={setBandChartMode}
              options={[
                { value: 'avg', label: '平均' },
                { value: 'overlay', label: '重ね描き' },
              ]}
            />
          </div>

          <BandChart
            shots={selectedBandShots}
            mode={bandChartMode}
            seriesTarget={bandChartTarget}
            alignment="start"
            normalize={false}
            rangeStart={0}
            rangeEnd={RECENT_X_MAX_MS}
            fixedYMin={0}
            fixedYMax={bandChartTarget === 'tau' ? RECENT_Y_MAX_TAU : RECENT_Y_MAX_SP}
            fixedXTicks={[0, 100, 200, 300, 400]}
            fixedYTicks={bandChartTarget === 'tau' ? [0, 50, 100, 150, 200, 250] : [0, 3000, 6000, 9000, 12000]}
            xLabel="時間 (ms)"
            yLabel={bandChartTarget === 'tau' ? '入力トルク (推定, a.u.)' : 'シュートパワー (rpm)'}
            maxOverlay={20}
          />

          <div className="stats-two-col">
            <div className="stats-col">
              <h4>帯域のシュートパワー統計</h4>
              <div>合計: {selectedBandShots.length}本</div>
              <div>・ストリングランチャー: {launcherCountByType.find((x) => x.value === 'string')?.count ?? 0}本</div>
              <div>・ワインダーランチャー: {launcherCountByType.find((x) => x.value === 'winder')?.count ?? 0}本</div>
              <div>・ロングワインダー: {launcherCountByType.find((x) => x.value === 'longWinder')?.count ?? 0}本</div>
              <div>平均: {selectedBandStat && hasSelectedBandData ? <>{selectedBandStat.mean}<span className="inline-unit"> rpm</span></> : '—'}</div>
              <div>最高: {selectedBandStat && hasSelectedBandData ? <>{selectedBandStat.max}<span className="inline-unit"> rpm</span></> : '—'}</div>
              <div>標準偏差: {selectedBandStat && hasSelectedBandData ? selectedBandStat.stddev : '—'}</div>
            </div>

            <div className="stats-col detail">
              <h4>詳細データ</h4>
              <div className="detail-grid">
                <div className="detail-col">
                  <h5>シュート要素</h5>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.maxTau} />
                    <strong>{hasSelectedBandData ? `${selectedBandMaxTau} a.u.` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.t_50} />
                    <strong>{selectedBandStat ? `平均 ${formatMaybe(selectedBandShootFeatures.t50.mean, hasSelectedBandData, 3)}ms / 中央値 ${formatMaybe(selectedBandShootFeatures.t50.p50, hasSelectedBandData, 3)}ms` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.t_peak} />
                    <strong>{selectedBandStat ? `平均 ${formatMaybe(selectedBandShootFeatures.tPeak.mean, hasSelectedBandData, 3)}ms / 中央値 ${formatMaybe(selectedBandShootFeatures.tPeak.p50, hasSelectedBandData, 3)}ms` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.slope_max} />
                    <strong>{selectedBandStat ? `平均 ${formatMaybe(selectedBandShootFeatures.slopeMax.mean, hasSelectedBandData, 3)} / 中央値 ${formatMaybe(selectedBandShootFeatures.slopeMax.p50, hasSelectedBandData, 3)}` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.auc_0_peak} />
                    <strong>{selectedBandStat ? `平均 ${formatMaybe(selectedBandShootFeatures.auc0Peak.mean, hasSelectedBandData, 3)}SP / 中央値 ${formatMaybe(selectedBandShootFeatures.auc0Peak.p50, hasSelectedBandData, 3)}SP` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.spike_score} />
                    <strong>{selectedBandStat ? `平均 ${formatMaybe(selectedBandShootFeatures.spikeScore.mean, hasSelectedBandData, 3)} / 中央値 ${formatMaybe(selectedBandShootFeatures.spikeScore.p50, hasSelectedBandData, 3)}` : '—'}</strong>
                  </div>
                </div>

                <div className="detail-col">
                  <h5>シュートタイプ判定</h5>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.early_input_ratio} />
                    <strong>{hasSelectedBandData ? `平均 ${formatMaybe(selectedBandShootFeatures.earlyInputRatio.mean, true, 3)} / 中央値 ${formatMaybe(selectedBandShootFeatures.earlyInputRatio.p50, true, 3)}` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.late_input_ratio} />
                    <strong>{hasSelectedBandData ? `平均 ${formatMaybe(selectedBandShootFeatures.lateInputRatio.mean, true, 3)} / 中央値 ${formatMaybe(selectedBandShootFeatures.lateInputRatio.p50, true, 3)}` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.peak_input_time} />
                    <strong>{hasSelectedBandData ? `平均 ${formatMaybe(selectedBandShootFeatures.peakInputTime.mean, true, 3)}ms / 中央値 ${formatMaybe(selectedBandShootFeatures.peakInputTime.p50, true, 3)}ms` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <MetricLabel help={METRIC_LABELS.input_stability} />
                    <strong>{hasSelectedBandData ? `平均 ${formatMaybe(selectedBandShootFeatures.inputStability.mean, true, 3)} / 中央値 ${formatMaybe(selectedBandShootFeatures.inputStability.p50, true, 3)}` : '—'}</strong>
                  </div>
                  <div className="compact-metric">
                    <span>選択中ランチャー</span>
                    <strong>{launcherLabel(launcherType)}</strong>
                  </div>
                  <div className="judge-text">シュートタイプ判定: {selectedBandShootType}</div>
                </div>
              </div>
            </div>
          </div>
        </NeonPanel>
      </div>
    </section>
  )

  if (isMobileLayout) {
    const actionLabel = bleUi.connecting
      ? '接続中...'
      : bleUi.disconnecting
        ? '切断中...'
        : bleUi.connected
          ? '切断する'
          : '接続する'
    const connectionLabel = bleUi.connecting
      ? 'BBP 接続中...'
      : bleUi.disconnecting
        ? 'BBP 切断中...'
        : bleUi.connected
          ? 'BBP 接続中'
          : 'BBP 未接続'
    const attachLabel = bleUi.connected ? (isBayAttached ? 'ベイ装着' : 'ベイ未装着') : 'ベイ状態: 不明'

    return (
      <main className="layout app-mobile app-compact neon-theme mobile-shell">
        <div className="mobile-pager" ref={mobilePagerRef}>
          <section className="mobile-page">
            <SectionHeader en="SETTINGS" title="設定・接続" description="ランチャー選択とBBP接続" />
            <NeonPanel className="mobile-settings-panel">
              <div className="mobile-launcher-group">
                <div className="mobile-launcher-label">ランチャーを選んでください</div>
                <div className="mobile-launcher-buttons">
                  {LAUNCHER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`mobile-launcher-btn ${launcherType === opt.value ? 'active' : ''}`}
                      onClick={() => setLauncherType(opt.value)}
                      aria-pressed={launcherType === opt.value}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="mobile-connect-btn"
                onClick={bleUi.connected ? handleDisconnect : () => void handleConnect()}
                type="button"
                disabled={bleUi.connecting || bleUi.disconnecting}
              >
                {actionLabel}
              </button>

              {bleUi.connecting ? (
                <div className="mobile-connect-help">ベイバトルパスを長押ししてください</div>
              ) : null}

              <div className="mobile-status-box">
                <div className="status-item">
                  <span className={`status-dot ${bleUi.connected || bleUi.connecting ? 'on' : 'off'} ${bleUi.connecting || bleUi.disconnecting ? 'connecting' : 'default'}`} />
                  <span>{connectionLabel}</span>
                </div>
                <div className="status-item">
                  <span className={`status-dot ${isBayAttached ? 'on' : 'off'} default`} />
                  <span>{attachLabel}</span>
                </div>
              </div>

              {bleUi.lastError ? <div className="mobile-error-box">{bleUi.lastError}</div> : null}
            </NeonPanel>
          </section>
          <section className="mobile-page">{recentNode}</section>
          <section className="mobile-page">{historyNode}</section>
        </div>
        <div className="mobile-page-dots" aria-label="ページインジケーター">
          {[0, 1, 2].map((page) => (
            <button
              key={page}
              type="button"
              className={`mobile-page-dot ${activeMobilePage === page ? 'active' : ''}`}
              onClick={() => moveToMobilePage(page)}
              aria-label={`ページ ${page + 1} に移動`}
            >
              {activeMobilePage === page ? '●' : '○'}
            </button>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="layout app-mobile app-compact neon-theme">
      {headerNode}
      {recentNode}
      {historyNode}
    </main>
  )
}
