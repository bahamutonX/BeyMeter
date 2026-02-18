import type { PersistentShot } from './shotStorage'

export interface BandDef {
  id: string
  label: string
  min: number
  maxExclusive: number | null
}

export interface BandStats {
  band: BandDef
  count: number
  mean: number
  median: number
  max: number
  stddev: number
  featureSummary: Record<
    't_peak' | 't_50' | 'slope_max' | 'auc_0_peak' | 'smoothness' | 'spike_score',
    { mean: number; p50: number }
  >
}

const BAND_MIN = 0
const BAND_STEP = 1000
const BAND_LOW_SPLIT = 4000
const BAND_TOP = 12000

export const BAND_DEFS: BandDef[] = (() => {
  const defs: BandDef[] = [
    {
      id: '0-3999',
      label: '0-3999',
      min: 0,
      maxExclusive: BAND_LOW_SPLIT,
    },
  ]
  for (let start = BAND_LOW_SPLIT; start < BAND_TOP; start += BAND_STEP) {
    defs.push({
      id: `${start}-${start + BAND_STEP - 1}`,
      label: `${start}-${start + BAND_STEP - 1}`,
      min: start,
      maxExclusive: start + BAND_STEP,
    })
  }
  defs.push({
    id: '12000+',
    label: '12000+',
    min: BAND_TOP,
    maxExclusive: null,
  })
  return defs
})()

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  const variance = mean(values.map((v) => (v - m) ** 2))
  return Math.sqrt(variance)
}

export function getBand(score: number): string | null {
  if (score < BAND_MIN) {
    return null
  }
  if (score < BAND_LOW_SPLIT) {
    return '0-3999'
  }
  if (score >= BAND_TOP) {
    return '12000+'
  }
  const start = Math.floor((score - BAND_LOW_SPLIT) / BAND_STEP) * BAND_STEP + BAND_LOW_SPLIT
  return `${start}-${start + BAND_STEP - 1}`
}

export function buildBandStats(
  shots: PersistentShot[],
  scoreSelector: (shot: PersistentShot) => number,
): Record<string, BandStats> {
  const byBand = new Map<string, PersistentShot[]>()
  for (const shot of shots) {
    const bandId = getBand(scoreSelector(shot))
    if (!bandId) continue
    const list = byBand.get(bandId) ?? []
    list.push(shot)
    byBand.set(bandId, list)
  }

  const result: Record<string, BandStats> = {}
  for (const band of BAND_DEFS) {
    const list = byBand.get(band.id) ?? []
    const scores = list.map(scoreSelector)
    const featureKeys: Array<
      't_peak' | 't_50' | 'slope_max' | 'auc_0_peak' | 'smoothness' | 'spike_score'
    > = ['t_peak', 't_50', 'slope_max', 'auc_0_peak', 'smoothness', 'spike_score']

    const featureSummary = featureKeys.reduce(
      (acc, key) => {
        const vals = list
          .map((s) => s.features[key] as number | undefined)
          .filter((v): v is number => Number.isFinite(v))
        acc[key] = {
          mean: Number(mean(vals).toFixed(3)),
          p50: Number(median(vals).toFixed(3)),
        }
        return acc
      },
      {} as BandStats['featureSummary'],
    )

    result[band.id] = {
      band,
      count: list.length,
      mean: Number(mean(scores).toFixed(2)),
      median: Number(median(scores).toFixed(2)),
      max: scores.length > 0 ? Math.max(...scores) : 0,
      stddev: Number(stddev(scores).toFixed(2)),
      featureSummary,
    }
  }
  return result
}
