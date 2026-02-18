import type { ShotSnapshot } from '../ble/bbpTypes'
import { SUSPECT_MAX_TO_YOUR_RATIO, SUSPECT_MIN_PROFILE_POINTS } from './config'

export type SpMetric = 'your' | 'est' | 'max'

export interface MeterStats {
  total: number
  min: number
  max: number
  avg: number
  stddev: number
}

export interface HistogramBin {
  label: string
  count: number
}

export interface ProfileMetrics {
  peakSp: number
  timeToPeakMs: number
  riseSlope: number
  decayRate: number
  smoothness: number
  holdRatio: number
}

function selectValue(shot: ShotSnapshot, metric: SpMetric): number {
  if (metric === 'your') return shot.yourSp
  if (metric === 'max') return shot.maxSp
  return shot.estSp
}

export function computeProfileMetrics(shot: ShotSnapshot | null): ProfileMetrics | null {
  if (!shot?.profile) {
    return null
  }
  const { tMs, sp } = shot.profile
  if (sp.length === 0 || sp.length !== tMs.length) {
    return null
  }

  let peakIndex = 0
  let peakSp = sp[0]
  for (let i = 1; i < sp.length; i += 1) {
    if (sp[i] > peakSp) {
      peakSp = sp[i]
      peakIndex = i
    }
  }

  const timeToPeakMs = tMs[peakIndex]
  const riseSlope = timeToPeakMs > 0 ? peakSp / timeToPeakMs : 0

  const tail = sp.slice(peakIndex + 1)
  const lastIdx = sp.length - 1
  const tailDt = tMs[lastIdx] - tMs[peakIndex]
  const decayRate =
    tail.length > 0 && tailDt > 0 ? (sp[lastIdx] - peakSp) / tailDt : 0

  let smoothness = 0
  for (let i = 1; i < sp.length; i += 1) {
    smoothness += Math.abs(sp[i] - sp[i - 1])
  }

  const holdStart = peakIndex + 2
  const holdEnd = Math.min(peakIndex + 5, sp.length - 1)
  let holdRatio = 0
  if (holdStart <= holdEnd && peakSp > 0) {
    let sum = 0
    let count = 0
    for (let i = holdStart; i <= holdEnd; i += 1) {
      sum += sp[i]
      count += 1
    }
    holdRatio = count > 0 ? sum / count / peakSp : 0
  }

  return {
    peakSp,
    timeToPeakMs,
    riseSlope: Number(riseSlope.toFixed(3)),
    decayRate: Number(decayRate.toFixed(3)),
    smoothness,
    holdRatio: Number(holdRatio.toFixed(3)),
  }
}

export function buildCoachingComment(metrics: ProfileMetrics | null): string {
  if (!metrics) {
    return 'プロファイル不足。数ショット追加して傾向を確認。'
  }

  if (metrics.timeToPeakMs < 120 && metrics.decayRate < -8) {
    return '序盤強いが失速が速い。リリースを滑らかに。'
  }
  if (metrics.smoothness > 2500) {
    return 'ムラが大きい。引きの軌道と手首のブレを意識。'
  }
  if (metrics.holdRatio >= 0.82) {
    return '後半維持が良好。再現性重視で継続。'
  }
  if (metrics.riseSlope < 8) {
    return '立ち上がりが弱め。初動の加速を意識。'
  }
  return '全体は安定。微調整しながら再現性を高める。'
}

export function isSuspectShot(shot: ShotSnapshot | null): boolean {
  if (!shot) {
    return false
  }
  const profileSize = shot.profile?.sp.length ?? 0
  if (profileSize < SUSPECT_MIN_PROFILE_POINTS) {
    return true
  }
  const ratio = shot.yourSp > 0 ? shot.maxSp / shot.yourSp : 0
  return ratio >= SUSPECT_MAX_TO_YOUR_RATIO
}

export function computeStats(history: ShotSnapshot[], metric: SpMetric): MeterStats {
  if (history.length === 0) {
    return { total: 0, min: 0, max: 0, avg: 0, stddev: 0 }
  }

  let min = Number.POSITIVE_INFINITY
  let max = 0
  let sum = 0
  const values: number[] = []

  for (const shot of history) {
    const value = selectValue(shot, metric)
    if (value < min) {
      min = value
    }
    if (value > max) {
      max = value
    }
    sum += value
    values.push(value)
  }

  const avg = sum / history.length
  const variance =
    values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / history.length

  return {
    total: history.length,
    min,
    max,
    avg: Math.round(avg),
    stddev: Number(Math.sqrt(variance).toFixed(2)),
  }
}

export function buildHistogram(
  history: ShotSnapshot[],
  metric: SpMetric,
  binSize = 500,
  maxBins = 12,
): HistogramBin[] {
  if (history.length === 0) {
    return []
  }

  const counts = new Map<number, number>()
  for (const shot of history) {
    const idx = Math.floor(selectValue(shot, metric) / binSize)
    counts.set(idx, (counts.get(idx) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, maxBins)
    .map(([idx, count]) => {
      const start = idx * binSize
      const end = start + binSize - 1
      return {
        label: `${start}-${end}`,
        count,
      }
    })
}
