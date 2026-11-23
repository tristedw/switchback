// Mode 01 PIDs we care about. formulas straight out of SAE J1979.
// key is what lands in the telemetry store.

export interface Pid {
  pid: number
  key: string
  name: string
  bytes: number
  decode: (b: number[]) => number
  // how often to poll relative to the fast loop. 1 = every pass
  every: number
}

const A = (b: number[]) => b[0]
const AB = (b: number[]) => b[0] * 256 + b[1]

export const PIDS: Pid[] = [
  { pid: 0x0c, key: 'rpm', name: 'Engine speed', bytes: 2, decode: (b) => AB(b) / 4, every: 1 },
  { pid: 0x0d, key: 'speed', name: 'Vehicle speed', bytes: 1, decode: A, every: 1 },
  { pid: 0x04, key: 'load', name: 'Calculated load', bytes: 1, decode: (b) => (A(b) * 100) / 255, every: 2 },
  { pid: 0x11, key: 'tps', name: 'Throttle position', bytes: 1, decode: (b) => (A(b) * 100) / 255, every: 2 },
  { pid: 0x10, key: 'maf', name: 'Mass airflow', bytes: 2, decode: (b) => AB(b) / 100, every: 2 },
  { pid: 0x0b, key: 'map', name: 'Manifold pressure', bytes: 1, decode: A, every: 2 },
  { pid: 0x5e, key: 'fuelRate', name: 'Engine fuel rate', bytes: 2, decode: (b) => AB(b) / 20, every: 2 },
  { pid: 0x0e, key: 'timing', name: 'Timing advance', bytes: 1, decode: (b) => A(b) / 2 - 64, every: 3 },
  { pid: 0x06, key: 'stft', name: 'Short term trim B1', bytes: 1, decode: (b) => ((A(b) - 128) * 100) / 128, every: 3 },
  { pid: 0x07, key: 'ltft', name: 'Long term trim B1', bytes: 1, decode: (b) => ((A(b) - 128) * 100) / 128, every: 6 },
  { pid: 0x08, key: 'stft2', name: 'Short term trim B2', bytes: 1, decode: (b) => ((A(b) - 128) * 100) / 128, every: 3 },
  { pid: 0x09, key: 'ltft2', name: 'Long term trim B2', bytes: 1, decode: (b) => ((A(b) - 128) * 100) / 128, every: 6 },
  { pid: 0x05, key: 'ect', name: 'Coolant temp', bytes: 1, decode: (b) => A(b) - 40, every: 5 },
  { pid: 0x5c, key: 'oilT', name: 'Oil temp', bytes: 1, decode: (b) => A(b) - 40, every: 5 },
  { pid: 0x0f, key: 'iat', name: 'Intake air temp', bytes: 1, decode: (b) => A(b) - 40, every: 5 },
  { pid: 0x2f, key: 'fuel', name: 'Fuel level', bytes: 1, decode: (b) => (A(b) * 100) / 255, every: 20 },
  { pid: 0x33, key: 'baro', name: 'Barometric pressure', bytes: 1, decode: A, every: 20 },
  { pid: 0x46, key: 'ambient', name: 'Ambient air temp', bytes: 1, decode: (b) => A(b) - 40, every: 20 },
  { pid: 0x42, key: 'ecuV', name: 'Control module voltage', bytes: 2, decode: (b) => AB(b) / 1000, every: 10 },
  { pid: 0x1f, key: 'runtime', name: 'Run time since start', bytes: 2, decode: AB, every: 20 },
  { pid: 0x23, key: 'railP', name: 'Fuel rail pressure', bytes: 2, decode: (b) => AB(b) * 10, every: 4 },
]

export const PID_BY_NUM = new Map(PIDS.map((p) => [p.pid, p]))

// parse the 4 byte bitmask from 0100 / 0120 / 0140 into supported pid numbers
export function parseSupported(base: number, bytes: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < 32; i++) {
    const byte = bytes[Math.floor(i / 8)] ?? 0
    if (byte & (0x80 >> i % 8)) out.push(base + i + 1)
  }
  return out
}

// 0101 response: MIL on bit and stored code count
export function parseMonitorStatus(bytes: number[]) {
  const a = bytes[0] ?? 0
  return { mil: (a & 0x80) !== 0, dtcCount: a & 0x7f }
}
