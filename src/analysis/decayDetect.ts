import type { ShotProfile } from '../features/ble/bbpTypes'
import { derivativeCentral, smoothMovingAverage } from './signal'

export interface DecaySegment {
  startIndex: number
  endIndex: number
  reason: string
  confidence: number
}

export interface DecayDetectSettings {
  minPoints: number
  allowIncreaseRatio: number
  minOmega: number
  maxJitter: number
}

export const DEFAULT_DECAY_SETTINGS: DecayDetectSettings = {
  minPoints: 6,
  allowIncreaseRatio: 0.01,
  minOmega: 100,
  maxJitter: 0.08,
}

export function detectDecaySegment(
  profile: ShotProfile | null,
  settings: Partial<DecayDetectSettings> = {},
): DecaySegment | null {
  if (!profile || profile.sp.length < 8) {
    return null
  }

  const cfg = { ...DEFAULT_DECAY_SETTINGS, ...settings }
  const w = smoothMovingAverage(profile.sp, 5)
  const t = profile.tMs
  const dw = derivativeCentral(t, w)

  const peak = Math.max(...w)
  const peakIndex = Math.max(0, w.findIndex((x) => x === peak))
  const allowIncreaseAbs = peak * cfg.allowIncreaseRatio

  let best: DecaySegment | null = null

  let i = peakIndex + 1
  while (i < w.length - 1) {
    if (w[i] < cfg.minOmega) {
      i += 1
      continue
    }

    const start = i
    let end = i
    let incCount = 0

    for (let j = i + 1; j < w.length; j += 1) {
      const delta = w[j] - w[j - 1]
      const slope = dw[j]
      if (delta > allowIncreaseAbs) {
        break
      }
      if (delta > 0) {
        incCount += 1
      }
      if (Math.abs(slope) < cfg.maxJitter) {
        break
      }
      if (w[j] < cfg.minOmega) {
        end = j
        break
      }
      end = j
    }

    const length = end - start + 1
    if (length >= cfg.minPoints) {
      const confidence = Math.max(0, 1 - incCount / Math.max(1, length))
      const cand: DecaySegment = {
        startIndex: start,
        endIndex: end,
        reason: 'post-peak monotonic decay',
        confidence: Number(confidence.toFixed(3)),
      }
      if (!best || end - start > best.endIndex - best.startIndex) {
        best = cand
      }
    }

    i = Math.max(i + 1, end + 1)
  }

  return best
}
