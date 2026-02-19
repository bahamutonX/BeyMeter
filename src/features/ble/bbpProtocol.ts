import {
  HEADER_ATTACH,
  HEADER_CHECKSUM,
  HEADER_LIST_FIRST,
  HEADER_LIST_LAST,
  HEADER_PROF_FIRST,
  HEADER_PROF_LAST,
  type AnalyzeResult,
  type BbpPacket,
  type ChecksumDebug,
  type ParserStatus,
  type ProtocolError,
  type ShotProfile,
} from './bbpTypes'

const PROFILE_MIN_POINTS = 7
const PROFILE_EARLY_WINDOW = 14
const A0_ATTACHED_VALUES = new Set([0x04, 0x14])

function toProtocolError(
  code: ProtocolError['code'],
  message: string,
  detail?: string,
): ProtocolError {
  return { code, message, detail }
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 1 >= bytes.length) {
    return 0
  }
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ')
}

function isSupportedHeader(header: number): boolean {
  if (header === HEADER_ATTACH) {
    return true
  }
  if (header >= HEADER_LIST_FIRST && header <= HEADER_CHECKSUM) {
    return true
  }
  return header >= HEADER_PROF_FIRST && header <= HEADER_PROF_LAST
}

function computeProfile(bytesByHeader: Map<number, Uint8Array>, bbpSp: number): {
  maxSp: number
  estSp: number
  profile: ShotProfile | null
  size: number
  peakEt: number
  guardReason: 'none' | 'peak_last_use_max' | 'peak_early_fallback' | 'est_gt_your_fallback'
} {
  const profEtMs: number[] = []
  const profSp: number[] = []
  const profNRefs: number[] = []
  const profilePoints: Array<{ tMs: number; sp: number; nRefs: number; dtMs: number }> = []
  let et = 0
  let maxSp = 0

  for (let h = HEADER_PROF_FIRST; h <= HEADER_PROF_LAST; h += 1) {
    const data = bytesByHeader.get(h)
    if (!data) {
      continue
    }
    for (let i = 1; i < data.length; i += 2) {
      const nRefs = readU16LE(data, i)
      if (nRefs === 0) {
        continue
      }
      const dtMs = nRefs / 125
      if (dtMs <= 0) {
        continue
      }
      const sp = Math.floor(7_500_000 / nRefs)
      et += dtMs
      // Keep cumulative time in fractional milliseconds for better peak-time fidelity.
      // UI can round for display, but analysis should retain full precision.
      const tMs = et
      profEtMs.push(tMs)
      profSp.push(sp)
      profNRefs.push(nRefs)
      profilePoints.push({
        tMs,
        sp,
        nRefs,
        dtMs,
      })
      if (sp > maxSp) {
        maxSp = sp
      }
    }
  }

  const profile: ShotProfile | null =
    profSp.length > 0
      ? {
          profilePoints,
          tMs: profEtMs,
          sp: profSp,
          nRefs: profNRefs,
        }
      : null

  if (profSp.length < PROFILE_MIN_POINTS) {
    return { maxSp, estSp: 0, profile, size: profSp.length, peakEt: 0, guardReason: 'none' }
  }

  let trueSp = 0
  let peakEt = 0
  let localMaxSp = 0
  let guardReason: 'none' | 'peak_last_use_max' | 'peak_early_fallback' | 'est_gt_your_fallback' = 'none'
  const length = profSp.length > PROFILE_EARLY_WINDOW ? PROFILE_EARLY_WINDOW : profSp.length
  const maxIndex = length - 1

  for (let i = 4; i < length; i += 1) {
    peakEt = i
    const sp0 = profSp[i]
    const spM1 = profSp[i - 1]

    if (sp0 > localMaxSp) {
      localMaxSp = sp0
    }

    if (spM1 > sp0) {
      let flag = false
      if (i + 2 <= maxIndex) {
        flag = sp0 > profSp[i + 1] && profSp[i + 1] > profSp[i + 2]
      } else if (i + 1 <= maxIndex) {
        flag = sp0 > profSp[i + 1]
      }

      if (flag) {
        const etM2 = profEtMs[i - 2]
        const etM4 = profEtMs[i - 4]
        const spM2 = profSp[i - 2]
        const spM4 = profSp[i - 4]
        const denom = etM2 - etM4
        const slope = denom === 0 ? 0 : (spM2 - spM4) / denom
        const extSp = Math.floor(1.04 * (slope * (profEtMs[i - 1] - etM2) + spM2))
        if (extSp < spM1) {
          trueSp = spM2
          peakEt = i - 2
        } else {
          trueSp = spM1
          peakEt = i - 1
        }
      } else {
        trueSp = spM1
        peakEt = i - 1
      }
      break
    }
  }

  if (peakEt === profSp.length - 1) {
    trueSp = localMaxSp
    guardReason = 'peak_last_use_max'
  } else if (peakEt < 4 || trueSp > bbpSp) {
    guardReason = peakEt < 4 ? 'peak_early_fallback' : 'est_gt_your_fallback'
    trueSp = bbpSp
  }

  return { maxSp, estSp: trueSp, profile, size: profSp.length, peakEt, guardReason }
}

