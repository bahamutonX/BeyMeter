import type { ShotProfile } from '../ble/bbpTypes'
import { findFirstPeakIndex } from '../../analysis/firstPeak'

export interface ShotFeatures {
  best_sp: number
  t_release: number
  t_peak: number
  peak_progress: number
  peak_hold_turns: number
  accel_ratio: number
  early_drop_index: number
  smoothness_index: number
  shot_profile_type: string
  first_peak_sp: number
  second_peak_sp: number | null
  second_peak_t: number | null
  peak_type: 'single' | 'double'
  t_50: number
  t_90: number
  slope_max: number
  auc_0_peak: number
  spike_score: number
  smoothness: number
  noise_score: number
  early_input_ratio: number
  late_input_ratio: number
  peak_input_time: number
  input_stability: number
}

export type AccelTrend = 'front' | 'steady' | 'late'
export type DropRisk = 'low' | 'medium' | 'high'

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

function findCrossingTime(
  tMs: number[],
  sp: number[],
  threshold: number,
  endIndex: number,
): number {
  for (let i = 0; i <= endIndex; i += 1) {
    if ((sp[i] ?? 0) >= threshold) {
      if (i === 0) return tMs[0] ?? 0
      const x0 = tMs[i - 1] ?? 0
      const x1 = tMs[i] ?? x0
      const y0 = sp[i - 1] ?? 0
      const y1 = sp[i] ?? y0
      if (x1 === x0 || y1 === y0) return x1
      const ratio = (threshold - y0) / (y1 - y0)
      return x0 + (x1 - x0) * Math.max(0, Math.min(1, ratio))
    }
  }
  return 0
}

function toRelativeTimeMs(tMs: number[], sp: number[], nRefs: number[]): number[] {
  if (tMs.length === 0) return []
  const startIdx = tMs.findIndex((_, i) => (nRefs[i] ?? 0) > 0 && (sp[i] ?? 0) > 0)
  const t0 = startIdx >= 0 ? (tMs[startIdx] ?? tMs[0] ?? 0) : (tMs[0] ?? 0)
  return tMs.map((t) => t - t0)
}

export function getAccelTrend(accelRatio: number): AccelTrend {
  if (!Number.isFinite(accelRatio)) return 'steady'
  if (accelRatio >= 1.25) return 'front'
  if (accelRatio <= 0.8) return 'late'
  return 'steady'
}

export function getDropRisk(earlyDropIndex: number): DropRisk {
  if (!Number.isFinite(earlyDropIndex)) return 'medium'
  if (earlyDropIndex >= 0.3) return 'high'
  if (earlyDropIndex >= 0.16) return 'medium'
  return 'low'
}

function getShotProfileType(accelRatio: number, earlyDropIndex: number): string {
  const trend = getAccelTrend(accelRatio)
  const risk = getDropRisk(earlyDropIndex)
  return `${trend}_${risk}`
}

