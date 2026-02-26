export const BBP_LOCAL_NAME = 'BEYBLADE_TOOL01'
export const BBP_SERVICE_UUID = '55c40000-f8eb-11ec-b939-0242ac120002'
export const BBP_SP_NOTIFY_UUID = '55c4f002-f8eb-11ec-b939-0242ac120002'

export const HEADER_ATTACH = 0xa0
export const HEADER_LIST_FIRST = 0xb0
export const HEADER_LIST_LAST = 0xb6
export const HEADER_CHECKSUM = 0xb7
export const HEADER_PROF_FIRST = 0x70
export const HEADER_PROF_LAST = 0x73

export type BbpHeader = number

export type ProtocolErrorCode =
  | 'UNSUPPORTED_HEADER'
  | 'INVALID_PACKET_LENGTH'
  | 'MISSING_HEADERS'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_SHOT_COUNT'
  | 'PACKET_TOO_SHORT'

export interface ProtocolError {
  code: ProtocolErrorCode
  message: string
  detail?: string
}

export interface BbpPacket {
  timestamp: number
  header: BbpHeader
  bytes: Uint8Array
  length: number
  hex: string
}

export interface ShotProfile {
  profilePoints: Array<{
    tMs: number
    sp: number
    nRefs: number
    dtMs: number
  }>
  tMs: number[]
  sp: number[]
  nRefs: number[]
}

export interface ShotSnapshot {
  yourSp: number
  estSp: number
  maxSp: number
  count: number
  profile: ShotProfile | null
  launchMarkerMs?: number | null
  releaseEventAt?: number | null
  estReason: string
  receivedAt: number
}

export interface ChecksumDebug {
  checksumByte: number
  sumB0ToB6: number
  sumB0ToB7: number
  matchB0ToB6: boolean
  matchB0ToB7: boolean
}

export interface AnalyzeSuccess {
  kind: 'shot'
  snapshot: ShotSnapshot
}

export interface AnalyzeError {
  kind: 'error'
  error: ProtocolError
}

export type AnalyzeResult = AnalyzeSuccess | AnalyzeError | null

export interface ParserStatus {
  expectedLength: number | null
  lastLength: number | null
  analyzeTriggerHeader: number | null
  lastChecksum: ChecksumDebug | null
}
