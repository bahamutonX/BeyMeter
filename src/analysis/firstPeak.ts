import type { ShotProfile } from '../features/ble/bbpTypes'
import { smoothMovingAverage } from './signal'

export interface FirstPeakOptions {
  minPeakTimeMs?: number
  minPeakSpAbs?: number
  minPeakRatio?: number
}

const DEFAULT_OPTS: Required<FirstPeakOptions> = {
  minPeakTimeMs: 20,
  minPeakSpAbs: 500,
  minPeakRatio: 0.2,
}

export function findFirstPeakIndex(
  tMs: number[],
  sp: number[],
  options: FirstPeakOptions = {},
): number {
  if (tMs.length === 0 || sp.length === 0) return 0
  if (sp.length < 3) {
    return Math.max(0, sp.findIndex((x) => x === Math.max(...sp)))
  }

  const cfg = { ...DEFAULT_OPTS, ...options }
  const spSmoothed = smoothMovingAverage(sp, 3)
  const globalMax = Math.max(...spSmoothed)
  const peakMinSp = Math.max(cfg.minPeakSpAbs, globalMax * cfg.minPeakRatio)

  for (let i = 1; i < spSmoothed.length - 1; i += 1) {
    const isLocalMax = spSmoothed[i - 1] < spSmoothed[i] && spSmoothed[i] >= spSmoothed[i + 1]
    if (!isLocalMax) continue
    if (spSmoothed[i] < peakMinSp) continue
    if ((tMs[i] ?? 0) < cfg.minPeakTimeMs) continue
    return i
  }

  return Math.max(0, spSmoothed.findIndex((x) => x === globalMax))
}

export function toFirstPeakProfile(profile: ShotProfile | null): ShotProfile | null {
  if (!profile || profile.sp.length === 0) return null
  const peakIndex = findFirstPeakIndex(profile.tMs, profile.sp)
  const end = Math.max(0, Math.min(profile.sp.length - 1, peakIndex))
  return {
    profilePoints: profile.profilePoints.slice(0, end + 1),
    tMs: profile.tMs.slice(0, end + 1),
    sp: profile.sp.slice(0, end + 1),
    nRefs: profile.nRefs.slice(0, end + 1),
  }
}
