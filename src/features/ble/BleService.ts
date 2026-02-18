import type { ParserStatus } from './bbpTypes'
import { isCapacitorNativeEnvironment } from './bleEnvironment'
import { NativeBleService } from './NativeBleService'
import { WebBluetoothBleService } from './WebBluetoothBleService'
import type { BleNotifyHandlers, BleServiceClient } from './types'

function createBleServiceClient(): BleServiceClient {
  if (isCapacitorNativeEnvironment()) {
    return new NativeBleService()
  }
  return new WebBluetoothBleService()
}

export class BleService implements BleServiceClient {
  private readonly impl: BleServiceClient

  constructor() {
    this.impl = createBleServiceClient()
  }

  setHandlers(handlers: BleNotifyHandlers): void {
    this.impl.setHandlers(handlers)
  }

  connect(): Promise<void> {
    return this.impl.connect()
  }

  disconnect(): void {
    this.impl.disconnect()
  }

  autoReconnectLoop(intervalMs?: number): void {
    this.impl.autoReconnectLoop(intervalMs)
  }

  stopAutoReconnectLoop(): void {
    this.impl.stopAutoReconnectLoop()
  }

  getParserStatus(): ParserStatus | null {
    return this.impl.getParserStatus()
  }
}

export type { BleNotifyHandlers, BleState } from './types'
