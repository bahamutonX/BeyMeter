import type { ShotProfile } from '../features/ble/bbpTypes'
import type { FrictionFitResult } from './frictionFit'
import type { DecaySegment } from './decayDetect'
import { findFirstPeakIndex } from './firstPeak'
import { derivativeCentral, smoothMovingAverage } from './signal'

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

export function computeTorque(
  profile: ShotProfile | null,
  _fit: FrictionFitResult | null,
  segment?: DecaySegment | null,
): { torqueSeries: TorqueSeries | null; torqueFeatures: TorqueFeatures | null } {
  if (!profile || profile.sp.length < 2) {
    return { torqueSeries: null, torqueFeatures: null }
  }

  const baseT = profile.tMs
  const baseW = profile.sp
  const peakIndex = findFirstPeakIndex(baseT, baseW)
  const t = baseT.slice(0, peakIndex + 1)
  const w = baseW.slice(0, peakIndex + 1)

  if (t.length < 2 || w.length < 2) {
    return { torqueSeries: null, torqueFeatures: null }
  }

  // Input proxy: derivative of smoothed RPM profile.
  // Keep only positive component for "input torque (relative)" readability.
  const smoothedW = smoothMovingAverage(w, 3)
  const accelRaw = derivativeCentral(t, smoothedW).map((v) => (Number.isFinite(v) ? v : 0))
  const accel = accelRaw.map((v) => Math.max(0, v))

  // Prefer pre-decay positive peak as "max input" estimate.
  const inputEnd = Math.max(
    0,
    Math.min(
      accel.length - 1,
      segment ? Math.min(peakIndex, Math.max(0, segment.startIndex - 1)) : peakIndex,
    ),
  )
  let maxInputTau = Number.NEGATIVE_INFINITY
  let maxIdx = 0
  for (let i = 0; i <= inputEnd; i += 1) {
    if (accel[i] > maxInputTau) {
      maxInputTau = accel[i]
      maxIdx = i
    }
  }
  if (!Number.isFinite(maxInputTau)) {
    maxInputTau = 0
  }

  let aucTauPos = 0
  for (let i = 1; i < accel.length; i += 1) {
    const dt = t[i] - t[i - 1]
    if (dt <= 0) continue
    const y0 = Math.max(0, accel[i - 1])
    const y1 = Math.max(0, accel[i])
    aucTauPos += ((y0 + y1) * dt) / 2
  }

  const secondDiffs: number[] = []
  for (let i = 1; i < accel.length - 1; i += 1) {
    secondDiffs.push(Math.abs(accel[i + 1] - 2 * accel[i] + accel[i - 1]))
  }
  const tauSmoothness =
    secondDiffs.length > 0
      ? secondDiffs.reduce((a, b) => a + b, 0) / secondDiffs.length
      : 0

  return {
    torqueSeries: {
      tMs: [...t],
      tau: accel,
    },
    torqueFeatures: {
      maxInputTau: Number(maxInputTau.toFixed(6)),
      // Keep legacy field for backward compatibility with persisted data.
      maxTau: Number(maxInputTau.toFixed(6)),
      aucTauPos: Number(aucTauPos.toFixed(6)),
      tauSmoothness: Number(tauSmoothness.toFixed(6)),
      tauPeakTime: t[maxIdx] ?? 0,
    },
  }
}
