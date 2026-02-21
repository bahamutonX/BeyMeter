import { buildTimeGrid, resampleStep } from './resample'

export interface AggregateSeries {
  newTime: number[]
  mean: number[]
  median: number[]
  p25: number[]
  p75: number[]
  nValid: number[]
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

export function aggregateSeries(
  series: Array<{ t: number[]; y: number[] }>,
  start = -600,
  end = 1200,
  step = 10,
): AggregateSeries {
  const newTime = buildTimeGrid(start, end, step)
  const matrix = series.map((s) => resampleStep(s.t, s.y, newTime))

  const mean: number[] = []
  const median: number[] = []
  const p25: number[] = []
  const p75: number[] = []
  const nValid: number[] = []

  for (let i = 0; i < newTime.length; i += 1) {
    const vals = matrix
      .map((row) => row[i])
      .filter((v) => Number.isFinite(v)) as number[]

    nValid.push(vals.length)
    if (vals.length === 0) {
      mean.push(Number.NaN)
      median.push(Number.NaN)
      p25.push(Number.NaN)
      p75.push(Number.NaN)
      continue
    }

    const m = vals.reduce((a, b) => a + b, 0) / vals.length
    mean.push(m)
    median.push(quantile(vals, 0.5))
    p25.push(quantile(vals, 0.25))
    p75.push(quantile(vals, 0.75))
  }

  return { newTime, mean, median, p25, p75, nValid }
}
