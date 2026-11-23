import type { Transport } from './elm'

// BLE ELM327 clones all use different uart-ish services. these are the ones I've seen.
const BLE_SERVICES: BluetoothServiceUUID[] = [
  0xfff0,
  0xffe0,
  0x18f0,
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // vgate icar pro
]

const enc = new TextEncoder()
const dec = new TextDecoder()

export function bleSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export function serialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export class BleTransport implements Transport {
  label = 'Bluetooth LE'
  onData: (chunk: string) => void = () => {}
  onClose: () => void = () => {}
  private device?: BluetoothDevice
  private tx?: BluetoothRemoteGATTCharacteristic
  private rx?: BluetoothRemoteGATTCharacteristic

  async open() {
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES,
    })
    this.label = this.device.name || 'Bluetooth LE'
    this.device.addEventListener('gattserverdisconnected', () => this.onClose())
    const server = await this.device.gatt!.connect()

    for (const uuid of BLE_SERVICES) {
      let svc: BluetoothRemoteGATTService
      try {
        svc = await server.getPrimaryService(uuid)
      } catch {
        continue
      }
      const chars = await svc.getCharacteristics()
      // pick by properties, cheaper than hardcoding every clone's characteristic ids
      this.rx = chars.find((c) => c.properties.notify || c.properties.indicate)
      this.tx = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse)
      if (this.rx && this.tx) break
    }
    if (!this.rx || !this.tx) throw new Error('Found the adapter but not a serial characteristic on it')

    this.rx.addEventListener('characteristicvaluechanged', (e) => {
      const v = (e.target as BluetoothRemoteGATTCharacteristic).value
      if (v) this.onData(dec.decode(v))
    })
    await this.rx.startNotifications()
  }

  async write(data: string) {
    const bytes = enc.encode(data)
    // 20 byte mtu on most of these cheap adapters
    for (let i = 0; i < bytes.length; i += 20) {
      const chunk = bytes.slice(i, i + 20)
      if (this.tx!.properties.writeWithoutResponse) await this.tx!.writeValueWithoutResponse(chunk)
      else await this.tx!.writeValue(chunk)
    }
  }

  async close() {
    try {
      await this.rx?.stopNotifications()
    } catch {
      /* already gone */
    }
    this.device?.gatt?.disconnect()
  }
}

// Classic bluetooth SPP adapters pair as a COM port, and USB ones are a COM port anyway.
// chrome's web serial handles both on desktop
export class SerialTransport implements Transport {
  label = 'Serial'
  onData: (chunk: string) => void = () => {}
  onClose: () => void = () => {}
  private port?: SerialPort
  private reader?: ReadableStreamDefaultReader<Uint8Array>
  private alive = false

  constructor(private baud = 38400) {}

  async open() {
    this.port = await navigator.serial.requestPort()
    await this.port.open({ baudRate: this.baud })
    this.label = `Serial ${this.baud}`
    this.alive = true
    this.readLoop()
  }

  private async readLoop() {
    while (this.alive && this.port?.readable) {
      this.reader = this.port.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (value) this.onData(dec.decode(value))
        }
      } catch {
        break
      } finally {
        this.reader.releaseLock()
      }
    }
    if (this.alive) this.onClose()
  }

  async write(data: string) {
    const w = this.port!.writable!.getWriter()
    await w.write(enc.encode(data))
    w.releaseLock()
  }

  async close() {
    this.alive = false
    try {
      await this.reader?.cancel()
      await this.port?.close()
    } catch {
      /* ignore */
    }
  }
}
