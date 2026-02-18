import {
  BleClient,
  type BleDevice,
  type ScanResult,
} from '@capacitor-community/bluetooth-le'
import {
  BBP_LOCAL_NAME,
  BBP_SERVICE_UUID,
  BBP_SP_NOTIFY_UUID,
  HEADER_ATTACH,
  type AnalyzeResult,
  type ParserStatus,
  type ProtocolError,
} from './bbpTypes'
import { BbpProtocol } from './bbpProtocol'
import type { BleNotifyHandlers, BleServiceClient, BleState } from './types'

const LAST_NATIVE_DEVICE_ID_KEY = 'beymeter.native.lastDeviceId'
const LAST_NATIVE_DEVICE_NAME_KEY = 'beymeter.native.lastDeviceName'
const A0_ATTACHED_VALUES = new Set([0x04, 0x14])

export class NativeBleService implements BleServiceClient {
  private handlers: BleNotifyHandlers = {}

  private parser = new BbpProtocol()

  private state: BleState = {
    connected: false,
    beyAttached: false,
  }

  private reconnectTimer: number | null = null

  private connectedDeviceId: string | null = null

  private connecting = false

  private initialized = false

  setHandlers(handlers: BleNotifyHandlers): void {
    this.handlers = handlers
  }

  async connect(): Promise<void> {
    if (this.connecting || this.state.connected) {
      return
    }
    this.connecting = true
    try {
      await this.ensureInitialized()

      const knownId = localStorage.getItem(LAST_NATIVE_DEVICE_ID_KEY)
      const knownName = localStorage.getItem(LAST_NATIVE_DEVICE_NAME_KEY)
      const found = await this.scanForDevice(knownId, knownName)
      if (!found) {
        throw new Error('BBP device not found')
      }

      await BleClient.connect(found.deviceId, this.onDisconnected)
      this.connectedDeviceId = found.deviceId
      this.persistDeviceHint(found.deviceId, found.name ?? null)

      await this.ensureNotifyCharacteristic(found.deviceId)
      await this.startNotify(found.deviceId)

      this.state.connected = true
      this.emitState()
    } catch (error) {
      this.handlers.onError?.(this.toProtocolError(error, 'native connect failed'))
      this.state.connected = false
      this.state.beyAttached = false
      this.emitState()
      throw error
    } finally {
      this.connecting = false
    }
  }

  disconnect(): void {
    this.stopAutoReconnectLoop()
    const deviceId = this.connectedDeviceId
    this.connectedDeviceId = null

    if (deviceId) {
      void BleClient.stopNotifications(deviceId, BBP_SERVICE_UUID, BBP_SP_NOTIFY_UUID).catch(() => {})
      void BleClient.disconnect(deviceId).catch(() => {})
    }

    this.state = {
      connected: false,
      beyAttached: false,
    }
    this.parser.clearMap()
    this.emitState()
  }

  autoReconnectLoop(intervalMs = 2500): void {
    if (this.reconnectTimer !== null) {
      return
    }
    this.reconnectTimer = window.setInterval(() => {
      if (!this.state.connected && !this.connecting) {
        void this.connect().catch(() => {
          // Retry next tick.
        })
      }
    }, intervalMs)
  }

  stopAutoReconnectLoop(): void {
    if (this.reconnectTimer !== null) {
      window.clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  getParserStatus(): ParserStatus | null {
    return this.parser.getStatus()
  }

  private readonly onDisconnected = (): void => {
    this.connectedDeviceId = null
    this.state.connected = false
    this.state.beyAttached = false
    this.emitState()
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return
    }
    await BleClient.initialize()
    const enabled = await BleClient.isEnabled()
    if (!enabled) {
      await BleClient.requestEnable()
    }
    this.initialized = true
  }

  private async scanForDevice(
    preferredDeviceId: string | null,
    preferredName: string | null,
  ): Promise<BleDevice | null> {
    return new Promise((resolve) => {
      let resolved = false
      let timeoutId: number | null = null

      const finish = async (device: BleDevice | null) => {
        if (resolved) return
        resolved = true
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        try {
          await BleClient.stopLEScan()
        } catch {
          // Ignore scan stop errors.
        }
        resolve(device)
      }

      const onScan = (result: ScanResult) => {
        const device = result.device
        if (!device?.deviceId) {
          return
        }
        const name = device.name ?? ''
        const matchById = Boolean(preferredDeviceId && device.deviceId === preferredDeviceId)
        const matchByName = Boolean(preferredName && name === preferredName)
        const matchByPrefix = name.startsWith(BBP_LOCAL_NAME)
        if (matchById || matchByName || matchByPrefix) {
          void finish(device)
        }
      }

      void (async () => {
        timeoutId = window.setTimeout(() => {
          void finish(null)
        }, 10000)

        try {
          await BleClient.requestLEScan(
            {
              namePrefix: BBP_LOCAL_NAME,
              services: [BBP_SERVICE_UUID],
              allowDuplicates: true,
            },
            onScan,
          )
        } catch {
          await BleClient.requestLEScan(
            {
              services: [BBP_SERVICE_UUID],
              allowDuplicates: true,
            },
            onScan,
          )
        }
      })()
    })
  }

  private async ensureNotifyCharacteristic(deviceId: string): Promise<void> {
    const services = await BleClient.getServices(deviceId)
    const service = services.find((s) => this.eqUuid(s.uuid, BBP_SERVICE_UUID))
    if (!service) {
      throw new Error(`Service not found: ${BBP_SERVICE_UUID}`)
    }
    const characteristic = service.characteristics.find((c) =>
      this.eqUuid(c.uuid, BBP_SP_NOTIFY_UUID),
    )
    if (!characteristic) {
      throw new Error(`Characteristic not found: ${BBP_SP_NOTIFY_UUID}`)
    }
  }

  private async startNotify(deviceId: string): Promise<void> {
    await BleClient.startNotifications(
      deviceId,
      BBP_SERVICE_UUID,
      BBP_SP_NOTIFY_UUID,
      (value: DataView) => {
        let packet
        try {
          packet = this.parser.parsePacket(value)
        } catch (error) {
          this.handlers.onError?.(this.toProtocolError(error, 'native parse error'))
          return
        }

        this.handlers.onRaw?.(packet)
        if (packet.header === HEADER_ATTACH) {
          const attachCode = packet.bytes[3] ?? 0x00
          this.state.beyAttached = A0_ATTACHED_VALUES.has(attachCode)
          this.emitState()
          return
        }

        const result: AnalyzeResult = this.parser.updateMap(packet)
        if (!result) return
        if (result.kind === 'error') {
          this.handlers.onError?.(result.error)
          return
        }
        this.handlers.onShot?.(result.snapshot)
      },
    )
  }

  private persistDeviceHint(deviceId: string, name: string | null): void {
    localStorage.setItem(LAST_NATIVE_DEVICE_ID_KEY, deviceId)
    if (name) {
      localStorage.setItem(LAST_NATIVE_DEVICE_NAME_KEY, name)
    }
  }

  private emitState(): void {
    this.handlers.onState?.({ ...this.state })
  }

  private eqUuid(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase()
  }

  private toProtocolError(err: unknown, fallbackMessage: string): ProtocolError {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'message' in err &&
      typeof (err as { code: unknown }).code === 'string' &&
      typeof (err as { message: unknown }).message === 'string'
    ) {
      return err as ProtocolError
    }

    return {
      code: 'PACKET_TOO_SHORT',
      message: fallbackMessage,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}
