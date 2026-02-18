import type { ShotFeatures } from './shotFeatures'

export type LauncherType = 'string' | 'winder' | 'longWinder'

export const LAUNCHER_OPTIONS: Array<{ value: LauncherType; labelKey: string }> = [
  { value: 'string', labelKey: 'launcher.string' },
  { value: 'winder', labelKey: 'launcher.winder' },
  { value: 'longWinder', labelKey: 'launcher.longWinder' },
]

export type ShootType =
  | 'frontLoaded'
  | 'lateRise'
  | 'constantInput'
  | 'wavy'

export function classifyShootType(features: ShotFeatures | null | undefined): ShootType {
  if (!features) return 'wavy'

  const early = features.early_input_ratio
  const late = features.late_input_ratio
  const stability = features.input_stability

  if (early >= 0.62 && late <= 0.22) {
    return 'frontLoaded'
  }
  if (late >= 0.38) {
    return 'lateRise'
  }
  if (stability <= 0.5 && early >= 0.35 && early <= 0.62) {
    return 'constantInput'
  }
  return 'wavy'
}
