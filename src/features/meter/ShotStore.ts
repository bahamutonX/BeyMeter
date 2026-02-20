import type { ProtocolError, ShotSnapshot } from '../ble/bbpTypes'
import { PROFILE_HISTORY_LIMIT } from './config'

const MAX_HISTORY = 200
const MAX_RAW_PACKETS = 200
const MAX_BUNDLES = 50

export interface RawPacketLog {
  t: number
  header: number
  len: number
  hex: string
}

export interface ShotBundle {
  id: number
  tStart: number
  tEnd: number
  packets: Record<string, string>
  yourSp?: number
  profile?: ShotSnapshot['profile']
}

export interface MeterViewState {
  latest: ShotSnapshot | null
  history: ShotSnapshot[]
  rawPackets: RawPacketLog[]
  shotBundles: ShotBundle[]
  error: ProtocolError | null
}

export class ShotStore {
  private history: ShotSnapshot[] = []

  private latest: ShotSnapshot | null = null

  private error: ProtocolError | null = null

  private rawPackets: RawPacketLog[] = []

  private shotBundles: ShotBundle[] = []

  private pendingBundle:
    | {
        tStart: number
        packets: Record<string, string>
        dupCounter: Record<string, number>
      }
    | null = null

  private nextBundleId = 1

  addRawPacket(packet: RawPacketLog): MeterViewState {
    this.rawPackets = [packet, ...this.rawPackets].slice(0, MAX_RAW_PACKETS)

    const headerKey = `0x${packet.header.toString(16).toUpperCase().padStart(2, '0')}`
    if (!this.pendingBundle) {
      this.pendingBundle = {
        tStart: packet.t,
        packets: {},
        dupCounter: {},
      }
    }

    const count = (this.pendingBundle.dupCounter[headerKey] ?? 0) + 1
    this.pendingBundle.dupCounter[headerKey] = count
    const key = count === 1 ? headerKey : `${headerKey}_${count}`
    this.pendingBundle.packets[key] = packet.hex

    return this.getState()
  }

  finalizeBundle(tEnd: number, snapshot?: ShotSnapshot): MeterViewState {
    if (!this.pendingBundle) {
      return this.getState()
    }

    const bundle: ShotBundle = {
      id: this.nextBundleId,
      tStart: this.pendingBundle.tStart,
      tEnd,
      packets: this.pendingBundle.packets,
      yourSp: snapshot?.yourSp,
      profile: snapshot?.profile ?? undefined,
    }
    this.nextBundleId += 1
    this.shotBundles = [bundle, ...this.shotBundles].slice(0, MAX_BUNDLES)
    this.pendingBundle = null

    return this.getState()
  }

  push(snapshot: ShotSnapshot): MeterViewState {
    this.latest = snapshot
    this.error = null
    this.history = [snapshot, ...this.history]
      .slice(0, MAX_HISTORY)
      .map((shot, idx) => (idx < PROFILE_HISTORY_LIMIT ? shot : { ...shot, profile: null }))
    return this.getState()
  }

  hydrateHistory(shots: ShotSnapshot[]): MeterViewState {
    this.history = shots.slice(0, MAX_HISTORY)
    this.latest = shots.length > 0 ? shots[0] : null
    return this.getState()
  }

  setError(error: ProtocolError): MeterViewState {
    this.error = error
    return this.getState()
  }

  clearError(): MeterViewState {
    this.error = null
    return this.getState()
  }

  getState(): MeterViewState {
    return {
      latest: this.latest,
      history: this.history,
      rawPackets: this.rawPackets,
      shotBundles: this.shotBundles,
      error: this.error,
    }
  }
}
