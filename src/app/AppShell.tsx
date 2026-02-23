import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProtocolError, ShotProfile, ShotSnapshot } from '../features/ble/bbpTypes'
import { ShotStore, type MeterViewState } from '../features/meter/ShotStore'
import { Header } from '../ui/Header'
import { ProfileChart } from '../ui/ProfileChart'
import { BandChart } from '../ui/BandChart'
import { NeonPanel } from '../ui/NeonPanel'
import { SectionHeader } from '../ui/SectionHeader'
import { MeterGauge } from '../ui/MeterGauge'
import { RawLogPanel } from '../ui/RawLogPanel'
import { isCapacitorNativeEnvironment } from '../features/ble/bleEnvironment'
import {
  computeShotFeatures,
  type ShotFeatures,
} from '../features/meter/shotFeatures'
import { clearShots, listShots, saveShot, type PersistentShot } from '../features/meter/shotStorage'
import { BAND_DEFS, buildBandStats } from '../features/meter/statsBands'
import { computeLauncherEfficiencyFromAuc, LAUNCHER_SPECS, type LauncherEfficiency } from '../features/meter/launcherEfficiency'
import { detectDecaySegment } from '../analysis/decayDetect'
import { fitFriction } from '../analysis/frictionFit'
import { computeTorque } from '../analysis/torque'
import { findFirstPeakIndex } from '../analysis/firstPeak'
import { aggregateSeries } from '../analysis/aggregateSeries'
import { getBleService } from '../features/ble/bleSingleton'
import { clearRawPackets, getRawPackets, pushRawPacket, subscribeRawPackets } from '../features/ble/rawPacketStore'
import { getEntitlement, setProForDev, subscribeEntitlement } from '../features/entitlement'
import {
  LAUNCHER_OPTIONS,
  type LauncherType,
} from '../features/meter/shootType'

const RECENT_X_MAX_MS = 400
const RECENT_Y_MAX_SP = 12000
const METER_MAX_RPM = 16000
const LAUNCHER_TYPE_KEY = 'beymeter.launcherType'
const BEST_SP_KEY = 'beymeter:bestSp'
const DISPLAY_MODE_KEY = 'beymeter:displayMode'
const NATIVE_CONNECT_TIMEOUT_MS = 15000

type ConnectOverlayState = 'hidden' | 'connecting' | 'success' | 'error'

interface BleUiState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  isBeyAttached: boolean
  bbpTotalShots: number | null
  lastError: string | null
}

export type MainRoute = 'meter' | 'detail' | 'multi'

interface AppShellProps {
  route: MainRoute
}

function getInitialLauncherType(): LauncherType {
  const saved = window.localStorage.getItem(LAUNCHER_TYPE_KEY)
  if (saved === 'string' || saved === 'winder' || saved === 'longWinder') {
    return saved
  }
  return 'string'
}

function getInitialBestSp(): number {
  const raw = Number(window.localStorage.getItem(BEST_SP_KEY) ?? '0')
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0
}

function getInitialDisplayMode(): 'free' | 'pro' {
  const raw = window.localStorage.getItem(DISPLAY_MODE_KEY)
  return raw === 'pro' ? 'pro' : 'free'
}

function classifyThreeShotType(
  features:
    | Pick<ShotFeatures, 't_peak' | 'peak_input_time' | 'early_input_ratio' | 'late_input_ratio' | 'accel_ratio'>
    | null
    | undefined,
): 'front' | 'constant' | 'back' {
  if (!features) return 'constant'
  const tPeak = features.t_peak
  const tInputPeak = features.peak_input_time
  const early = features.early_input_ratio
  const late = features.late_input_ratio
  const ratio = features.accel_ratio

  const peakPos = Number.isFinite(tPeak) && tPeak > 0 && Number.isFinite(tInputPeak)
    ? tInputPeak / tPeak
    : Number.NaN
  const delta = (Number.isFinite(late) ? late : 0) - (Number.isFinite(early) ? early : 0)

  // 1) Peak position is strongest signal for user's definition.
  if (Number.isFinite(peakPos) && peakPos >= 0.7) {
    return 'back'
  }
  if (Number.isFinite(peakPos) && peakPos <= 0.45) {
    return 'front'
  }

  // 2) Input distribution trend as secondary signal.
  if (delta >= 0.1 || ratio <= 0.92) {
    return 'back'
  }
  if (delta <= -0.12 || ratio >= 1.12) {
    return 'front'
  }

  // 3) Otherwise treat as constant.
  if (Number.isFinite(delta) && Math.abs(delta) <= 0.12) {
    return 'constant'
  }

  return delta > 0 ? 'back' : 'front'
}

function ensureProfile(profile: ShotProfile): ShotProfile {
  const length = Math.min(profile.sp.length, profile.nRefs.length, profile.tMs.length)
  const canRebuildFromNRefs =
    length > 0 && profile.nRefs.slice(0, length).some((n) => Number.isFinite(n) && n > 0)

  if (canRebuildFromNRefs) {
    let et = 0
    const tMs: number[] = []
    const sp: number[] = []
    const nRefs: number[] = []
    const profilePoints: Array<{ tMs: number; sp: number; nRefs: number; dtMs: number }> = []

    for (let i = 0; i < length; i += 1) {
      const s = profile.sp[i] ?? 0
      const nr = profile.nRefs[i] ?? 0
      const fallbackDt = i > 0 ? Math.max(0, (profile.tMs[i] ?? 0) - (profile.tMs[i - 1] ?? 0)) : (profile.tMs[0] ?? 0)
      const dtMs = nr > 0 ? nr / 125 : fallbackDt
      et += dtMs
      tMs.push(et)
      sp.push(s)
      nRefs.push(nr)
      profilePoints.push({
        tMs: et,
        sp: s,
        nRefs: nr,
        dtMs,
      })
    }

    return {
      profilePoints,
      tMs,
      sp,
      nRefs,
    }
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
  return Number(Math.max(0, peakT - t0).toFixed(2))
}

function toSnapshot(shot: PersistentShot): ShotSnapshot {
  return {
    yourSp: shot.yourSp,
    estSp: shot.estSp,
    maxSp: shot.maxSp,
    count: 0,
    profile: ensureProfile(shot.profile),
    launchMarkerMs: shot.launchMarkerMs ?? null,
    estReason: 'persisted',
    receivedAt: shot.createdAt,
  }
}

function trimProfileToTime(profile: ShotProfile, endMs: number | null | undefined): ShotProfile {
  if (!Number.isFinite(endMs ?? Number.NaN)) return profile
  const limit = endMs as number
  const indexes = profile.tMs
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t <= limit)
    .map((x) => x.i)
  if (indexes.length < 2) return profile
  const end = indexes[indexes.length - 1]
  return {
    profilePoints: profile.profilePoints.slice(0, end + 1),
    tMs: profile.tMs.slice(0, end + 1),
    sp: profile.sp.slice(0, end + 1),
    nRefs: profile.nRefs.slice(0, end + 1),
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((x) => (x - m) ** 2)))
}

