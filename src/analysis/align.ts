import { smoothMovingAverage } from './signal'

export type AlignmentMode = 'start' | 'peak' | 't50' | 'crossing'

export interface PeakRobustOptions {
  minT: number
  useMAWindow: number
}

export interface AlignOptions {
  mode: AlignmentMode
  crossingRatio?: number
  peakOptions?: PeakRobustOptions
}

const DEFAULT_PEAK_OPTS: PeakRobustOptions = {
  minT: 80,
  useMAWindow: 3,
}

function findCrossingTime(t: number[], y: number[], ratio: number): number {
  if (t.length === 0 || y.length === 0) return 0
  const peak = Math.max(...y)
  const th = peak * ratio
  for (let i = 1; i < y.length; i += 1) {
    const y0 = y[i - 1]
    const y1 = y[i]
    if (y0 < th && y1 >= th) {
      const x0 = t[i - 1]
      const x1 = t[i]
      const r = y1 === y0 ? 0 : (th - y0) / (y1 - y0)
      return x0 + (x1 - x0) * r
    }
  }
  return t[0]
}

export function findPeakIndexRobust(
  t: number[],
  y: number[],
  opts: Partial<PeakRobustOptions> = {},
): number {
  const cfg = { ...DEFAULT_PEAK_OPTS, ...opts }
  if (t.length === 0 || y.length === 0) return 0

  const ys = smoothMovingAverage(y, cfg.useMAWindow)
  let bestIdx = 0
  let bestVal = Number.NEGATIVE_INFINITY
  for (let i = 0; i < ys.length; i += 1) {
    if (t[i] < cfg.minT) continue
    if (ys[i] > bestVal) {
      bestVal = ys[i]
      bestIdx = i
    }
  }

  if (bestVal === Number.NEGATIVE_INFINITY) {
    return y.findIndex((v) => v === Math.max(...y))
  }
  return bestIdx
}

export function alignTime(
  t: number[],
  y: number[],
  options: Partial<AlignOptions> = {},
): number[] {
  const mode = options.mode ?? 'peak'
  if (t.length === 0 || y.length === 0) return []

  let anchor = t[0]
  if (mode === 'peak') {
    const idx = findPeakIndexRobust(t, y, options.peakOptions)
    anchor = t[idx] ?? t[0]
  } else if (mode === 't50') {
    anchor = findCrossingTime(t, y, 0.5)
  } else if (mode === 'crossing') {
    anchor = findCrossingTime(t, y, options.crossingRatio ?? 0.7)
  }

  return t.map((x) => x - anchor)
}
