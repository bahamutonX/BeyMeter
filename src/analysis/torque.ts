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
  fit: FrictionFitResult | null,
  segment?: DecaySegment | null,
): { torqueSeries: TorqueSeries | null; torqueFeatures: TorqueFeatures | null } {
  if (!profile || !fit || profile.sp.length < 2) {
    return { torqueSeries: null, torqueFeatures: null }
  }

  const t = profile.tMs
  const w = smoothMovingAverage(profile.sp, 5)
  const dw = derivativeCentral(t, w)

  const tau = w.map((omega, i) => dw[i] + fit.alpha * omega + fit.beta * omega * omega)
  const cleanTau = tau.map((v) => (Number.isFinite(v) ? v : 0))

  // Prefer pre-decay positive peak as "input torque" estimate.
  const peakIndex = findFirstPeakIndex(t, w)
  const inputEnd = Math.max(
    0,
    Math.min(
      cleanTau.length - 1,
      segment ? Math.min(peakIndex, Math.max(0, segment.startIndex - 1)) : peakIndex,
    ),
  )
  let maxInputTau = Number.NEGATIVE_INFINITY
  let maxIdx = 0
  for (let i = 0; i <= inputEnd; i += 1) {
    if (cleanTau[i] > maxInputTau) {
      maxInputTau = cleanTau[i]
      maxIdx = i
    }
  }
  if (!Number.isFinite(maxInputTau)) {
    maxInputTau = 0
  }

  let aucTauPos = 0
  for (let i = 1; i < cleanTau.length; i += 1) {
    const dt = t[i] - t[i - 1]
    if (dt <= 0) continue
    const y0 = Math.max(0, cleanTau[i - 1])
    const y1 = Math.max(0, cleanTau[i])
    aucTauPos += ((y0 + y1) * dt) / 2
  }

  const secondDiffs: number[] = []
  for (let i = 1; i < cleanTau.length - 1; i += 1) {
    secondDiffs.push(Math.abs(cleanTau[i + 1] - 2 * cleanTau[i] + cleanTau[i - 1]))
  }
  const tauSmoothness =
    secondDiffs.length > 0
      ? secondDiffs.reduce((a, b) => a + b, 0) / secondDiffs.length
      : 0

  return {
    torqueSeries: {
      tMs: [...t],
      tau: cleanTau,
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