function toLocalizedErrorMessage(t: (key: string) => string, message: string): string {
  const m = message.toLowerCase()
  if (m.includes('timeout')) {
    return t('ble.connectTimeout')
  }
  if (m.includes('bbp device not found') || m.includes('device not found')) {
    return t('ble.deviceNotFound')
  }
  if (m.includes('not implemented on ios') || m.includes('plugin is not implemented')) {
    return t('ble.initFailed')
  }
  if (m.includes('failed to connect') || m.includes('gatt')) {
    return t('ble.connectFailed')
  }
  if (m.includes('notavailableerror') || m.includes('bluetooth is not available')) {
    return t('ble.notAvailable')
  }
  return message
}

export function AppShell({ route: _route }: AppShellProps) {
  const { t } = useTranslation()
  void _route
  const bleRef = useRef(getBleService())
  const storeRef = useRef(new ShotStore())

  const [bleUi, setBleUi] = useState<BleUiState>({
    connected: false,
    connecting: false,
    disconnecting: false,
    isBeyAttached: false,
    bbpTotalShots: null,
    lastError: null,
  })
  const [viewState, setViewState] = useState<MeterViewState>(storeRef.current.getState())
  const [persistedShots, setPersistedShots] = useState<PersistentShot[]>([])
  const [launcherType, setLauncherType] = useState<LauncherType>(() => getInitialLauncherType())
  const [isPro, setIsPro] = useState(() => getEntitlement().isPro)
  const [displayMode, setDisplayMode] = useState<'free' | 'pro'>(() => getInitialDisplayMode())
  const [bestSp, setBestSp] = useState<number>(() => getInitialBestSp())
  const [showBestUpdated, setShowBestUpdated] = useState(false)
  const launcherTypeRef = useRef(launcherType)
  const bestSpRef = useRef(bestSp)

  const [selectedBandId, setSelectedBandId] = useState(BAND_DEFS[0].id)
  const userSelectedBandRef = useRef(false)
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => window.matchMedia('(max-width: 767px)').matches,
  )
  const mobilePagerRef = useRef<HTMLDivElement | null>(null)
  const [activeMobilePage, setActiveMobilePage] = useState(0)
  const [desktopView, setDesktopView] = useState<'meter' | 'detail' | 'raw'>('meter')
  const [desktopProOverlay, setDesktopProOverlay] = useState<null | 'detail' | 'raw'>(null)
  const activeMobilePageRef = useRef(0)
  const [connectNotice, setConnectNotice] = useState<string | null>(null)
  const [modeNotice, setModeNotice] = useState<string | null>(null)
  const [rawPackets, setRawPackets] = useState(() => getRawPackets())
  const [connectOverlayState, setConnectOverlayState] = useState<ConnectOverlayState>('hidden')
  const wasConnectedRef = useRef(false)
  const connectAttemptRef = useRef(0)

  const isBayAttached = bleUi.connected && bleUi.isBeyAttached

  useEffect(() => {
    launcherTypeRef.current = launcherType
    window.localStorage.setItem(LAUNCHER_TYPE_KEY, launcherType)
  }, [launcherType])

  useEffect(() => {
    bestSpRef.current = bestSp
  }, [bestSp])

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_MODE_KEY, displayMode)
  }, [displayMode])

  useEffect(() => {
    if (!isPro && displayMode !== 'free') {
      setDisplayMode('free')
    }
  }, [isPro, displayMode])

  useEffect(() => {
    activeMobilePageRef.current = activeMobilePage
  }, [activeMobilePage])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches)
    }
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [t])

  useEffect(() => {
    if (!isMobileLayout) return
    const node = mobilePagerRef.current
    if (!node) return
    const onScroll = () => {
      const width = node.clientWidth || 1
      const next = Math.max(0, Math.min(2, Math.round(node.scrollLeft / width)))
      if (next !== activeMobilePageRef.current) {
        setActiveMobilePage(next)
      }
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => node.removeEventListener('scroll', onScroll)
  }, [isMobileLayout])

  useEffect(() => {
    return subscribeEntitlement(() => {
      setIsPro(getEntitlement().isPro)
    })
  }, [])

  useEffect(() => {
    const ble = bleRef.current
    const unsubscribeRaw = subscribeRawPackets(() => {
      setRawPackets(getRawPackets())
    })

    ble.setHandlers({
      onState: (state) => {
        setBleUi((prev) => ({
          ...prev,
          connected: state.connected,
          connecting: state.connected ? false : prev.connecting,
          disconnecting: false,
          // Authoritative attached state from A0 payload decode in parser.
          isBeyAttached: state.connected ? state.beyAttached : false,
          bbpTotalShots: state.connected ? state.bbpTotalShots : null,
          lastError: state.connected ? null : prev.lastError,
        }))
      },
      onShot: (snapshot: ShotSnapshot) => {
        if (snapshot.maxSp > bestSpRef.current) {
          setBestSp(snapshot.maxSp)
          window.localStorage.setItem(BEST_SP_KEY, String(snapshot.maxSp))
          setShowBestUpdated(true)
        }
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
        const analysisProfile = trimProfileToTime(profile, snapshot.launchMarkerMs)

        void (async () => {
          const decaySegment = detectDecaySegment(analysisProfile)
          const frictionFit = fitFriction(analysisProfile, decaySegment)
          const { torqueSeries, torqueFeatures } = computeTorque(analysisProfile, frictionFit, decaySegment)

          const shot: PersistentShot = {
            id: `${snapshot.receivedAt}-${Math.random().toString(36).slice(2, 8)}`,
            launcherType: launcherTypeRef.current,
            createdAt: snapshot.receivedAt,
            yourSp: snapshot.yourSp,
            estSp: snapshot.estSp,
            maxSp: snapshot.maxSp,
            chosenSpType: 'est',
            launchMarkerMs: snapshot.launchMarkerMs ?? null,
            profile,
            features: computeShotFeatures(analysisProfile),
            decaySegment,
            frictionFit,
            torqueSeries,
            torqueFeatures,
            label: snapshot.yourSp >= 10000 ? 'HIGH' : snapshot.yourSp >= 3000 ? 'MID' : 'LOW',
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
        setBleUi((prev) => ({ ...prev, lastError: toLocalizedErrorMessage(t, msg) }))
        setViewState(storeRef.current.setError(error))
      },
      onRaw: (packet) => {
        pushRawPacket(packet)
      },
    })
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
      unsubscribeRaw()
    }
  }, [t])

  useEffect(() => {
    const justConnected = !wasConnectedRef.current && bleUi.connected
    wasConnectedRef.current = bleUi.connected
    if (!justConnected) {
      return
    }
    setConnectOverlayState('hidden')
    setConnectNotice(t('mobile.connectedNotice'))
  }, [bleUi.connected, t])

  useEffect(() => {
    if (!bleUi.lastError) return
    const timer = window.setTimeout(() => {
      setBleUi((prev) => ({ ...prev, lastError: null }))
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [bleUi.lastError])

  useEffect(() => {
    if (!connectNotice) return
    const timer = window.setTimeout(() => setConnectNotice(null), 2800)
    return () => window.clearTimeout(timer)
  }, [connectNotice])

  useEffect(() => {
    if (!modeNotice) return
    const timer = window.setTimeout(() => setModeNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [modeNotice])

  const latest = viewState.latest
  const latestProfile = latest?.profile ?? null
  const peakIndex = latestProfile ? findFirstPeakIndex(latestProfile.tMs, latestProfile.sp) : 0
  const latestPersisted = useMemo(
    () => (latest ? persistedShots.find((s) => s.createdAt === latest.receivedAt) ?? null : null),
    [latest, persistedShots],
  )
  const launcherOptions = useMemo(
    () => LAUNCHER_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) })),
    [t],
  )
  const latestFeatures = useMemo(
    () => latestPersisted?.features ?? (latestProfile ? computeShotFeatures(latestProfile) : null),
    [latestPersisted?.features, latestProfile],
  )
  const latestLauncherType = (latestPersisted?.launcherType ?? launcherType) as LauncherType
  const latestEfficiency = useMemo(
    () => computeLauncherEfficiencyFromAuc(latestFeatures?.auc_0_peak ?? 0, latestLauncherType),
    [latestFeatures?.auc_0_peak, latestLauncherType],
  )
  const latestShootType3 = useMemo(() => classifyThreeShotType(latestFeatures), [latestFeatures])
  const latestSpPeakValue = useMemo(() => {
    if (!latestProfile || latestProfile.sp.length === 0) return latest?.maxSp ?? null
    return Math.round(latestProfile.sp[Math.max(0, Math.min(peakIndex, latestProfile.sp.length - 1))] ?? latest?.maxSp ?? 0)
  }, [latestProfile, latest, peakIndex])
  const latestTorqueSeries = latestPersisted?.torqueSeries ?? null
  const latestFallbackTorqueSeries = useMemo(
    () => (latestProfile ? computeTorque(latestProfile, null, null).torqueSeries : null),
    [latestProfile],
  )
  const latestVisibleTorqueSeries = latestTorqueSeries ?? latestFallbackTorqueSeries
  const latestTorqueProfile = useMemo(
    () =>
      latestVisibleTorqueSeries
        ? {
            profilePoints: latestVisibleTorqueSeries.tMs.map((tMs, i) => ({
              tMs,
              sp: latestVisibleTorqueSeries.tau[i] ?? 0,
              nRefs: 0,
              dtMs: i > 0 ? tMs - latestVisibleTorqueSeries.tMs[i - 1] : tMs,
            })),
            tMs: latestVisibleTorqueSeries.tMs,
            sp: latestVisibleTorqueSeries.tau,
            nRefs: latestVisibleTorqueSeries.tau.map(() => 0),
          }
        : null,
    [latestVisibleTorqueSeries],
  )
  const latestTorquePeakIndex = useMemo(() => {
    if (!latestVisibleTorqueSeries || latestVisibleTorqueSeries.tau.length === 0) return 0
    let maxIdx = 0
    let maxVal = Number.NEGATIVE_INFINITY
    for (let i = 0; i < latestVisibleTorqueSeries.tau.length; i += 1) {
      const v = latestVisibleTorqueSeries.tau[i] ?? Number.NEGATIVE_INFINITY
      if (v > maxVal) {
        maxVal = v
        maxIdx = i
      }
    }
    return maxIdx
  }, [latestVisibleTorqueSeries])
  const latestTorquePeakTimeMs = useMemo(() => {
    if (!latestTorqueProfile || latestTorqueProfile.tMs.length === 0) return null
    let maxIdx = 0
    let maxVal = Number.NEGATIVE_INFINITY
    for (let i = 0; i < latestTorqueProfile.sp.length; i += 1) {
      const t = latestTorqueProfile.tMs[i] ?? Number.POSITIVE_INFINITY
      if (t > RECENT_X_MAX_MS) continue
      const v = latestTorqueProfile.sp[i] ?? Number.NEGATIVE_INFINITY
      if (v > maxVal) {
        maxVal = v
        maxIdx = i
      }
    }
    if (!Number.isFinite(maxVal)) return null
    return getStartAlignedPeakTimeMs(latestTorqueProfile, maxIdx)
  }, [latestTorqueProfile])
  const latestPeakTimeMs = useMemo(
    () => getStartAlignedPeakTimeMs(latestProfile, peakIndex),
    [latestProfile, peakIndex],
  )
  const latestMaxTorqueText = useMemo(() => {
    if (!latestVisibleTorqueSeries || latestVisibleTorqueSeries.tau.length === 0) return t('common.none')
    const values = latestVisibleTorqueSeries.tau.filter((_, i) => (latestVisibleTorqueSeries.tMs[i] ?? Number.POSITIVE_INFINITY) <= RECENT_X_MAX_MS)
    if (values.length === 0) return t('common.none')
    const maxVal = Math.max(...values)
    return `${Number(maxVal.toFixed(3))} rpm/ms`
  }, [latestVisibleTorqueSeries, t])
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
  const selectedBandAucToPeakMean = useMemo(() => {
    const values = selectedBandShots
      .map((s) => s.features?.auc_0_peak)
      .filter((x): x is number => Number.isFinite(x))
    return values.length > 0 ? Number(mean(values).toFixed(2)) : null
  }, [selectedBandShots])
  const selectedBandAccelRatioMean = useMemo(() => {
    const values = selectedBandShots
      .map((s) => s.features?.accel_ratio)
      .filter((x): x is number => Number.isFinite(x))
    return values.length > 0 ? Number(mean(values).toFixed(3)) : null
  }, [selectedBandShots])
  const selectedBandEarlyInputRatioMean = useMemo(() => {
    const values = selectedBandShots
      .map((s) => s.features?.early_input_ratio)
      .filter((x): x is number => Number.isFinite(x))
    return values.length > 0 ? Number(mean(values).toFixed(3)) : null
  }, [selectedBandShots])
  const selectedBandLateInputRatioMean = useMemo(() => {
    const values = selectedBandShots
      .map((s) => s.features?.late_input_ratio)
      .filter((x): x is number => Number.isFinite(x))
    return values.length > 0 ? Number(mean(values).toFixed(3)) : null
  }, [selectedBandShots])
  const selectedBandTPeakMean = useMemo(() => {
    const values = selectedBandShots
      .map((s) => s.features?.t_peak)
      .filter((x): x is number => Number.isFinite(x))
    return values.length > 0 ? Number(mean(values).toFixed(2)) : null
  }, [selectedBandShots])
  const selectedBandPeakInputTimeMean = useMemo(() => {
    const values = selectedBandShots
      .map((s) => s.features?.peak_input_time)
      .filter((x): x is number => Number.isFinite(x))
    return values.length > 0 ? Number(mean(values).toFixed(2)) : null
  }, [selectedBandShots])
  const selectedBandTorquePeakPosition = useMemo(() => {
    const values = selectedBandShots
      .map((s) => {
        const tPeak = s.features?.t_peak ?? 0
        const tTau = s.features?.peak_input_time ?? 0
        if (!Number.isFinite(tPeak) || tPeak <= 0 || !Number.isFinite(tTau)) return null
        return Math.max(0, Math.min(100, (tTau / tPeak) * 100))
      })
      .filter((x): x is number => x !== null)
    if (values.length === 0) return null
    return Number(mean(values).toFixed(1))
  }, [selectedBandShots])
  const selectedBandShootType3 = useMemo(
    () =>
      t(
        `shootType3.${classifyThreeShotType({
          accel_ratio: selectedBandAccelRatioMean ?? 1,
          early_input_ratio: selectedBandEarlyInputRatioMean ?? 0.5,
          late_input_ratio: selectedBandLateInputRatioMean ?? 0.5,
          t_peak: selectedBandTPeakMean ?? 0,
          peak_input_time: selectedBandPeakInputTimeMean ?? 0,
        })}`,
      ),
    [
      selectedBandAccelRatioMean,
      selectedBandEarlyInputRatioMean,
      selectedBandLateInputRatioMean,
      selectedBandTPeakMean,
      selectedBandPeakInputTimeMean,
      t,
    ],
  )
  const selectedBandEfficiencyByLauncher = useMemo(() => {
    const result: Record<LauncherType, { count: number; meanPercent: number | null; sdPercent: number | null; meanLengthCm: number | null; totalLengthCm: number }> = {
      string: { count: 0, meanPercent: null, sdPercent: null, meanLengthCm: null, totalLengthCm: LAUNCHER_SPECS.string.lengthCm },
      winder: { count: 0, meanPercent: null, sdPercent: null, meanLengthCm: null, totalLengthCm: LAUNCHER_SPECS.winder.lengthCm },
      longWinder: { count: 0, meanPercent: null, sdPercent: null, meanLengthCm: null, totalLengthCm: LAUNCHER_SPECS.longWinder.lengthCm },
    }
    for (const launcher of LAUNCHER_OPTIONS.map((o) => o.value)) {
      const efficiencies = selectedBandShots
        .filter((s) => (s.launcherType ?? 'string') === launcher)
        .map((s) => computeLauncherEfficiencyFromAuc(s.features?.auc_0_peak ?? 0, launcher))
        .filter((x): x is LauncherEfficiency => x !== null)
      result[launcher].count = efficiencies.length
      if (efficiencies.length > 0) {
        const percents = efficiencies.map((x) => x.effPercent)
        const lengths = efficiencies.map((x) => x.effLengthCm)
        result[launcher].meanPercent = Number(mean(percents).toFixed(1))
        result[launcher].sdPercent = Number(stddev(percents).toFixed(1))
        result[launcher].meanLengthCm = Number(mean(lengths).toFixed(1))
      }
    }
    return result
  }, [selectedBandShots])
  const selectedBandLauncherEfficiencies = useMemo(() => {
    return selectedBandShots
      .filter((s) => (s.launcherType ?? 'string') === launcherType)
      .map((s) => computeLauncherEfficiencyFromAuc(s.features?.auc_0_peak ?? 0, launcherType))
      .filter((x): x is LauncherEfficiency => x !== null)
  }, [selectedBandShots, launcherType])
  const selectedBandEffectiveLengthSummary = useMemo(() => {
    if (selectedBandLauncherEfficiencies.length === 0) return null
    const lengthCm = LAUNCHER_SPECS[launcherType].lengthCm
    const effLengthCm = Number(
      mean(selectedBandLauncherEfficiencies.map((x) => x.effLengthCm)).toFixed(1),
    )
    const effPercent = Number(
      mean(selectedBandLauncherEfficiencies.map((x) => x.effPercent)).toFixed(0),
    )
    return { effLengthCm, lengthCm, effPercent }
  }, [selectedBandLauncherEfficiencies, launcherType])

  const selectedBandStat = bandStats[selectedBandId]
  const hasSelectedBandData = (selectedBandStat?.count ?? 0) > 0
  const selectedBandSpMeta = useMemo(() => {
    const series = selectedBandShots
      .map((shot) => {
        const p = shot.profile
        if (!p || p.tMs.length < 2 || p.sp.length < 2) return null
        const t0 = p.tMs[0] ?? 0
        return { t: p.tMs.map((x) => x - t0), y: p.sp }
      })
      .filter((s): s is { t: number[]; y: number[] } => s !== null)
    if (series.length === 0) return null
    const agg = aggregateSeries(series, 0, RECENT_X_MAX_MS, 1)
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
    return { peakTimeMs: Math.round(peakTimeMs), maxValue: Number(maxValue.toFixed(2)) }
  }, [selectedBandShots])
  const selectedBandTauMeta = useMemo(() => {
    const series = selectedBandShots
      .map((shot) => {
        const tau = shot.torqueSeries
        if (!tau || tau.tMs.length < 2 || tau.tau.length < 2) return null
        const t0 = tau.tMs[0] ?? 0
        return { t: tau.tMs.map((x) => x - t0), y: tau.tau }
      })
      .filter((s): s is { t: number[]; y: number[] } => s !== null)
    if (series.length === 0) return null
    const agg = aggregateSeries(series, 0, RECENT_X_MAX_MS, 1)
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
    return { peakTimeMs: Math.round(peakTimeMs), maxValue: Number(maxValue.toFixed(3)) }
  }, [selectedBandShots])
  const maxBandCount = useMemo(
    () => Math.max(1, ...BAND_DEFS.map((b) => bandStats[b.id]?.count ?? 0)),
    [bandStats],
  )
  useEffect(() => {
    if (userSelectedBandRef.current) return
    let bestId = BAND_DEFS[0].id
    let bestCount = -1
    for (const band of BAND_DEFS) {
      const count = bandStats[band.id]?.count ?? 0
      if (count > bestCount) {
        bestCount = count
        bestId = band.id
      }
    }
    setSelectedBandId(bestId)
  }, [bandStats])

  async function handleConnect() {
    const isNative = isCapacitorNativeEnvironment()
    const attemptId = Date.now()
    connectAttemptRef.current = attemptId
    setConnectNotice(null)
    setBleUi((prev) => ({ ...prev, lastError: null, connecting: true }))
    if (isNative) {
      setConnectOverlayState('connecting')
    }
    try {
      const connectPromise = bleRef.current.connect()
      if (isNative) {
        await Promise.race([
          connectPromise,
          new Promise((_, reject) =>
            window.setTimeout(() => reject(new Error('connect timeout')), NATIVE_CONNECT_TIMEOUT_MS),
          ),
        ])
      } else {
        await connectPromise
      }
    } catch (error) {
      if (connectAttemptRef.current !== attemptId) {
        return
      }
      if (isNative) {
        bleRef.current.disconnect()
      }
      setBleUi((prev) => ({
        ...prev,
        lastError: `${t('ble.connectFailedSimple')} ${toLocalizedErrorMessage(t, error instanceof Error ? error.message : String(error))}`,
      }))
      if (isNative) {
        setConnectOverlayState('error')
        window.setTimeout(() => setConnectOverlayState('hidden'), 1200)
      }
    } finally {
      if (connectAttemptRef.current === attemptId) {
        setBleUi((prev) => ({ ...prev, connecting: false }))
      }
    }
  }

  function handleConnectModalCancel() {
    connectAttemptRef.current = Date.now()
    bleRef.current.disconnect()
    setBleUi((prev) => ({ ...prev, connecting: false }))
    setConnectOverlayState('hidden')
  }

  function handleDisconnect() {
    setConnectOverlayState('hidden')
    setConnectNotice(null)
    setBleUi((prev) => ({
      ...prev,
      disconnecting: true,
      isBeyAttached: false,
      bbpTotalShots: null,
      lastError: null,
    }))
    try {
      bleRef.current.disconnect()
    } finally {
      setBleUi((prev) => ({
        ...prev,
        connected: false,
        disconnecting: false,
        isBeyAttached: false,
        bbpTotalShots: null,
        lastError: null,
      }))
    }
  }

  async function handleResetAll() {
    const ok = window.confirm(t('history.confirmReset'))
    if (!ok) {
      return
    }
    await clearShots()
    setPersistedShots([])
    setViewState(storeRef.current.hydrateHistory([]))
    userSelectedBandRef.current = false
    setSelectedBandId(BAND_DEFS[0].id)
  }

  function handleResetBest() {
    setBestSp(0)
    window.localStorage.setItem(BEST_SP_KEY, '0')
  }

  function handleToggleProMode() {
    if (!isPro) {
      setProForDev(true)
      setDisplayMode('pro')
      setDesktopView('detail')
      setModeNotice(t('pro.enabledNotice'))
      return
    }
    setDisplayMode((prev) => {
      const next = prev === 'pro' ? 'free' : 'pro'
      setDesktopView(next === 'pro' ? 'detail' : 'meter')
      setModeNotice(next === 'pro' ? t('pro.proViewEnabledNotice') : t('pro.freeViewEnabledNotice'))
      return next
    })
  }

  function handleDesktopSwitch(target: 'meter' | 'detail' | 'raw') {
    if (target === 'meter') {
      setDesktopView('meter')
      setDesktopProOverlay(null)
      return
    }
    if (!isProView) {
      setDesktopProOverlay(target)
      return
    }
    setDesktopView(target)
  }

  function handleDesktopUnlock() {
    const target = desktopProOverlay
    setDesktopProOverlay(null)
    if (!target) return
    if (!isPro) {
      setProForDev(true)
      setDisplayMode('pro')
      setModeNotice(t('pro.enabledNotice'))
    } else {
      setDisplayMode('pro')
      setModeNotice(t('pro.proViewEnabledNotice'))
    }
    setDesktopView(target === 'raw' ? 'raw' : 'detail')
  }

  function handleDesktopProCancel() {
    setDesktopProOverlay(null)
    setDesktopView('meter')
  }

  function moveToMobilePage(page: number) {
    const safePage = Math.max(0, Math.min(2, page))
    const node = mobilePagerRef.current
    if (!node) return
    const width = node.clientWidth || window.innerWidth
    node.scrollTo({ left: safePage * width, behavior: 'smooth' })
    setActiveMobilePage(safePage)
  }

  useEffect(() => {
    if (!showBestUpdated) return
    const timer = window.setTimeout(() => setShowBestUpdated(false), 2000)
    return () => window.clearTimeout(timer)
  }, [showBestUpdated])

  const isProView = isPro && displayMode === 'pro'

  const headerNode = (
    <Header
      bleConnected={bleUi.connected}
      connecting={bleUi.connecting}
      disconnecting={bleUi.disconnecting}
      beyAttached={isBayAttached}
      lastError={bleUi.lastError}
      launcherType={launcherType}
      launcherOptions={launcherOptions}
      isPro={isPro}
      displayMode={displayMode}
      onLauncherTypeChange={setLauncherType}
      onConnect={() => void handleConnect()}
      onDisconnect={handleDisconnect}
      onTogglePro={handleToggleProMode}
      modeNotice={!isMobileLayout ? modeNotice : null}
      connectNotice={!isMobileLayout ? connectNotice : null}
    />
  )

  const latestMeterSp = latest?.maxSp ?? 0
  const meterViewNode = (
    <section className="section-shell meter-shell">
      <div className="section-head-row">
        <SectionHeader
          en={t('meter.en')}
          title={t('meter.title')}
          description={t('meter.description')}
        />
      </div>
      <NeonPanel className="meter-main-panel">
        {showBestUpdated ? <div className="best-badge">{t('meter.maxUpdated')}</div> : null}
        <div className="meter-gauge-wrap">
          <MeterGauge
            value={latestMeterSp}
            best={bestSp}
            maxRpm={METER_MAX_RPM}
            bestLabel={t('meter.deviceBest')}
          />
        </div>
        <div className="meter-actions">
          <button type="button" className="mini-btn subtle" onClick={handleResetBest}>
            {t('meter.resetBest')}
          </button>
          <button type="button" className="mini-btn subtle" onClick={() => void handleResetAll()}>
            {t('meter.resetAll')}
          </button>
        </div>
      </NeonPanel>
    </section>
  )

  const recentNode = (
    <section className="section-shell recent-shell">
      <div className="section-head-row recent-head-row">
        <SectionHeader
          en={t('recent.en')}
          title={t('recent.title')}
          description={t('recent.description')}
        />
      </div>
      <div className="current-section">
        <NeonPanel className="current-left">
          <article className="main-card">
            <h2>{t('recent.recordSp')}</h2>
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
            <div className="recent-analysis-block">
              <div className="recent-analysis-group-title">{t('recent.shotPowerAnalysisTitle')}</div>
              <div className="recent-analysis-row">
                <span>{t('recent.peakShotPower')}</span>
                <strong>
                  {latest && latestSpPeakValue !== null
                    ? `${latestPeakTimeMs} ms, ${latestSpPeakValue} rpm`
                    : t('common.none')}
                </strong>
              </div>
              <div className="recent-analysis-row">
                <span>{t('recent.aucToPeak')}</span>
                <strong>
                  {latestFeatures
                    ? Number((latestFeatures.auc_0_peak ?? 0).toFixed(2))
                    : t('common.none')}
                </strong>
              </div>
              <div className="recent-analysis-row">
                <span>{t('recent.effectiveLength')}</span>
                <strong>
                  {latestEfficiency
                    ? `${latestEfficiency.effLengthCm.toFixed(1)}cm / ${latestEfficiency.lengthCm.toFixed(1)}cm (${latestEfficiency.effPercent.toFixed(0)}%)`
                    : t('common.none')}
                </strong>
              </div>
              <div className="recent-analysis-group-title">{t('recent.torqueAnalysisTitle')}</div>
              <div className="recent-analysis-row">
                <span>{t('recent.peakInputTorque')}</span>
                <strong>
                  {latestTorquePeakTimeMs !== null
                    ? `${latestTorquePeakTimeMs} ms, ${latestMaxTorqueText}`
                    : t('common.none')}
                </strong>
              </div>
              <div className="recent-analysis-row">
                <span>{t('recent.torquePeakPosition')}</span>
                <strong>
                  {latestTorquePeakTimeMs !== null && latestPeakTimeMs > 0
                    ? `${Number(((latestTorquePeakTimeMs / latestPeakTimeMs) * 100).toFixed(1))}%`
                    : t('common.none')}
                </strong>
              </div>
              <div className="recent-analysis-row emphasize">
                <span>{t('recent.shootTypeResult')}</span>
                <strong>{latest ? t(`shootType3.${latestShootType3}`) : t('common.none')}</strong>
              </div>
            </div>
          </article>
        </NeonPanel>

        <NeonPanel className="current-right">
          <div className="chart-head-row">
            <h3>{t('recent.waveformTitle')}</h3>
            <div className="shot-meta">
              <span>{t('recent.peakShotPower')}: {latest ? `${latestPeakTimeMs} ms / ${latest.maxSp} rpm` : t('common.none')}</span>
              <span>{t('recent.peakInputTorque')}: {latestTorquePeakTimeMs !== null ? `${latestTorquePeakTimeMs} ms / ${latestMaxTorqueText}` : t('common.none')}</span>
            </div>
          </div>
          <ProfileChart
            profile={latestProfile}
            peakIndex={peakIndex}
            secondaryProfile={latestTorqueProfile}
            secondaryPeakIndex={latestTorquePeakIndex}
            timeMode="start"
            primaryYLabel={t('labels.shotPowerRpm')}
            secondaryYLabel={t('labels.inputTorque')}
            fixedXMaxMs={RECENT_X_MAX_MS}
            fixedPrimaryYMax={RECENT_Y_MAX_SP}
            fixedXTicks={[0, 100, 200, 300, 400]}
            fixedPrimaryYTicks={[0, 3000, 6000, 9000, 12000]}
          />
        </NeonPanel>
      </div>
    </section>
  )

  const historyNode = (
    <section className="section-shell history-shell">
      <div className="section-head-row">
        <SectionHeader
          en={t('history.en')}
          title={t('history.title')}
          description={t('history.description')}
        />
        <div className="section-head-actions section-head-actions-pro">
          <button className="mini-btn subtle history-reset-btn" onClick={() => void handleResetAll()} type="button">
            {t('history.reset')}
          </button>
        </div>
      </div>
      <div className="history-section">
        <NeonPanel className="history-left">
          <div className="panel-head">
            <h3>{t('history.bandTitle')}</h3>
          </div>
          <ul className="band-list compact">
            {BAND_DEFS.map((band) => {
              const stat = bandStats[band.id]
              const active = selectedBandId === band.id
              const count = stat?.count ?? 0
              const ratio = Math.round((count / maxBandCount) * 100)
              return (
                <li key={band.id}>
                  <button
                    className={`band-item ${active ? 'active' : ''}`}
                    onClick={() => {
                      userSelectedBandRef.current = true
                      setSelectedBandId(band.id)
                    }}
                    type="button"
                  >
                    <span className="band-bar" style={{ width: `${ratio}%` }} />
                    <span className="band-main">
                      {band.label}
                      <span className="inline-unit"> rpm</span>
                    </span>
                    <span className="band-count-wrap">
                      <span className="band-count">{count}{t('history.countUnit')}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="history-summary-row history-summary-left">
            {t('history.summary', {
              total: historySummary.total,
              avg: historySummary.avg,
              max: historySummary.max,
              stddev: historySummary.stddev
            })}
          </div>
        </NeonPanel>

        <NeonPanel className="history-right">
          <div className="chart-head-row">
            <h3>
              {t('history.waveformBand', { bandId: selectedBandId })}
              <span className="inline-unit"> rpm</span>
            </h3>
            <div className="shot-meta">
              <span>{t('history.peakShotPowerAvg')}: {selectedBandSpMeta ? `${selectedBandSpMeta.peakTimeMs} ms / ${Math.round(selectedBandSpMeta.maxValue)} rpm` : t('common.none')}</span>
              <span>{t('history.peakInputTorqueAvg')}: {selectedBandTauMeta ? `${selectedBandTauMeta.peakTimeMs} ms / ${selectedBandTauMeta.maxValue} rpm/ms` : t('common.none')}</span>
            </div>
          </div>
          <BandChart
            shots={selectedBandShots}
            mode="overlay"
            rangeStart={0}
            rangeEnd={RECENT_X_MAX_MS}
            fixedSpYMin={0}
            fixedSpYMax={RECENT_Y_MAX_SP}
            fixedXTicks={[0, 100, 200, 300, 400]}
            fixedSpYTicks={[0, 3000, 6000, 9000, 12000]}
            xLabel={t('labels.timeMs')}
            spYLabel={t('labels.shotPowerRpm')}
            torqueYLabel={t('labels.inputTorque')}
            maxOverlay={20}
          />

          <div className="stats-two-col">
            <div className="stats-col">
              <h4>{t('history.statsTitle')}</h4>
              <div className="stat-row">
                <span>{t('history.total')}:</span>
                <strong className="stat-value">
                  {selectedBandShots.length}<span className="stat-unit">{t('labels.shots')}</span>
                </strong>
              </div>
              <div>
                ・{t('launcher.string')}: {selectedBandEfficiencyByLauncher.string.count}{t('labels.shots')}
                {selectedBandEfficiencyByLauncher.string.meanLengthCm !== null
                  ? ` / ${selectedBandEfficiencyByLauncher.string.meanLengthCm.toFixed(1)}cm/${selectedBandEfficiencyByLauncher.string.totalLengthCm.toFixed(1)}cm (${selectedBandEfficiencyByLauncher.string.meanPercent?.toFixed(0)}%${selectedBandEfficiencyByLauncher.string.sdPercent !== null ? `, SD ${selectedBandEfficiencyByLauncher.string.sdPercent.toFixed(0)}%` : ''})`
                  : ''}
              </div>
              <div>
                ・{t('launcher.winder')}: {selectedBandEfficiencyByLauncher.winder.count}{t('labels.shots')}
                {selectedBandEfficiencyByLauncher.winder.meanLengthCm !== null
                  ? ` / ${selectedBandEfficiencyByLauncher.winder.meanLengthCm.toFixed(1)}cm/${selectedBandEfficiencyByLauncher.winder.totalLengthCm.toFixed(1)}cm (${selectedBandEfficiencyByLauncher.winder.meanPercent?.toFixed(0)}%${selectedBandEfficiencyByLauncher.winder.sdPercent !== null ? `, SD ${selectedBandEfficiencyByLauncher.winder.sdPercent.toFixed(0)}%` : ''})`
                  : ''}
              </div>
              <div>
                ・{t('launcher.longWinder')}: {selectedBandEfficiencyByLauncher.longWinder.count}{t('labels.shots')}
                {selectedBandEfficiencyByLauncher.longWinder.meanLengthCm !== null
                  ? ` / ${selectedBandEfficiencyByLauncher.longWinder.meanLengthCm.toFixed(1)}cm/${selectedBandEfficiencyByLauncher.longWinder.totalLengthCm.toFixed(1)}cm (${selectedBandEfficiencyByLauncher.longWinder.meanPercent?.toFixed(0)}%${selectedBandEfficiencyByLauncher.longWinder.sdPercent !== null ? `, SD ${selectedBandEfficiencyByLauncher.longWinder.sdPercent.toFixed(0)}%` : ''})`
                  : ''}
              </div>
              <div className="stat-row">
                <span>{t('history.avg')}:</span>
                <strong className="stat-value">
                  {selectedBandStat && hasSelectedBandData
                    ? <>{selectedBandStat.mean}<span className="stat-unit">{t('labels.rpm')}</span></>
                    : t('common.none')}
                </strong>
              </div>
              <div className="stat-row">
                <span>{t('history.max')}:</span>
                <strong className="stat-value">
                  {selectedBandStat && hasSelectedBandData
                    ? <>{selectedBandStat.max}<span className="stat-unit">{t('labels.rpm')}</span></>
                    : t('common.none')}
                </strong>
              </div>
              <div className="stat-row">
                <span>{t('history.stddev')}:</span>
                <strong className="stat-value">
                  {selectedBandStat && hasSelectedBandData ? selectedBandStat.stddev : t('common.none')}
                </strong>
              </div>
            </div>

            <div className="stats-col detail">
              <h4>{t('history.detailTitle')}</h4>
              <div className="detail-grid">
                <div className="detail-col">
                  <h5>{t('history.shotPowerAnalysisTitle')}</h5>
                  <div className="compact-metric">
                    <span>{t('history.peakShotPowerAvg')}</span>
                    <strong>{selectedBandSpMeta ? `${selectedBandSpMeta.peakTimeMs} ms, ${Math.round(selectedBandSpMeta.maxValue)} rpm` : t('common.none')}</strong>
                  </div>
                  <div className="compact-metric">
                    <span>{t('history.aucToPeakAvg')}</span>
                    <strong>{selectedBandAucToPeakMean !== null ? selectedBandAucToPeakMean : t('common.none')}</strong>
                  </div>
                  <div className="compact-metric">
                    <span>{t('history.effectiveLengthAvg')}</span>
                    <strong>
                      {selectedBandEffectiveLengthSummary
                        ? `${selectedBandEffectiveLengthSummary.effLengthCm.toFixed(1)}cm / ${selectedBandEffectiveLengthSummary.lengthCm.toFixed(1)}cm (${selectedBandEffectiveLengthSummary.effPercent.toFixed(0)}%)`
                        : t('common.none')}
                    </strong>
                  </div>
                  <p className="detail-help">{t('history.effectiveLengthHint')}</p>
                </div>

                <div className="detail-col">
                  <h5>{t('history.torqueAnalysisTitle')}</h5>
                  <div className="compact-metric">
                    <span>{t('history.peakInputTorqueAvg')}</span>
                    <strong>{selectedBandTauMeta ? `${selectedBandTauMeta.peakTimeMs} ms, ${selectedBandTauMeta.maxValue} rpm/ms` : t('common.none')}</strong>
                  </div>
                  <div className="compact-metric">
                    <span>{t('history.torquePeakPositionAvg')}</span>
                    <strong>{selectedBandTorquePeakPosition !== null ? `${selectedBandTorquePeakPosition}%` : t('common.none')}</strong>
                  </div>
                  <p className="detail-help">{t('history.torquePeakPositionHint')}</p>
                  <div className="compact-metric emphasize">
                    <span>{t('recent.shootTypeResult')}</span>
                    <strong>{selectedBandShots.length > 0 ? selectedBandShootType3 : t('common.none')}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </NeonPanel>
      </div>
    </section>
  )

  const rawViewNode = (
    <section className="section-shell history-shell">
      <div className="history-section rawlog-history-shell">
        <NeonPanel className="history-right rawlog-history-panel">
          <RawLogPanel packets={rawPackets} onClear={clearRawPackets} />
        </NeonPanel>
      </div>
    </section>
  )

  const desktopContent =
    desktopView === 'detail'
      ? (
          <>
            {recentNode}
            {historyNode}
          </>
        )
      : desktopView === 'raw'
        ? rawViewNode
        : (
            <>
              {meterViewNode}
            </>
          )

  const desktopMainClass = `layout app-mobile app-compact neon-theme${!isMobileLayout && !isProView ? ' simple-desktop' : ''}`
  const desktopTabHeaderMeta =
    desktopView === 'meter'
      ? {
          en: t('meter.en'),
          title: t('meter.title'),
          description: t('meter.description'),
        }
      : desktopView === 'detail'
        ? {
            en: t('recent.en'),
            title: t('nav.detail'),
            description: t('recent.description'),
          }
        : {
            en: t('rawlog.en'),
            title: t('rawlog.title'),
            description: t('rawlog.description'),
          }

  if (isMobileLayout) {
    const actionLabel = bleUi.connecting
      ? t('common.connecting')
      : bleUi.disconnecting
        ? t('common.disconnecting')
        : bleUi.connected
          ? t('common.disconnect')
          : t('common.connect')
    const connectionLabel = bleUi.connecting
      ? t('ble.connecting')
      : bleUi.disconnecting
        ? t('ble.disconnecting')
        : bleUi.connected
          ? t('ble.connected')
          : t('ble.disconnected')
    const attachLabel = bleUi.connected ? (isBayAttached ? t('ble.attachOn') : t('ble.attachOff')) : t('ble.attachUnknown')
    const mobileModeActionLabel = isProView ? t('pro.switchToFreeView') : t('pro.switchToProView')

    return (
      <main className="layout app-mobile app-compact neon-theme mobile-shell">
        <header className="mobile-titlebar">
          <div className="mobile-title-main">
            <h1 className="mobile-title">{isProView ? t('app.titlePro') : t('app.titleSimple')}</h1>
            <a className="app-credit" href="https://x.com/bahamutonX" target="_blank" rel="noreferrer">
              by @bahamutonX
            </a>
            <button type="button" className="mini-btn subtle pro-switch-btn-mobile" onClick={handleToggleProMode}>
              {mobileModeActionLabel}
            </button>
            {modeNotice ? <span className="mode-switch-notice">{modeNotice}</span> : null}
          </div>
          <div className="status-row mobile-status-inline">
            <div className="status-item compact">
              <span className={`status-dot ${bleUi.connected || bleUi.connecting ? 'on' : 'off'} ${bleUi.connecting || bleUi.disconnecting ? 'connecting' : 'default'}`} />
              <span>{connectionLabel}</span>
            </div>
            <div className="status-item compact">
              <span className={`status-dot ${isBayAttached ? 'on' : 'off'} default`} />
              <span>{attachLabel}</span>
            </div>
            {bleUi.connected ? <div className="status-ready">{t('ble.readyToShoot')}</div> : null}
          </div>
        </header>
        <div className="mobile-pager" ref={mobilePagerRef}>
          <section className="mobile-page">
            <section className="section-shell mobile-meter-connect-shell">
              <SectionHeader en={t('settings.en')} title={t('mobile.settingsTitle')} description={t('mobile.settingsDesc')} />
              <NeonPanel className="mobile-settings-panel">
                <div className="mobile-launcher-group">
                  <div className="mobile-launcher-label">{t('launcher.selectPrompt')}</div>
                  <div className="mobile-launcher-buttons">
                    {LAUNCHER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`mobile-launcher-btn ${launcherType === opt.value ? 'active' : ''}`}
                        onClick={() => setLauncherType(opt.value)}
                        aria-pressed={launcherType === opt.value}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mobile-connect-guide">{t('mobile.connectGuide')}</div>
                <div className="mobile-top-actions">
                  <button
                    className="mobile-connect-btn"
                    onClick={bleUi.connected ? handleDisconnect : () => void handleConnect()}
                    type="button"
                    disabled={bleUi.connecting || bleUi.disconnecting}
                  >
                    {actionLabel}
                  </button>
                  {connectNotice ? <span className="mode-switch-notice">{connectNotice}</span> : null}
                </div>
                {bleUi.lastError ? <div className="mobile-error-box">{bleUi.lastError}</div> : null}
              </NeonPanel>
            </section>
            {meterViewNode}
          </section>
          <section className="mobile-page pro-preview-page">
            {recentNode}
            {!isProView ? (
              <div className="pro-overlay">
                <div className="pro-overlay-card">
                  <h4>{t('pro.lockTitle')}</h4>
                  <p>{t('pro.lockDescription')}</p>
                  <div className="desktop-pro-actions">
                    <button type="button" className="mini-btn subtle" onClick={handleToggleProMode}>
                      {t('pro.unlockCta')}
                    </button>
                    <button type="button" className="mini-btn subtle" onClick={() => moveToMobilePage(0)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
          <section className="mobile-page pro-preview-page">
            {historyNode}
            {!isProView ? (
              <div className="pro-overlay">
                <div className="pro-overlay-card">
                  <h4>{t('pro.lockTitle')}</h4>
                  <p>{t('pro.lockDescription')}</p>
                  <div className="desktop-pro-actions">
                    <button type="button" className="mini-btn subtle" onClick={handleToggleProMode}>
                      {t('pro.unlockCta')}
                    </button>
                    <button type="button" className="mini-btn subtle" onClick={() => moveToMobilePage(0)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
        <div className="mobile-page-dots" aria-label="Page indicator">
          {[0, 1, 2].map((page) => (
            <button
              key={page}
              type="button"
              className={`mobile-page-dot ${activeMobilePage === page ? 'active' : ''}`}
              onClick={() => moveToMobilePage(page)}
              aria-label={t('mobile.pageMove', { page: page + 1 })}
            >
              {activeMobilePage === page ? '●' : '○'}
            </button>
          ))}
        </div>
        <div className="mobile-page-hint">{t('mobile.swipeHint')}</div>
        {connectOverlayState !== 'hidden' ? (
          <div className="connect-modal-overlay" role="dialog" aria-modal="true">
            <div className={`connect-modal-card ${connectOverlayState}`}>
              <h4>
                {connectOverlayState === 'connecting'
                  ? t('ble.connecting')
                  : connectOverlayState === 'success'
                    ? t('ble.nativeConnected')
                    : t('ble.connectFailedSimple')}
              </h4>
              <p>
                {connectOverlayState === 'connecting'
                  ? t('ble.nativeHoldToConnect')
                  : t('ble.nativeConnectFailed')}
              </p>
              {connectOverlayState === 'connecting' ? (
                <div className="connect-modal-actions">
                  <button type="button" className="mini-btn subtle" onClick={handleConnectModalCancel}>
                    {t('common.cancel')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    )
  }

  return (
    <main className={desktopMainClass}>
      {headerNode}
      <div className={`desktop-tabbed-shell ${desktopView === 'meter' ? 'meter-view' : ''}`}>
        <div className="desktop-view-switch" role="tablist" aria-label={t('nav.tabsAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={desktopView === 'meter'}
            className={`header-mode-tab ${desktopView === 'meter' ? 'active' : ''}`}
            onClick={() => handleDesktopSwitch('meter')}
          >
            <svg className="tab-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 12l4-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {t('nav.meter')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={desktopView === 'detail'}
            className={`header-mode-tab ${desktopView === 'detail' ? 'active' : ''}`}
            onClick={() => handleDesktopSwitch('detail')}
          >
            <svg className="tab-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {t('nav.detail')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={desktopView === 'raw'}
            className={`header-mode-tab ${desktopView === 'raw' ? 'active' : ''}`}
            onClick={() => handleDesktopSwitch('raw')}
          >
            <svg className="tab-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 8h5l4 8h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6.5" cy="8" r="1.3" fill="currentColor" />
              <circle cx="17.5" cy="16" r="1.3" fill="currentColor" />
            </svg>
            {t('pro.rawLogMode')}
          </button>
        </div>
        <NeonPanel className="desktop-content-shell">
          <div className="desktop-tab-header">
            <SectionHeader
              en={desktopTabHeaderMeta.en}
              title={desktopTabHeaderMeta.title}
              description={desktopTabHeaderMeta.description}
            />
          </div>
          <div className="desktop-content-body">
            {desktopContent}
          </div>
        </NeonPanel>
      </div>
      {desktopProOverlay ? (
        <div className="pro-overlay desktop-pro-overlay">
          <div className="pro-overlay-card">
            <h4>{t('pro.lockTitle')}</h4>
            <p>{t('pro.lockDescription')}</p>
            <ul className="pro-lock-list">
              <li>{t('pro.lockFeatureAnalysis')}</li>
              <li>{t('pro.lockFeatureHistory')}</li>
              <li>{t('pro.lockFeatureRaw')}</li>
            </ul>
            <div className="desktop-pro-actions">
              <button type="button" className="mini-btn subtle" onClick={handleDesktopUnlock}>
                {t('pro.unlockCta')}
              </button>
              <button type="button" className="mini-btn subtle" onClick={handleDesktopProCancel}>
                {t('pro.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {connectOverlayState !== 'hidden' ? (
        <div className="connect-modal-overlay" role="dialog" aria-modal="true">
          <div className={`connect-modal-card ${connectOverlayState}`}>
            <h4>
              {connectOverlayState === 'connecting'
                ? t('ble.connecting')
                : connectOverlayState === 'success'
                  ? t('ble.nativeConnected')
                  : t('ble.connectFailedSimple')}
            </h4>
            <p>
              {connectOverlayState === 'connecting'
                ? t('ble.nativeHoldToConnect')
                : t('ble.nativeConnectFailed')}
            </p>
            {connectOverlayState === 'connecting' ? (
              <div className="connect-modal-actions">
                <button type="button" className="mini-btn subtle" onClick={handleConnectModalCancel}>
                  {t('common.cancel')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}
