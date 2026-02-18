import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
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

type ScanResult = {
  device?: { deviceId?: string; id?: string; name?: string; localName?: string }
  deviceId?: string
  id?: string
  name?: string
  localName?: string
}

type CharacteristicChange = {
  value?: ArrayBuffer | Uint8Array | number[] | string
  service?: string
  characteristic?: string
}

type BluetoothLowEnergyPlugin = {
  initialize?: () => Promise<void>
  requestPermissions?: () => Promise<unknown>
  isEnabled?: () => Promise<{ value?: boolean; enabled?: boolean }>
  requestEnable?: () => Promise<void>
  requestLEScan?: (options?: Record<string, unknown>) => Promise<void>
  stopLEScan?: () => Promise<void>
  connect?: (options: { deviceId: string }) => Promise<void>
  disconnect?: (options: { deviceId: string }) => Promise<void>
  discoverServices?: (options: { deviceId: string }) => Promise<unknown>
  startNotifications?: (options: {
    deviceId: string
    service: string
    characteristic: string
  }) => Promise<void>
  stopNotifications?: (options: {
    deviceId: string
    service: string
    characteristic: string
  }) => Promise<void>
  addListener?: (
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ) => Promise<PluginListenerHandle> | PluginListenerHandle
}

export class NativeBleService implements BleServiceClient {
  private readonly ble = registerPlugin<BluetoothLowEnergyPlugin>('BluetoothLowEnergy')

  private handlers: BleNotifyHandlers = {}

  private parser = new BbpProtocol()

  private state: BleState = {
    connected: false,
    beyAttached: false,
  }

  private reconnectTimer: number | null = null

  private connectedDeviceId: string | null = null

  private scanHandles: PluginListenerHandle[] = []

  private notifyHandles: PluginListenerHandle[] = []

  private connecting = false

  setHandlers(handlers: BleNotifyHandlers): void {
    this.handlers = handlers
  }

  async connect(): Promise<void> {
    if (this.connecting || this.state.connected) {
      return
    }
    this.connecting = true
    try {
      if (!this.ble.requestLEScan || !this.ble.connect || !this.ble.startNotifications) {
        throw new Error(
          'BluetoothLowEnergy plugin is unavailable. Install @capawesome-team/capacitor-bluetooth-low-energy and run cap sync.',
        )
      }
      await this.ble.initialize?.()
      await this.ensurePermissionsAndEnabled()

      const knownId = localStorage.getItem(LAST_NATIVE_DEVICE_ID_KEY)
      const knownName = localStorage.getItem(LAST_NATIVE_DEVICE_NAME_KEY)
      const found = await this.scanForDevice(knownId, knownName)
      if (!found) {
        throw new Error('BBP device not found')
      }

      await this.ble.connect?.({ deviceId: found.deviceId })
      this.connectedDeviceId = found.deviceId
      this.persistDeviceHint(found.deviceId, found.name)
      await this.subscribeNotify(found.deviceId)

      this.state.connected = true
      this.emitState()
    } catch (error) {
      this.handlers.onError?.(this.toProtocolError(error, 'native connect failed'))
      this.state.connected = false
      this.state.beyAttached = false
      this.emitState()
      throw error
    } finally {
      await this.stopScan()
      this.connecting = false
    }
  }

