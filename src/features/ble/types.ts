import type { BbpPacket, ParserStatus, ProtocolError, ShotSnapshot } from './bbpTypes'

export interface BleState {
  connected: boolean
  beyAttached: boolean
}

export interface BleNotifyHandlers {
  onState?: (state: BleState) => void
  onShot?: (snapshot: ShotSnapshot) => void
  onError?: (error: ProtocolError) => void
  onRaw?: (packet: BbpPacket) => void
}

export interface BleServiceClient {
  setHandlers(handlers: BleNotifyHandlers): void
  connect(): Promise<void>
  disconnect(): void
  autoReconnectLoop(intervalMs?: number): void
  stopAutoReconnectLoop(): void
  getParserStatus(): ParserStatus | null
}