export function computeShotFeatures(profile: ShotProfile | null): ShotFeatures {
  if (!profile || profile.sp.length === 0) {
    return {
      best_sp: 0,
      t_peak: 0,
      t_release: 0,
      peak_progress: 0,
      peak_hold_turns: 0,
      accel_ratio: 0,
      early_drop_index: 0,
      smoothness_index: 0,
      shot_profile_type: 'steady',
      first_peak_sp: 0,
      second_peak_sp: null,
      second_peak_t: null,
      peak_type: 'single',
      t_50: 0,
      t_90: 0,
      slope_max: 0,
      auc_0_peak: 0,
      spike_score: 0,
      smoothness: 0,
      noise_score: 0,
      early_input_ratio: 0,
      late_input_ratio: 0,
      peak_input_time: 0,
      input_stability: 0,
    }
  }

  const { tMs, sp, nRefs } = profile
  const relTMs = toRelativeTimeMs(tMs, sp, nRefs)
  const firstPeakIndex = findFirstPeakIndex(relTMs, sp)
  const localPeakIndexes: number[] = []
  for (let i = 1; i < sp.length - 1; i += 1) {
    if (i < firstPeakIndex + 1) continue
    const up = sp[i - 1] < sp[i]
    const down = sp[i] >= sp[i + 1]
    if (up && down) {
      localPeakIndexes.push(i)
    }
  }
  const secondPeakIndex = localPeakIndexes.length > 0 ? localPeakIndexes[0] : null
  const firstPeakSp = sp[firstPeakIndex] ?? 0
  const best_sp = firstPeakSp
  const t_peak = relTMs[firstPeakIndex] ?? 0
  const t_release = relTMs[relTMs.length - 1] ?? 0
  const peak_progress = safeDiv(t_peak, t_release)
  const peak = firstPeakSp

  const holdThreshold = peak * 0.98
  let holdStart = firstPeakIndex
  let holdEnd = firstPeakIndex
  for (let i = firstPeakIndex; i >= 0; i -= 1) {
    if ((sp[i] ?? 0) >= holdThreshold) holdStart = i
    else break
  }
  for (let i = firstPeakIndex; i < sp.length; i += 1) {
    if ((sp[i] ?? 0) >= holdThreshold) holdEnd = i
    else break
  }
  const peak_hold_turns = Math.max(1, holdEnd - holdStart + 1)

  const t50Threshold = peak * 0.5
  const t90Threshold = peak * 0.9
  const t_50 = findCrossingTime(relTMs, sp, t50Threshold, firstPeakIndex)
  const t_90 = findCrossingTime(relTMs, sp, t90Threshold, firstPeakIndex)

  let slope_max = 0
  for (let i = 1; i <= firstPeakIndex; i += 1) {
    const ds = sp[i] - sp[i - 1]
    const dt = relTMs[i] - relTMs[i - 1]
    slope_max = Math.max(slope_max, safeDiv(ds, dt))
  }

  let auc_0_peak = 0
  for (let i = 1; i <= firstPeakIndex; i += 1) {
    const x0 = relTMs[i - 1]
    const x1 = relTMs[i]
    if (x0 >= t_peak) {
      break
    }
    const clampedX1 = Math.min(t_peak, x1)
    const width = clampedX1 - x0
    if (width <= 0) {
      continue
    }
    const y0 = sp[i - 1]
    const y1 = sp[i]
    const ratio = safeDiv(clampedX1 - x0, x1 - x0)
    const yClamped = y0 + (y1 - y0) * ratio
    auc_0_peak += ((y0 + yClamped) * width) / 2
  }

  const neighbors = sp.filter(
    (_, i) =>
      i >= Math.max(0, firstPeakIndex - 2) &&
      i <= firstPeakIndex &&
      i !== firstPeakIndex,
  )
  const neighborMean =
    neighbors.length > 0 ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : peak
  const spike_score = safeDiv(peak, neighborMean)

  const secondDiffs: number[] = []
  for (let i = 1; i < Math.max(2, firstPeakIndex) - 1; i += 1) {
    secondDiffs.push(Math.abs(sp[i + 1] - 2 * sp[i] + sp[i - 1]))
  }
  const smoothness =
    secondDiffs.length > 0 ? secondDiffs.reduce((a, b) => a + b, 0) / secondDiffs.length : 0

  let noiseCount = 0
  for (let i = 0; i <= firstPeakIndex; i += 1) {
    const nr = nRefs[i] ?? 0
    if (nr < 200 || nr > 10000 || sp[i] <= 0 || sp[i] > 20000) {
      noiseCount += 1
    }
  }
  const noise_score = safeDiv(noiseCount, firstPeakIndex + 1)

  const accel: number[] = []
  const accelTime: number[] = []
  for (let i = 1; i <= firstPeakIndex; i += 1) {
    const dt = relTMs[i] - relTMs[i - 1]
    if (dt <= 0) continue
    const a = (sp[i] - sp[i - 1]) / dt
    const pos = Math.max(0, a)
    accel.push(pos)
    accelTime.push(relTMs[i])
  }
  const totalInput = accel.reduce((sum, a) => sum + a, 0)
  const earlyWindowMs = 80
  const earlyInput = accel.reduce((sum, a, i) => {
    return accelTime[i] <= earlyWindowMs ? sum + a : sum
  }, 0)
  const lateStartMs = t_peak * 0.67
  const lateInput = accel.reduce((sum, a, i) => {
    return accelTime[i] >= lateStartMs ? sum + a : sum
  }, 0)
  const early_input_ratio = safeDiv(earlyInput, totalInput)
  const late_input_ratio = safeDiv(lateInput, totalInput)
  let peak_input_time = 0
  if (accel.length > 0) {
    let maxA = -Infinity
    let maxIdx = 0
    for (let i = 0; i < accel.length; i += 1) {
      if (accel[i] > maxA) {
        maxA = accel[i]
        maxIdx = i
      }
    }
    peak_input_time = accelTime[maxIdx] ?? 0
  }
  const accelMean = safeDiv(accel.reduce((s, a) => s + a, 0), accel.length)
  const accelStd = accel.length > 0
    ? Math.sqrt(
      accel.reduce((s, a) => s + (a - accelMean) ** 2, 0) / accel.length,
    )
    : 0
  const input_stability = safeDiv(accelStd, accelMean)

  const halfTime = t_release * 0.5
  let firstHalfInput = 0
  let secondHalfInput = 0
  for (let i = 0; i < accel.length; i += 1) {
    if ((accelTime[i] ?? 0) <= halfTime) {
      firstHalfInput += accel[i]
    } else {
      secondHalfInput += accel[i]
    }
  }
  const accel_ratio = safeDiv(firstHalfInput + 1e-9, secondHalfInput + 1e-9)

  const earlyDropWindowMs = Math.min(t_release, t_peak + 80)
  let minAfterPeak = peak
  for (let i = firstPeakIndex; i < sp.length; i += 1) {
    if ((relTMs[i] ?? t_release) > earlyDropWindowMs) break
    minAfterPeak = Math.min(minAfterPeak, sp[i] ?? minAfterPeak)
  }
  const early_drop_index = safeDiv(peak - minAfterPeak, Math.max(1, peak))

  const roughnessNorm = safeDiv(smoothness, Math.max(1, peak / 20))
  const smoothness_index = Math.max(0, Math.min(100, 100 / (1 + roughnessNorm)))

  const shot_profile_type = getShotProfileType(accel_ratio, early_drop_index)

  return {
    best_sp: Number(best_sp.toFixed(2)),
    t_peak,
    t_release: Number(t_release.toFixed(2)),
    peak_progress: Number(peak_progress.toFixed(4)),
    peak_hold_turns,
    accel_ratio: Number(accel_ratio.toFixed(4)),
    early_drop_index: Number(early_drop_index.toFixed(4)),
    smoothness_index: Number(smoothness_index.toFixed(2)),
    shot_profile_type,
    first_peak_sp: Number(firstPeakSp.toFixed(2)),
    second_peak_sp: secondPeakIndex !== null ? Number((sp[secondPeakIndex] ?? 0).toFixed(2)) : null,
    second_peak_t: secondPeakIndex !== null ? Number((relTMs[secondPeakIndex] ?? 0).toFixed(2)) : null,
    peak_type: secondPeakIndex !== null ? 'double' : 'single',
    t_50,
    t_90,
    slope_max: Number(slope_max.toFixed(4)),
    auc_0_peak: Number(auc_0_peak.toFixed(2)),
    spike_score: Number(spike_score.toFixed(4)),
    smoothness: Number(smoothness.toFixed(2)),
    noise_score: Number(noise_score.toFixed(4)),
    early_input_ratio: Number(early_input_ratio.toFixed(4)),
    late_input_ratio: Number(late_input_ratio.toFixed(4)),
    peak_input_time: Number(peak_input_time.toFixed(2)),
    input_stability: Number(input_stability.toFixed(4)),
  }
}
