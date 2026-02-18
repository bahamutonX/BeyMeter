import type { ShotProfile } from '../ble/bbpTypes'

export interface CandidateSettings {
  timeTrimMs: number
  nRefsMin: number
}

export interface ScoreCandidates {
  rawPeak: number
  trimPeakByTime40: number
  trimPeakByTime60: number
  trimPeakByTime80: number
  trimPeakByTime100: number
  trimPeakByNrefs1000: number
  ma3Peak: number
  peakNeighborhood: number
  top3MeanTrim: number
}

export interface ThresholdFit {
  tMsThreshold: number
  nRefsMin: number
  score: number | null
  errorAbs: number | null
}

export interface ThresholdExploreResult {
  best: ThresholdFit | null
  ties: ThresholdFit[]
  isExactMatch: boolean
  all: ThresholdFit[]
}

export const T_MS_THRESHOLD_CANDIDATES = [0, 40, 60, 80, 100, 120]
export const NREFS_MIN_CANDIDATES = [0, 500, 800, 1000, 1200, 1500]

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

function maxByTime(sp: number[], tMs: number[], threshold: number): number {
  const values = sp.filter((_, i) => tMs[i] >= threshold)
  return values.length > 0 ? Math.max(...values) : 0
}

export function computeScoreCandidates(
  profile: ShotProfile | null,
  settings: CandidateSettings,
): ScoreCandidates {
  if (!profile || profile.sp.length === 0) {
    return {
      rawPeak: 0,
      trimPeakByTime40: 0,
      trimPeakByTime60: 0,
      trimPeakByTime80: 0,
      trimPeakByTime100: 0,
      trimPeakByNrefs1000: 0,
      ma3Peak: 0,
      peakNeighborhood: 0,
      top3MeanTrim: 0,
    }
  }

  const { sp, tMs, nRefs } = profile
  const rawPeak = Math.max(...sp)

  const trimPeakByTime40 = maxByTime(sp, tMs, 40)
  const trimPeakByTime60 = maxByTime(sp, tMs, 60)
  const trimByTime = sp.filter((_, i) => tMs[i] >= 80)
  const trimPeakByTime80 = trimByTime.length > 0 ? Math.max(...trimByTime) : 0
  const trimPeakByTime100 = maxByTime(sp, tMs, 100)

  const trimByNRefs = sp.filter((_, i) => nRefs[i] >= settings.nRefsMin)
  const trimPeakByNrefs1000 = trimByNRefs.length > 0 ? Math.max(...trimByNRefs) : 0

  let ma3Peak = 0
  for (let i = 0; i < sp.length; i += 1) {
    const start = Math.max(0, i - 1)
    const end = Math.min(sp.length - 1, i + 1)
    ma3Peak = Math.max(ma3Peak, mean(sp.slice(start, end + 1)))
  }

  const peakIdx = sp.findIndex((v) => v === rawPeak)
  const around = sp.filter((_, i) => i >= peakIdx - 1 && i <= peakIdx + 1)
  const peakNeighborhood = mean(around)

  const trimmed = sp
    .filter((_, i) => tMs[i] >= settings.timeTrimMs && nRefs[i] >= settings.nRefsMin)
    .sort((a, b) => b - a)
    .slice(0, 3)
  const top3MeanTrim = mean(trimmed)

  return {
    rawPeak,
    trimPeakByTime40,
    trimPeakByTime60,
    trimPeakByTime80,
    trimPeakByTime100,
    trimPeakByNrefs1000,
    ma3Peak,
    peakNeighborhood,
    top3MeanTrim,
  }
}

export function exploreThresholds(
  profile: ShotProfile | null,
  yourSp: number,
): ThresholdExploreResult {
  const all: ThresholdFit[] = []

  if (!profile || profile.sp.length === 0) {
    return { best: null, ties: [], isExactMatch: false, all }
  }

  const { sp, tMs, nRefs } = profile
  let minError = Number.POSITIVE_INFINITY

  for (const tMsThreshold of T_MS_THRESHOLD_CANDIDATES) {
    for (const nRefsMin of NREFS_MIN_CANDIDATES) {
      const filtered = sp.filter((_, i) => tMs[i] >= tMsThreshold && nRefs[i] >= nRefsMin)
      const score = filtered.length > 0 ? Math.max(...filtered) : null
      const errorAbs = score === null ? null : Math.abs(score - yourSp)
      const fit: ThresholdFit = { tMsThreshold, nRefsMin, score, errorAbs }
      all.push(fit)
      if (errorAbs !== null && errorAbs < minError) {
        minError = errorAbs
      }
    }
  }

  if (!Number.isFinite(minError)) {
    return { best: null, ties: [], isExactMatch: false, all }
  }

  const ties = all.filter((fit) => fit.errorAbs === minError)
  return {
    best: ties[0] ?? null,
    ties,
    isExactMatch: minError === 0,
    all,
  }
}
