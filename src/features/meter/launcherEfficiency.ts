import type { ShotProfile } from '../ble/bbpTypes'
import type { LauncherType } from './shootType'

export interface LauncherSpec {
  maxRev: number
  theoreticalAuc: number
  lengthCm: number
}

export interface LauncherEfficiency {
  launcher: LauncherType
  peakTurn: number
  maxRev: number
  aucPeak: number
  theoreticalAuc: number
  effRatio: number
  effPercent: number
  effLengthCm: number
  lengthCm: number
}

export const LAUNCHER_SPECS: Record<LauncherType, LauncherSpec> = {
  string: {
    maxRev: 11,
    theoreticalAuc: 60000 * 11,
    lengthCm: 50.0,
  },
  winder: {
    maxRev: 8,
    theoreticalAuc: 60000 * 8,
    lengthCm: 20.5,
  },
  longWinder: {
    maxRev: 9,
    theoreticalAuc: 60000 * 9,
    lengthCm: 22.5,
  },
}

function collectValidNRefs(profile: ShotProfile | null): number[] {
  if (!profile || !Array.isArray(profile.nRefs)) return []
  const nRefs: number[] = []
  for (const n of profile.nRefs) {
    if (!Number.isFinite(n) || n <= 0) break
    nRefs.push(n)
  }
  return nRefs
}

export function computeLauncherEfficiency(
  profile: ShotProfile | null,
  launcher: LauncherType,
): LauncherEfficiency | null {
  const nRefs = collectValidNRefs(profile)
  if (nRefs.length === 0) return null

  let peakTurn = 1
  let peakRpm = Number.NEGATIVE_INFINITY
  for (let i = 0; i < nRefs.length; i += 1) {
    const rpm = 7_500_000 / nRefs[i]
    if (rpm > peakRpm) {
      peakRpm = rpm
      peakTurn = i + 1
    }
  }

  const spec = LAUNCHER_SPECS[launcher]
  const aucPeak = 60000 * peakTurn
  const effRatio = spec.theoreticalAuc > 0 ? aucPeak / spec.theoreticalAuc : 0
  return {
    launcher,
    peakTurn,
    maxRev: spec.maxRev,
    aucPeak,
    theoreticalAuc: spec.theoreticalAuc,
    effRatio,
    effPercent: effRatio * 100,
    effLengthCm: spec.lengthCm * effRatio,
    lengthCm: spec.lengthCm,
  }
}

