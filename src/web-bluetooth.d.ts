interface BluetoothRemoteGATTServer {
  connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value: DataView | null
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothDevice extends EventTarget {
  id?: string
  name?: string
  gatt?: BluetoothRemoteGATTServer
}

interface RequestDeviceOptions {
  filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>
  optionalServices?: string[]
}

interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>
  getDevices?(): Promise<BluetoothDevice[]>
}

interface Navigator {
  bluetooth?: Bluetooth
}
