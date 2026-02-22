import type { BbpPacket } from './bbpTypes'

const MAX_PACKETS = 3000
let packets: BbpPacket[] = []
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((fn) => fn())
}

export function pushRawPacket(packet: BbpPacket): void {
  packets = [packet, ...packets].slice(0, MAX_PACKETS)
  emit()
}

export function clearRawPackets(): void {
  packets = []
  emit()
}

export function getRawPackets(): BbpPacket[] {
  return packets
}

export function subscribeRawPackets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
