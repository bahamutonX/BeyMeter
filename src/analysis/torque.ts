import type { ShotProfile } from '../features/ble/bbpTypes'
import type { FrictionFitResult } from './frictionFit'
import type { DecaySegment } from './decayDetect'
import { findFirstPeakIndex } from './firstPeak'

export interface TorqueSeries {
  tMs: number[]
  tau: number[]
}

export interface TorqueFeatures {
  maxInputTau: number
  maxTau: number
  aucTauPos: number
  tauSmoothness: number
  tauPeakTime: number
}

function toStartRelativeProfile(profile: ShotProfile): { t: number[]; sp: number[] } {
  const n = Math.min(profile.tMs.length, profile.sp.length, profile.nRefs.length)
  if (n === 0) return { t: [], sp: [] }

  const idx0 = profile.profilePoints.findIndex((p) => p.nRefs > 0 && p.sp > 0)
  const start = idx0 >= 0 ? idx0 : 0
  const t0 = profile.tMs[start] ?? profile.tMs[0] ?? 0

  const t: number[] = []
  const sp: number[] = []
  for (let i = start; i < n; i += 1) {
    t.push(Math.max(0, (profile.tMs[i] ?? 0) - t0))
    sp.push(profile.sp[i] ?? 0)
  }
  return { t, sp }
}

export function computeTorque(
  profile: ShotProfile | null,
  _fit: FrictionFitResult | null,
  _segment?: DecaySegment | null,
): { torqueSeries: TorqueSeries | null; torqueFeatures: TorqueFeatures | null } {
  void _fit
  void _segment
  if (!profile || profile.sp.length < 2) {
    return { torqueSeries: null, torqueFeatures: null }
  }

  const { t: tAll, sp: spAll } = toStartRelativeProfile(profile)
  if (tAll.length < 2 || spAll.length < 2) {
    return { torqueSeries: null, torqueFeatures: null }
  }

  // Torque analysis window: from pull start (0ms) to first SP peak.
  const peakIndex = findFirstPeakIndex(tAll, spAll)
  const endIdx = Math.max(1, Math.min(peakIndex, tAll.length - 1))
  const t = tAll.slice(0, endIdx + 1)
  const sp = spAll.slice(0, endIdx + 1)
  if (t.length < 2 || sp.length < 2) {
    return { torqueSeries: null, torqueFeatures: null }
  }

  // Piecewise torque from adjacent SP points:
  // torque_i = (sp_{i+1} - sp_i) / (t_{i+1} - t_i)
  const rawTau: number[] = []
  const segmentStartTimes: number[] = []
  const stepT: number[] = []
  const stepTau: number[] = []
  let invalidDtCount = 0

  for (let i = 0; i < sp.length - 1; i += 1) {
    const t0 = t[i]
    const t1 = t[i + 1]
    const dt = t1 - t0
    if (!Number.isFinite(dt) || dt <= 0) {
      invalidDtCount += 1
      continue
    }
    const tau = (sp[i + 1] - sp[i]) / dt
    rawTau.push(tau)
    segmentStartTimes.push(t0)
    // Step-like series: hold tau_i on [t_i, t_{i+1})
    stepT.push(t0, t1)
    stepTau.push(tau, tau)
  }

  if (rawTau.length === 0 || segmentStartTimes.length === 0 || stepT.length === 0) {
    return { torqueSeries: null, torqueFeatures: null }
  }

  let maxInputTau = Number.NEGATIVE_INFINITY
  let maxIdx = 0
  for (let i = 0; i < rawTau.length; i += 1) {
    if (rawTau[i] > maxInputTau) {
      maxInputTau = rawTau[i]
      maxIdx = i
    }
  }
  if (!Number.isFinite(maxInputTau)) {
    maxInputTau = 0
  }

  let aucTauPos = 0
  for (let i = 0; i < rawTau.length; i += 1) {
    const t0 = t[i]
    const t1 = t[i + 1]
    const dt = t1 - t0
    if (dt <= 0) continue
    aucTauPos += Math.max(0, rawTau[i]) * dt
  }

  const secondDiffs: number[] = []
  for (let i = 1; i < rawTau.length - 1; i += 1) {
    secondDiffs.push(Math.abs(rawTau[i + 1] - 2 * rawTau[i] + rawTau[i - 1]))
  }
  const tauSmoothness =
    secondDiffs.length > 0
      ? secondDiffs.reduce((a, b) => a + b, 0) / secondDiffs.length
      : 0

  if (invalidDtCount > 0) {
    // Keep a lightweight trace when malformed/duplicate timestamps are present.
    console.warn('[torque] invalid dt segments skipped:', invalidDtCount)
  }

  return {
    torqueSeries: {
      tMs: stepT,
      tau: stepTau,
    },
    torqueFeatures: {
      maxInputTau: Number(maxInputTau.toFixed(6)),
      // Keep legacy field for backward compatibility with persisted data.
      maxTau: Number(maxInputTau.toFixed(6)),
      aucTauPos: Number(aucTauPos.toFixed(6)),
      tauSmoothness: Number(tauSmoothness.toFixed(6)),
      tauPeakTime: segmentStartTimes[maxIdx] ?? 0,
    },
  }
}
