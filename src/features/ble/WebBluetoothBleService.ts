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

const LAST_DEVICE_ID_KEY = 'beymeter.lastDeviceId'
const LAST_DEVICE_NAME_KEY = 'beymeter.lastDeviceName'
export class WebBluetoothBleService implements BleServiceClient {
  private device: BluetoothDevice | null = null

  private characteristic: BluetoothRemoteGATTCharacteristic | null = null

  private parser = new BbpProtocol()

  private state: BleState = {
    connected: false,
    beyAttached: false,
    bbpTotalShots: null,
  }

  private handlers: BleNotifyHandlers = {}

  private reconnectTimer: number | null = null

  private readonly onDisconnected = (): void => {
    this.state = {
      connected: false,
      beyAttached: false,
      bbpTotalShots: null,
    }
    this.emitState()
  }

  private readonly onCharacteristicValueChanged = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null
    const value = target?.value
    if (!value) {
      return
    }

    let packet
    try {
      packet = this.parser.parsePacket(value)
    } catch (err) {
      this.handlers.onError?.(this.toProtocolError(err, 'parse error'))
      return
    }

    this.handlers.onRaw?.(packet)

    if (packet.header === HEADER_ATTACH) {
      this.parser.updateMap(packet)
      this.state.beyAttached = this.parser.getBeyAttached()
      this.state.bbpTotalShots = this.parser.getBbpTotalShots()
      this.emitState()
      return
    }

    const result: AnalyzeResult = this.parser.updateMap(packet)
    if (!result) {
      return
    }

    if (result.kind === 'error') {
      this.handlers.onError?.(result.error)
      return
    }

    this.handlers.onShot?.(result.snapshot)
  }

  setHandlers(handlers: BleNotifyHandlers): void {
    this.handlers = handlers
    this.emitState()
  }

  async connectWithBestEffort(interactive = false): Promise<boolean> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not available in this environment')
    }

    if (this.device?.gatt?.connected) {
      return true
    }

    const reconnected = await this.reconnectKnownDevice()
    if (reconnected) {
      return true
    }

    if (!interactive) {
      return false
    }

    const requested = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: BBP_LOCAL_NAME, services: [BBP_SERVICE_UUID] }],
      optionalServices: [BBP_SERVICE_UUID],
    })
    this.device = requested
    this.persistDeviceHint(requested)
    await this.connectDevice(requested)
    return true
  }

  async connect(): Promise<void> {
    const ok = await this.connectWithBestEffort(true)
    if (!ok) {
      throw new Error('Failed to connect BBP')
    }
  }

  autoReconnectLoop(intervalMs = 2500): void {
    if (this.reconnectTimer !== null) {
      return
    }

    this.reconnectTimer = window.setInterval(async () => {
      if (this.state.connected) {
        return
      }
      try {
        await this.connectWithBestEffort(false)
      } catch {
        // Ignore and retry in next tick.
      }
    }, intervalMs)
  }

  stopAutoReconnectLoop(): void {
    if (this.reconnectTimer !== null) {
      window.clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  disconnect(): void {
    this.stopAutoReconnectLoop()

    if (this.characteristic) {
      this.characteristic.removeEventListener('characteristicvaluechanged', this.onCharacteristicValueChanged)
    }

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.onDisconnected)
      if (this.device.gatt?.connected) {
        this.device.gatt.disconnect()
      }
    }

    this.characteristic = null
    this.device = null
    this.parser.clearMap()

    this.state = {
      connected: false,
      beyAttached: false,
      bbpTotalShots: null,
    }
    this.emitState()
  }

  getParserStatus(): ParserStatus {
    return this.parser.getStatus()
  }

  private async reconnectKnownDevice(): Promise<boolean> {
    const api = navigator.bluetooth
    if (!api?.getDevices) {
      return false
    }

    const devices = await api.getDevices()
    if (devices.length === 0) {
      return false
    }

    const savedId = localStorage.getItem(LAST_DEVICE_ID_KEY)
    const savedName = localStorage.getItem(LAST_DEVICE_NAME_KEY)

    const matched =
      devices.find((d) => savedId && d.id === savedId) ??
      devices.find((d) => savedName && d.name === savedName) ??
      devices.find((d) => d.name?.startsWith(BBP_LOCAL_NAME))

    if (!matched) {
      return false
    }

    this.device = matched
    this.persistDeviceHint(matched)
    await this.connectDevice(matched)
    return true
  }

  private async connectDevice(device: BluetoothDevice): Promise<void> {
    device.addEventListener('gattserverdisconnected', this.onDisconnected)

    const server = await device.gatt?.connect()
    if (!server) {
      throw new Error('Failed to connect GATT server')
    }

    const service = await server.getPrimaryService(BBP_SERVICE_UUID)
    this.characteristic = await service.getCharacteristic(BBP_SP_NOTIFY_UUID)
    await this.characteristic.startNotifications()
    this.characteristic.addEventListener('characteristicvaluechanged', this.onCharacteristicValueChanged)

    this.state.connected = true
    this.emitState()
  }

  private persistDeviceHint(device: BluetoothDevice): void {
    if (device.id) {
      localStorage.setItem(LAST_DEVICE_ID_KEY, device.id)
    }
    if (device.name) {
      localStorage.setItem(LAST_DEVICE_NAME_KEY, device.name)
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
