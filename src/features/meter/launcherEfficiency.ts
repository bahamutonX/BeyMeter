import type { LauncherType } from './shootType'

export interface LauncherSpec {
  maxRev: number
  theoreticalAuc: number
  lengthCm: number
}

export interface LauncherEfficiency {
  launcher: LauncherType
  aucMeasured: number
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

export function computeLauncherEfficiencyFromAuc(
  aucMeasured: number,
  launcher: LauncherType,
): LauncherEfficiency | null {
  if (!Number.isFinite(aucMeasured) || aucMeasured <= 0) return null
  const spec = LAUNCHER_SPECS[launcher]
  const effRatio = spec.theoreticalAuc > 0 ? aucMeasured / spec.theoreticalAuc : 0
  return {
    launcher,
    aucMeasured,
    theoreticalAuc: spec.theoreticalAuc,
    effRatio,
    effPercent: effRatio * 100,
    effLengthCm: spec.lengthCm * effRatio,
    lengthCm: spec.lengthCm,
  }
}
