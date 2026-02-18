import { Capacitor } from '@capacitor/core'

export function isCapacitorNativeEnvironment(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
