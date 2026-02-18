// swiftlint:disable identifier_name
// swiftlint:disable type_body_length
import Foundation
import Capacitor
import CoreBluetooth

let CONNECTION_TIMEOUT: Double = 10
let DEFAULT_TIMEOUT: Double = 5

@objc(BluetoothLe)
public class BluetoothLe: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BluetoothLe"
    public let jsName = "BluetoothLe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestEnable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startEnabledNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopEnabledNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isLocationEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openLocationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBluetoothSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDisplayStrings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestDevice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestLEScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLEScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discoverServices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnectedDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createBond", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isBonded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBondedDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getServices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMtu", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestConnectionPriority", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readRssi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeWithoutResponse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDescriptor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeDescriptor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNotifications", returnType: CAPPluginReturnPromise)
    ]
    typealias BleDevice = [String: Any]
    typealias BleService = [String: Any]
    typealias BleCharacteristic = [String: Any]
    typealias BleDescriptor = [String: Any]
    private var deviceManager: DeviceManager?
    private let deviceMap = ThreadSafeDictionary<String, Device>()
    private var displayStrings = [String: String]()

    override public func load() {
        self.displayStrings = self.getDisplayStrings()
    }

    @objc func initialize(_ call: CAPPluginCall) {
        self.deviceManager = DeviceManager(self.getBridgeViewController(), self.displayStrings, {(success, message) in
            if success {
                call.resolve()
            } else {
                self.rejectCall(call, message)
            }
        })
    }

    @objc func isEnabled(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }
        let enabled: Bool = deviceManager.isEnabled()
        call.resolve(["value": enabled])
    }

    @objc func requestEnable(_ call: CAPPluginCall) {
        call.unavailable("requestEnable is not available on iOS.")
    }

    @objc func enable(_ call: CAPPluginCall) {
        call.unavailable("enable is not available on iOS.")
    }

    @objc func disable(_ call: CAPPluginCall) {
        call.unavailable("disable is not available on iOS.")
    }

    @objc func startEnabledNotifications(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }
        deviceManager.registerStateReceiver({(enabled) in
            self.notifyListeners("onEnabledChanged", data: ["value": enabled])
        })
        call.resolve()
    }

    @objc func stopEnabledNotifications(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }
        deviceManager.unregisterStateReceiver()
        call.resolve()
    }

    @objc func isLocationEnabled(_ call: CAPPluginCall) {
        call.unavailable("isLocationEnabled is not available on iOS.")
    }

    @objc func openLocationSettings(_ call: CAPPluginCall) {
        call.unavailable("openLocationSettings is not available on iOS.")
    }

    @objc func openBluetoothSettings(_ call: CAPPluginCall) {
        call.unavailable("openBluetoothSettings is not available on iOS.")
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        guard let settingsUrl = URL(string: UIApplication.openSettingsURLString) else {
            self.rejectCall(call, "Cannot open app settings.")
            return
        }

        DispatchQueue.main.async {
            if UIApplication.shared.canOpenURL(settingsUrl) {
                UIApplication.shared.open(settingsUrl, completionHandler: { (success) in
                    call.resolve([
                        "value": success
                    ])
                })
            } else {
                self.rejectCall(call, "Cannot open app settings.")
            }
        }
    }

    @objc func setDisplayStrings(_ call: CAPPluginCall) {
        for key in ["noDeviceFound", "availableDevices", "scanning", "cancel"] {
            if let value = getOptionalString(call, key) {
                self.displayStrings[key] = value
            }
        }
        call.resolve()
    }

    @objc func requestDevice(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }
        deviceManager.setDisplayStrings(self.displayStrings)

        let serviceUUIDs = self.getServiceUUIDs(call)
        let name = getOptionalString(call, "name")
        let namePrefix = getOptionalString(call, "namePrefix")
        let manufacturerDataFilters = self.getManufacturerDataFilters(call)
        let serviceDataFilters = self.getServiceDataFilters(call)

        let displayModeString = (getOptionalString(call, "displayMode") ?? "alert").lowercased()
        guard ["alert", "list"].contains(displayModeString) else {
            self.rejectCall(call, "Invalid displayMode '\(getOptionalString(call, "displayMode") ?? "")'. Use 'alert' or 'list'.")
            return
        }
        let deviceListMode: DeviceListMode = displayModeString == "list" ? .list : .alert

        deviceManager.startScanning(
            serviceUUIDs,
            name,
            namePrefix,
            manufacturerDataFilters,
            serviceDataFilters,
            false,
            deviceListMode,
            30,
            {(success, message) in
                if success {
                    guard let device = deviceManager.getDevice(message) else {
                        self.rejectCall(call, "Device not found.")
                        return
                    }
                    let storedDevice = self.deviceMap.getOrInsert(
                        key: device.getId(),
                        create: { device },
                        update: { $0.updatePeripheral(device.getPeripheral()) }
                    ).value
                    let bleDevice: BleDevice = self.getBleDevice(storedDevice)
                    call.resolve(bleDevice)
                } else {
                    self.rejectCall(call, message)
                }
            },
            { (_, _, _) in }
        )
    }

    @objc func requestLEScan(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }

        let serviceUUIDs = self.getServiceUUIDs(call)
        let name = getOptionalString(call, "name")
        let namePrefix = getOptionalString(call, "namePrefix")
        let allowDuplicates = call.getBool("allowDuplicates", false)
        let manufacturerDataFilters = self.getManufacturerDataFilters(call)
        let serviceDataFilters = self.getServiceDataFilters(call)

        deviceManager.startScanning(
            serviceUUIDs,
            name,
            namePrefix,
            manufacturerDataFilters,
            serviceDataFilters,
            allowDuplicates,
            .none,
            nil,
            { (success, message) in
                if success {
                    call.resolve()
                } else {
                    self.rejectCall(call, message)
                }
            }, { (device, advertisementData, rssi) in
                let storedDevice = self.deviceMap.getOrInsert(
                    key: device.getId(),
                    create: { device },
                    update: { $0.updatePeripheral(device.getPeripheral()) }
                ).value
                let data = self.getScanResult(storedDevice, advertisementData, rssi)
                self.notifyListeners("onScanResult", data: data)
            }
        )
    }

    @objc func stopLEScan(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }
        deviceManager.stopScan()
        call.resolve()
    }

    @objc func getDevices(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }
        guard let deviceIds = self.getStringArray(call, "deviceIds") else {
            self.rejectCall(call, "deviceIds must be provided")
            return
        }
        let deviceUUIDs: [UUID] = deviceIds.compactMap({ deviceId in
            return UUID(uuidString: deviceId)
        })
        let peripherals = deviceManager.getDevices(deviceUUIDs)
        let bleDevices: [BleDevice] = peripherals.map({peripheral in
            let deviceId = peripheral.identifier.uuidString
            let device = self.deviceMap.getOrInsert(
                key: deviceId,
                create: { Device(peripheral) },
                update: { $0.updatePeripheral(peripheral) }
            ).value
            return self.getBleDevice(device)
        })
        call.resolve(["devices": bleDevices])
    }

    @objc func getConnectedDevices(_ call: CAPPluginCall) {
        guard let deviceManager = self.getDeviceManager(call) else { return }
        guard let services = self.getStringArray(call, "services") else {
            self.rejectCall(call, "services must be provided")
            return
        }
        let serviceUUIDs: [CBUUID] = services.compactMap({ service in
            return CBUUID(string: service)
        })
        let peripherals = deviceManager.getConnectedDevices(serviceUUIDs)
        let bleDevices: [BleDevice] = peripherals.map({peripheral in
            let deviceId = peripheral.identifier.uuidString
            let device = self.deviceMap.getOrInsert(
                key: deviceId,
                create: { Device(peripheral) },
                update: { $0.updatePeripheral(peripheral) }
            ).value
            return self.getBleDevice(device)
        })
        call.resolve(["devices": bleDevices])
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call, checkConnection: false) else { return }
        let timeout = self.getTimeout(call, defaultTimeout: CONNECTION_TIMEOUT)
        let skipDescriptorDiscovery = call.getBool("skipDescriptorDiscovery", false)
        device.setOnConnected(timeout, skipDescriptorDiscovery, {(success, message) in
            if success {
                // only resolve after service discovery
                call.resolve()
            } else {
                self.deviceManager?.cancelConnect(device)
                self.rejectCall(call, message)
            }
        })
        self.deviceManager?.setOnDisconnected(device, {(_, _) in
            let key = "disconnected|\(device.getId())"
            self.notifyListeners(key, data: nil)
        })
        self.deviceManager?.connect(device, timeout, {(success, message) in
            if success {
                log("Connected to peripheral. Waiting for service discovery.")
            } else {
                self.rejectCall(call, message)
            }
        })

    }

    @objc func createBond(_ call: CAPPluginCall) {
        call.unavailable("createBond is not available on iOS.")
    }

    @objc func isBonded(_ call: CAPPluginCall) {
        call.unavailable("isBonded is not available on iOS.")
    }

    @objc func getBondedDevices(_ call: CAPPluginCall) {
        call.unavailable("getBondedDevices is not available on iOS.")
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call, checkConnection: false) else { return }
        let timeout = self.getTimeout(call)
        self.deviceManager?.disconnect(device, timeout, {(success, message) in
            if success {
                call.resolve()
            } else {
                self.rejectCall(call, message)
            }
        })
    }

    @objc func getServices(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        let services = device.getServices()
        var bleServices = [BleService]()
        for service in services {
            var bleCharacteristics = [BleCharacteristic]()
            for characteristic in service.characteristics ?? [] {
                var bleDescriptors = [BleDescriptor]()
                for descriptor in characteristic.descriptors ?? [] {
                    bleDescriptors.append([
                        "uuid": cbuuidToString(descriptor.uuid)
                    ])
                }
                bleCharacteristics.append([
                    "uuid": cbuuidToString(characteristic.uuid),
                    "properties": getProperties(characteristic),
                    "descriptors": bleDescriptors
                ])
            }
            bleServices.append([
                "uuid": cbuuidToString(service.uuid),
                "characteristics": bleCharacteristics
            ])
        }
        call.resolve(["services": bleServices])
    }

    private func getProperties(_ characteristic: CBCharacteristic) -> [String: Bool] {
        return [
            "broadcast": characteristic.properties.contains(CBCharacteristicProperties.broadcast),
            "read": characteristic.properties.contains(CBCharacteristicProperties.read),
            "writeWithoutResponse": characteristic.properties.contains(CBCharacteristicProperties.writeWithoutResponse),
            "write": characteristic.properties.contains(CBCharacteristicProperties.write),
            "notify": characteristic.properties.contains(CBCharacteristicProperties.notify),
            "indicate": characteristic.properties.contains(CBCharacteristicProperties.indicate),
            "authenticatedSignedWrites": characteristic.properties.contains(CBCharacteristicProperties.authenticatedSignedWrites),
            "extendedProperties": characteristic.properties.contains(CBCharacteristicProperties.extendedProperties),
            "notifyEncryptionRequired": characteristic.properties.contains(CBCharacteristicProperties.notifyEncryptionRequired),
            "indicateEncryptionRequired": characteristic.properties.contains(CBCharacteristicProperties.indicateEncryptionRequired)
        ]
    }

    @objc func discoverServices(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        let timeout = self.getTimeout(call)
        device.discoverServices(timeout, {(success, value) in
            if success {
                call.resolve()
            } else {
                self.rejectCall(call, value)
            }
        })
    }

    @objc func getMtu(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        call.resolve([
            "value": device.getMtu()
        ])
    }

    @objc func requestConnectionPriority(_ call: CAPPluginCall) {
        call.unavailable("requestConnectionPriority is not available on iOS.")
    }

    @objc func readRssi(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        let timeout = self.getTimeout(call)
        device.readRssi(timeout, {(success, value) in
            if success {
                call.resolve([
                    "value": value
                ])
            } else {
                self.rejectCall(call, value)
            }
        })
    }

    @objc func read(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        guard let characteristic = self.getCharacteristic(call) else { return }
        let timeout = self.getTimeout(call)
        device.read(characteristic.0, characteristic.1, timeout, {(success, value) in
            if success {
                call.resolve([
                    "value": value
                ])
            } else {
                self.rejectCall(call, value)
            }
        })
    }

    @objc func write(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        guard let characteristic = self.getCharacteristic(call) else { return }
        guard let value = getOptionalString(call, "value") else {
            self.rejectCall(call, "value must be provided")
            return
        }
        let writeType = CBCharacteristicWriteType.withResponse
        let timeout = self.getTimeout(call)
        device.write(
            characteristic.0,
            characteristic.1,
            value,
            writeType,
            timeout, {(success, value) in
                if success {
                    call.resolve()
                } else {
                    self.rejectCall(call, value)
                }
            })
    }

    @objc func writeWithoutResponse(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        guard let characteristic = self.getCharacteristic(call) else { return }
        guard let value = getOptionalString(call, "value") else {
            self.rejectCall(call, "value must be provided")
            return
        }
        let writeType = CBCharacteristicWriteType.withoutResponse
        let timeout = self.getTimeout(call)
        device.write(
            characteristic.0,
            characteristic.1,
            value,
            writeType,
            timeout, {(success, value) in
                if success {
                    call.resolve()
                } else {
                    self.rejectCall(call, value)
                }
            })
    }

    @objc func readDescriptor(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        guard let descriptor = self.getDescriptor(call) else { return }
        let timeout = self.getTimeout(call)
        device.readDescriptor(
            descriptor.0,
            descriptor.1,
            descriptor.2,
            timeout, {(success, value) in
                if success {
                    call.resolve([
                        "value": value
                    ])
                } else {
                    self.rejectCall(call, value)
                }
            })
    }

    @objc func writeDescriptor(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        guard let descriptor = self.getDescriptor(call) else { return }
        guard let value = getOptionalString(call, "value") else {
            self.rejectCall(call, "value must be provided")
            return
        }
        let timeout = self.getTimeout(call)
        device.writeDescriptor(
            descriptor.0,
            descriptor.1,
            descriptor.2,
            value,
            timeout, {(success, value) in
                if success {
                    call.resolve()
                } else {
                    self.rejectCall(call, value)
                }
            })
    }

    @objc func startNotifications(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        guard let characteristic = self.getCharacteristic(call) else { return }
        let timeout = self.getTimeout(call)
        device.setNotifications(
            characteristic.0,
            characteristic.1,
            true, {(_, value) in
                let key = "notification|\(device.getId())|\(characteristic.0.uuidString.lowercased())|\(characteristic.1.uuidString.lowercased())"
                self.notifyListeners(key, data: ["value": value])
            },
            timeout, {(success, value) in
                if success {
                    call.resolve()
                } else {
                    self.rejectCall(call, value)
                }
            })
    }

    @objc func stopNotifications(_ call: CAPPluginCall) {
        guard self.getDeviceManager(call) != nil else { return }
        guard let device = self.getDevice(call) else { return }
        guard let characteristic = self.getCharacteristic(call) else { return }
        let timeout = self.getTimeout(call)
        device.setNotifications(
            characteristic.0,
            characteristic.1,
            false,
            nil,
            timeout, {(success, value) in
                if success {
                    call.resolve()
                } else {
                    self.rejectCall(call, value)
                }
            })
    }

    private func getBridgeViewController() -> UIViewController? {
        // Capacitor bridge protocol shape differs by version; fallback to KVC.
        if let vc = (self.bridge as AnyObject?)?.value(forKey: "viewController") as? UIViewController {
            return vc
        }
        return nil
    }

    private func rejectCall(_ call: CAPPluginCall, _ message: String) {
        // Compatible fallback across Capacitor Swift API versions.
        call.unimplemented(message)
    }

    private func getDisplayStrings() -> [String: String] {
        var displayStrings = [String: String]()
        // Keep defaults for broad Capacitor API compatibility.
        displayStrings["noDeviceFound"] = "No device found"
        displayStrings["availableDevices"] = "Available devices"
        displayStrings["scanning"] = "Scanning..."
        displayStrings["cancel"] = "Cancel"
        return displayStrings
    }

    private func getDeviceManager(_ call: CAPPluginCall) -> DeviceManager? {
        guard let deviceManager = self.deviceManager else {
            self.rejectCall(call, "Bluetooth LE not initialized.")
            return nil
        }
        return deviceManager
    }

    private func getServiceUUIDs(_ call: CAPPluginCall) -> [CBUUID] {
        let services = self.getStringArray(call, "services") ?? []
        let serviceUUIDs = services.map({(service) -> CBUUID in
            return CBUUID(string: service)
        })
        return serviceUUIDs
    }

    private func getOptionalString(_ call: CAPPluginCall, _ key: String) -> String? {
        let value = call.getString(key, "")
        return value.isEmpty ? nil : value
    }

    private func getStringArray(_ call: CAPPluginCall, _ key: String) -> [String]? {
        return call.getArray(key, []) as? [String]
    }

    private func getManufacturerDataFilters(_ call: CAPPluginCall) -> [ManufacturerDataFilter]? {
        guard let manufacturerDataArray = call.getArray("manufacturerData", []) as? JSArray else {
            return nil
        }

        var manufacturerDataFilters: [ManufacturerDataFilter] = []

        for index in 0..<manufacturerDataArray.count {
            guard let dataObject = manufacturerDataArray[index] as? JSObject,
                  let companyIdentifier = dataObject["companyIdentifier"] as? UInt16 else {
                // Invalid or missing company identifier
                return nil
            }

            let dataPrefix: Data? = {
                guard let prefixString = dataObject["dataPrefix"] as? String else { return nil }
                return stringToData(prefixString)
            }()

            let mask: Data? = {
                guard let maskString = dataObject["mask"] as? String else { return nil }
                return stringToData(maskString)
            }()

            let manufacturerFilter = ManufacturerDataFilter(
                companyIdentifier: companyIdentifier,
                dataPrefix: dataPrefix,
                mask: mask
            )

            manufacturerDataFilters.append(manufacturerFilter)
        }

        return manufacturerDataFilters
    }

    private func getServiceDataFilters(_ call: CAPPluginCall) -> [ServiceDataFilter]? {
        guard let serviceDataArray = call.getArray("serviceData", []) as? JSArray else {
            return nil
        }

        var serviceDataFilters: [ServiceDataFilter] = []

        for index in 0..<serviceDataArray.count {
            guard let dataObject = serviceDataArray[index] as? JSObject,
                  let serviceUuidString = dataObject["serviceUuid"] as? String else {
                // Invalid or missing service UUID
                return nil
            }

            let serviceUuid = CBUUID(string: serviceUuidString)

            let dataPrefix: Data? = {
                guard let prefixString = dataObject["dataPrefix"] as? String else { return nil }
                return stringToData(prefixString)
            }()

            let mask: Data? = {
                guard let maskString = dataObject["mask"] as? String else { return nil }
                return stringToData(maskString)
            }()

            let serviceDataFilter = ServiceDataFilter(
                serviceUuid: serviceUuid,
                dataPrefix: dataPrefix,
                mask: mask
            )

            serviceDataFilters.append(serviceDataFilter)
        }

        return serviceDataFilters
    }

    private func getDevice(_ call: CAPPluginCall, checkConnection: Bool = true) -> Device? {
        guard let deviceId = getOptionalString(call, "deviceId") else {
            self.rejectCall(call, "deviceId required.")
            return nil
        }
        guard let device = self.deviceMap[deviceId] else {
            self.rejectCall(call, "Device not found. Call 'requestDevice', 'requestLEScan' or 'getDevices' first.")
            return nil
        }
        if checkConnection {
            guard device.isConnected() else {
                self.rejectCall(call, "Not connected to device.")
                return nil
            }
        }
        return device
    }

    private func getTimeout(_ call: CAPPluginCall, defaultTimeout: Double = DEFAULT_TIMEOUT) -> Double {
        let timeout = call.getDouble("timeout", defaultTimeout * 1000)
        return timeout / 1000
    }

    private func getCharacteristic(_ call: CAPPluginCall) -> (CBUUID, CBUUID)? {
        guard let service = getOptionalString(call, "service") else {
            self.rejectCall(call, "Service UUID required.")
            return nil
        }
        let serviceUUID = CBUUID(string: service)

        guard let characteristic = getOptionalString(call, "characteristic") else {
            self.rejectCall(call, "Characteristic UUID required.")
            return nil
        }
        let characteristicUUID = CBUUID(string: characteristic)
        return (serviceUUID, characteristicUUID)
    }

    private func getDescriptor(_ call: CAPPluginCall) -> (CBUUID, CBUUID, CBUUID)? {
        guard let characteristic = getCharacteristic(call) else {
            return nil
        }
        guard let descriptor = getOptionalString(call, "descriptor") else {
            self.rejectCall(call, "Descriptor UUID required.")
            return nil
        }
        let descriptorUUID = CBUUID(string: descriptor)

        return (characteristic.0, characteristic.1, descriptorUUID)
    }

    private func getBleDevice(_ device: Device) -> BleDevice {
        var bleDevice = [
            "deviceId": device.getId()
        ]
        if let name = device.getName() {
            bleDevice["name"] = name
        }
        return bleDevice
    }

    private func getScanResult(_ device: Device, _ advertisementData: [String: Any], _ rssi: NSNumber) -> [String: Any] {
        var data = [
            "device": self.getBleDevice(device),
            "rssi": rssi,
            "txPower": advertisementData[CBAdvertisementDataTxPowerLevelKey] ?? 127,
            "uuids": (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []).map({(uuid) -> String in
                return cbuuidToString(uuid)
            })
        ]

        if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
            data["localName"] = localName
        }

        if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
            data["manufacturerData"] = self.getManufacturerData(data: manufacturerData)
        }

        if let serviceData = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data] {
            data["serviceData"] = self.getServiceData(data: serviceData)
        }
        return data
    }

    private func getManufacturerData(data: Data) -> [String: String] {
        var company = 0
        var rest = ""
        for (index, byte) in data.enumerated() {
            if index == 0 {
                company += Int(byte)
            } else if index == 1 {
                company += Int(byte) * 256
            } else {
                rest += String(format: "%02hhx ", byte)
            }
        }
        return [String(company): rest]
    }

    private func getServiceData(data: [CBUUID: Data]) -> [String: String] {
        var result: [String: String] = [:]
        for (key, value) in data {
            result[cbuuidToString(key)] = dataToString(value)
        }
        return result
    }
}
