export type LauncherType = 'string' | 'winder' | 'longWinder'

export const LAUNCHER_OPTIONS: Array<{ value: LauncherType; labelKey: string }> = [
  { value: 'string', labelKey: 'launcher.string' },
  { value: 'winder', labelKey: 'launcher.winder' },
  { value: 'longWinder', labelKey: 'launcher.longWinder' },
]