export class BbpProtocol {
  private bytesByHeader = new Map<number, Uint8Array>()

  private expectedLength: number | null = null

  private lastLength: number | null = null

  private analyzeTriggerHeader: number | null = null

  private lastChecksum: ChecksumDebug | null = null

  private latestBeyAttached = false

  parsePacket(value: DataView | Uint8Array): BbpPacket {
    const bytes =
      value instanceof Uint8Array
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    this.lastLength = bytes.length

    if (bytes.length < 2) {
      throw toProtocolError('PACKET_TOO_SHORT', 'packet too short', `length=${bytes.length}`)
    }

    if (this.expectedLength === null) {
      this.expectedLength = bytes.length
    } else if (bytes.length !== this.expectedLength) {
      throw toProtocolError(
        'INVALID_PACKET_LENGTH',
        'packet length mismatch',
        `expected=${this.expectedLength}, actual=${bytes.length}`,
      )
    }

    const header = bytes[0]
    if (!isSupportedHeader(header)) {
      throw toProtocolError('UNSUPPORTED_HEADER', 'unsupported header', `header=0x${header.toString(16)}`)
    }

    return {
      timestamp: Date.now(),
      header,
      bytes,
      length: bytes.length,
      hex: bytesToHex(bytes),
    }
  }

  updateMap(packet: BbpPacket): AnalyzeResult {
    if (packet.header === HEADER_ATTACH) {
      // Observed behavior:
      // A0[3] = 0x04 (and occasionally 0x14) => attached
      // A0[3] = 0x00 => detached
      const attachCode = packet.bytes[3] ?? 0x00
      this.latestBeyAttached = A0_ATTACHED_VALUES.has(attachCode)
      return null
    }

    this.bytesByHeader.set(packet.header, packet.bytes)

    const isTrigger = packet.header === HEADER_CHECKSUM || packet.header === HEADER_PROF_LAST
    if (!isTrigger) {
      return null
    }

    this.analyzeTriggerHeader = packet.header
    if (!this.hasAllRequiredHeaders()) {
      return null
    }

    return this.tryAnalyze()
  }

  getStatus(): ParserStatus {
    return {
      expectedLength: this.expectedLength,
      lastLength: this.lastLength,
      analyzeTriggerHeader: this.analyzeTriggerHeader,
      lastChecksum: this.lastChecksum,
    }
  }

  getBeyAttached(): boolean {
    return this.latestBeyAttached
  }

  clearMap(): void {
    this.bytesByHeader.clear()
  }

  private hasAllRequiredHeaders(): boolean {
    for (let h = HEADER_LIST_FIRST; h <= HEADER_CHECKSUM; h += 1) {
      if (!this.bytesByHeader.has(h)) {
        return false
      }
    }
    for (let h = HEADER_PROF_FIRST; h <= HEADER_PROF_LAST; h += 1) {
      if (!this.bytesByHeader.has(h)) {
        return false
      }
    }
    return true
  }

