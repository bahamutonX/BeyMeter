import { BleService } from './BleService'

const singleton = new BleService()

export function getBleService(): BleService {
  return singleton
}
