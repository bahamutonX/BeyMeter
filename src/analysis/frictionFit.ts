import type { ShotProfile } from '../features/ble/bbpTypes'
import type { DecaySegment } from './decayDetect'
import { derivativeCentral, smoothMovingAverage } from './signal'

export interface FrictionFitResult {
  alpha: number
  beta: number
  rmse: number
  r2: number
  nPoints: number
  warnings: string[]
}

export function fitFriction(
  profile: ShotProfile | null,
  segment: DecaySegment | null,
): FrictionFitResult | null {
  if (!profile || !segment) {
    return null
  }

  const wRaw = smoothMovingAverage(profile.sp, 5)
  const dw = derivativeCentral(profile.tMs, wRaw)
  const start = Math.max(0, segment.startIndex)
  const end = Math.min(wRaw.length - 1, segment.endIndex)
  if (end - start + 1 < 4) {
    return null
  }

  let s11 = 0
  let s12 = 0
  let s22 = 0
  let b1 = 0
  let b2 = 0

  const ys: number[] = []
  const x1s: number[] = []
  const x2s: number[] = []

  for (let i = start; i <= end; i += 1) {
    const w = wRaw[i]
    if (!Number.isFinite(w) || w <= 0) {
      continue
    }
    const y = -dw[i]
    if (!Number.isFinite(y)) {
      continue
    }
    const x1 = w
    const x2 = w * w

    s11 += x1 * x1
    s12 += x1 * x2
    s22 += x2 * x2
    b1 += x1 * y
    b2 += x2 * y

    ys.push(y)
    x1s.push(x1)
    x2s.push(x2)
  }

  const n = ys.length
  if (n < 4) {
    return null
  }

  const det = s11 * s22 - s12 * s12
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) {
    return null
  }

  const alpha = (b1 * s22 - b2 * s12) / det
  const beta = (s11 * b2 - s12 * b1) / det

  if (!Number.isFinite(alpha) || !Number.isFinite(beta)) {
    return null
  }

  const preds = ys.map((_, i) => alpha * x1s[i] + beta * x2s[i])
  const residuals = ys.map((y, i) => y - preds[i])
  const rmse = Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / n)

  const yMean = ys.reduce((a, b) => a + b, 0) / n
  const ssRes = residuals.reduce((acc, r) => acc + r * r, 0)
  const ssTot = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  const warnings: string[] = []
  if (alpha < 0) warnings.push('alpha<0')
  if (beta < 0) warnings.push('beta<0')

  return {
    alpha: Number(alpha.toFixed(6)),
    beta: Number(beta.toFixed(9)),
    rmse: Number(rmse.toFixed(6)),
    r2: Number(r2.toFixed(6)),
    nPoints: n,
    warnings,
  }
}