  private tryAnalyze(): AnalyzeResult {
    const expectedHeaders: number[] = []
    for (let h = HEADER_LIST_FIRST; h <= HEADER_CHECKSUM; h += 1) {
      expectedHeaders.push(h)
    }
    for (let h = HEADER_PROF_FIRST; h <= HEADER_PROF_LAST; h += 1) {
      expectedHeaders.push(h)
    }

    for (const h of expectedHeaders) {
      if (!this.bytesByHeader.has(h)) {
        this.clearMap()
        return {
          kind: 'error',
          error: toProtocolError('MISSING_HEADERS', 'missing list headers before checksum', `missing=0x${h.toString(16)}`),
        }
      }
    }

    const b7 = this.bytesByHeader.get(HEADER_CHECKSUM)
    if (!b7 || b7.length <= 16) {
      this.clearMap()
      return {
        kind: 'error',
        error: toProtocolError('PACKET_TOO_SHORT', 'checksum packet too short', 'offset 16 is required'),
      }
    }

    const checksum = b7[16]
    let sumB0ToB6 = 0
    for (let h = HEADER_LIST_FIRST; h <= HEADER_LIST_LAST; h += 1) {
      const data = this.bytesByHeader.get(h)
      if (!data) {
        this.clearMap()
        return {
          kind: 'error',
          error: toProtocolError('MISSING_HEADERS', 'missing list header during checksum', `missing=0x${h.toString(16)}`),
        }
      }
      for (let i = 1; i < data.length; i += 1) {
        sumB0ToB6 += data[i]
      }
    }

    let sumB0ToB7 = sumB0ToB6
    for (let i = 1; i < b7.length; i += 1) {
      sumB0ToB7 += b7[i]
    }

    this.lastChecksum = {
      checksumByte: checksum,
      sumB0ToB6: sumB0ToB6 & 0xff,
      sumB0ToB7: sumB0ToB7 & 0xff,
      matchB0ToB6: (sumB0ToB6 & 0xff) === checksum,
      matchB0ToB7: (sumB0ToB7 & 0xff) === checksum,
    }

    if ((sumB0ToB6 & 0xff) !== checksum) {
      this.clearMap()
      return {
        kind: 'error',
        error: toProtocolError(
          'CHECKSUM_MISMATCH',
          'checksum mismatch',
          `b0-b6=${sumB0ToB6 & 0xff}, b0-b7=${sumB0ToB7 & 0xff}, checksum=${checksum}`,
        ),
      }
    }

    const b6 = this.bytesByHeader.get(HEADER_LIST_LAST)
    if (!b6 || b6.length <= 11) {
      this.clearMap()
      return {
        kind: 'error',
        error: toProtocolError('PACKET_TOO_SHORT', 'B6 packet too short', 'offset 11 is required'),
      }
    }

    const n = b6[11]
    if (n < 1 || n > 50) {
      this.clearMap()
      return {
        kind: 'error',
        error: toProtocolError('INVALID_SHOT_COUNT', 'invalid shot count', `n=${n}`),
      }
    }

    const listHeader = HEADER_LIST_FIRST + Math.floor((n - 1) / 8)
    const idx = (n - 1) % 8
    const offset = 1 + idx * 2
    const listData = this.bytesByHeader.get(listHeader)
    if (!listData || offset + 1 >= listData.length) {
      this.clearMap()
      return {
        kind: 'error',
        error: toProtocolError('PACKET_TOO_SHORT', 'latest SP offset is out of range'),
      }
    }

    const yourSp = readU16LE(listData, offset)
    const profileResult = computeProfile(this.bytesByHeader, yourSp)

    const estSp = profileResult.size < PROFILE_MIN_POINTS ? yourSp : profileResult.estSp
    let estReason = 'same_as_your'
    if (profileResult.size < PROFILE_MIN_POINTS) {
      estReason = 'profile_short_fallback'
    } else if (profileResult.guardReason === 'peak_early_fallback') {
      estReason = 'peak_early_fallback'
    } else if (profileResult.guardReason === 'est_gt_your_fallback') {
      estReason = 'est_gt_your_fallback'
    } else if (profileResult.guardReason === 'peak_last_use_max') {
      estReason = 'peak_last_use_max'
    } else if (estSp !== yourSp) {
      estReason = 'estimated_from_profile'
    }

    const snapshot = {
      yourSp,
      estSp,
      maxSp: profileResult.maxSp,
      count: n,
      profile: profileResult.profile,
      estReason,
      receivedAt: Date.now(),
    }

    this.clearMap()
    return {
      kind: 'shot',
      snapshot,
    }
  }
}