  disconnect(): void {
    this.stopAutoReconnectLoop()
    void this.stopNotificationsAndListeners()
    const deviceId = this.connectedDeviceId
    this.connectedDeviceId = null
    if (deviceId) {
      void this.ble.disconnect?.({ deviceId })
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
          // Retry on next tick.
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

  private async ensurePermissionsAndEnabled(): Promise<void> {
    await this.ble.requestPermissions?.()
    const enabled = await this.ble.isEnabled?.()
    const isEnabled = enabled?.value ?? enabled?.enabled ?? true
    if (!isEnabled) {
      await this.ble.requestEnable?.()
    }
  }

  private async scanForDevice(
    preferredDeviceId: string | null,
    preferredName: string | null,
  ): Promise<{ deviceId: string; name: string | null } | null> {
    await this.stopScan()

    return new Promise((resolve) => {
      let resolved = false
      let timeoutId: number | null = null
      const finish = async (result: { deviceId: string; name: string | null } | null) => {
        if (resolved) return
        resolved = true
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        await this.stopScan()
        resolve(result)
      }

      const onScan = (payload: Record<string, unknown>) => {
        const result = this.normalizeScanResult(payload as ScanResult)
        if (!result) return

        const matchById = preferredDeviceId && result.deviceId === preferredDeviceId
        const matchByName = preferredName && result.name === preferredName
        const matchByPrefix = result.name?.startsWith(BBP_LOCAL_NAME)
        if (matchById || matchByName || matchByPrefix) {
          void finish(result)
        }
      }

      void (async () => {
        await this.addScanListener('scanResultReceived', onScan)
        await this.addScanListener('onScanResult', onScan)
        await this.addScanListener('scanResult', onScan)

        timeoutId = window.setTimeout(() => {
          void finish(null)
        }, 10000)

        try {
          await this.ble.requestLEScan?.({
            namePrefix: BBP_LOCAL_NAME,
            services: [BBP_SERVICE_UUID],
            allowDuplicates: true,
          })
        } catch {
          await this.ble.requestLEScan?.({
            services: [BBP_SERVICE_UUID],
            allowDuplicates: true,
          })
        }
      })()
    })
  }

  private async stopScan(): Promise<void> {
    try {
      await this.ble.stopLEScan?.()
    } catch {
      // Ignore scan stop errors.
    }
    await Promise.all(this.scanHandles.map((h) => h.remove()))
    this.scanHandles = []
  }

  private async subscribeNotify(deviceId: string): Promise<void> {
    await this.stopNotificationsAndListeners()

    const onNotify = (payload: Record<string, unknown>) => {
      const data = this.normalizeCharacteristicChange(payload as CharacteristicChange)
      if (!data || data.length < 2) return

      let packet
      try {
        packet = this.parser.parsePacket(data)
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
    }

    await this.addNotifyListener('characteristicValueChanged', onNotify)
    await this.addNotifyListener('onCharacteristicValueChanged', onNotify)
    await this.addNotifyListener('notificationReceived', onNotify)

    await this.ble.startNotifications?.({
      deviceId,
      service: BBP_SERVICE_UUID,
      characteristic: BBP_SP_NOTIFY_UUID,
    })
  }

  private async stopNotificationsAndListeners(): Promise<void> {
    const deviceId = this.connectedDeviceId
    if (deviceId) {
      try {
        await this.ble.stopNotifications?.({
          deviceId,
          service: BBP_SERVICE_UUID,
          characteristic: BBP_SP_NOTIFY_UUID,
        })
      } catch {
        // Ignore notify stop errors.
      }
    }
    await Promise.all(this.notifyHandles.map((h) => h.remove()))
    this.notifyHandles = []
  }

  private async addScanListener(
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    try {
      const handle = await this.ble.addListener?.(eventName, listener)
      if (handle) {
        this.scanHandles.push(handle)
      }
    } catch {
      // Unsupported event name.
    }
  }

  private async addNotifyListener(
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    try {
      const handle = await this.ble.addListener?.(eventName, listener)
      if (handle) {
        this.notifyHandles.push(handle)
      }
    } catch {
      // Unsupported event name.
    }
  }

  private normalizeScanResult(scan: ScanResult): { deviceId: string; name: string | null } | null {
    const device = scan.device
    const deviceId = device?.deviceId ?? device?.id ?? scan.deviceId ?? scan.id
    if (!deviceId) {
      return null
    }
    const name = device?.name ?? device?.localName ?? scan.name ?? scan.localName ?? null
    return { deviceId, name }
  }

  private normalizeCharacteristicChange(change: CharacteristicChange): Uint8Array | null {
    const value = change.value
    if (!value) return null
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (Array.isArray(value)) return Uint8Array.from(value)
    if (typeof value === 'string') {
      // Base64 payload is common in BLE plugins.
      try {
        const binary = atob(value)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i)
        }
        return bytes
      } catch {
        return null
      }
    }
    return null
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
