import type { ShotFeatures } from './shotFeatures'

export type LauncherType = 'string' | 'winder' | 'longWinder'

export const LAUNCHER_OPTIONS: Array<{ value: LauncherType; label: string }> = [
  { value: 'string', label: 'ストリングランチャー' },
  { value: 'winder', label: 'ワインダーランチャー' },
  { value: 'longWinder', label: 'ロングワインダー' },
]

export function launcherLabel(type: LauncherType): string {
  return LAUNCHER_OPTIONS.find((x) => x.value === type)?.label ?? type
}

export type ShootType =
  | '引き始め集中型'
  | '尻上がり型'
  | '一定入力型'
  | '波あり型'

export function classifyShootType(features: ShotFeatures | null | undefined): ShootType {
  if (!features) return '波あり型'

  const early = features.early_input_ratio
  const late = features.late_input_ratio
  const stability = features.input_stability

  if (early >= 0.62 && late <= 0.22) {
    return '引き始め集中型'
  }
  if (late >= 0.38) {
    return '尻上がり型'
  }
  if (stability <= 0.5 && early >= 0.35 && early <= 0.62) {
    return '一定入力型'
  }
  return '波あり型'
}
