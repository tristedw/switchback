// DTC decode for mode 03 / 07 responses plus a short list of generic code meanings.
// only generic SAE codes here. manufacturer specific ones (P1xxx etc) show as unknown.

const LETTER = ['P', 'C', 'B', 'U']

export function decodeDtc(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null
  const letter = LETTER[a >> 6]
  const d1 = (a >> 4) & 0x3
  const d2 = a & 0xf
  return `${letter}${d1}${d2.toString(16)}${b.toString(16).padStart(2, '0')}`.toUpperCase()
}

// bytes is the data after the mode byte (43 / 47). CAN adds a count byte first,
// older protocols don't, so callers tell us which one we're on
export function parseDtcBytes(bytes: number[], hasCountByte: boolean): string[] {
  const data = hasCountByte ? bytes.slice(1) : bytes
  const out: string[] = []
  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = decodeDtc(data[i], data[i + 1])
    if (code && !out.includes(code)) out.push(code)
  }
  return out
}

export const DTC_TEXT: Record<string, string> = {
  P0016: 'Crank and cam position correlation, bank 1 sensor A',
  P0101: 'Mass airflow sensor range or performance',
  P0102: 'Mass airflow sensor circuit low',
  P0103: 'Mass airflow sensor circuit high',
  P0106: 'Manifold pressure sensor range or performance',
  P0113: 'Intake air temp sensor circuit high',
  P0117: 'Coolant temp sensor circuit low',
  P0118: 'Coolant temp sensor circuit high',
  P0128: 'Coolant below thermostat regulating temp',
  P0171: 'System too lean, bank 1',
  P0172: 'System too rich, bank 1',
  P0174: 'System too lean, bank 2',
  P0175: 'System too rich, bank 2',
  P0234: 'Turbo or supercharger overboost',
  P0299: 'Turbo or supercharger underboost',
  P0300: 'Random or multiple cylinder misfire',
  P0301: 'Cylinder 1 misfire',
  P0302: 'Cylinder 2 misfire',
  P0303: 'Cylinder 3 misfire',
  P0304: 'Cylinder 4 misfire',
  P0305: 'Cylinder 5 misfire',
  P0306: 'Cylinder 6 misfire',
  P0307: 'Cylinder 7 misfire',
  P0308: 'Cylinder 8 misfire',
  P0335: 'Crank position sensor A circuit',
  P0340: 'Cam position sensor A circuit, bank 1',
  P0380: 'Glow plug circuit A',
  P0401: 'EGR flow insufficient',
  P0402: 'EGR flow excessive',
  P0420: 'Catalyst efficiency below threshold, bank 1',
  P0430: 'Catalyst efficiency below threshold, bank 2',
  P0440: 'Evap system malfunction',
  P0442: 'Evap system small leak',
  P0446: 'Evap vent control circuit',
  P0455: 'Evap system large leak',
  P0470: 'Exhaust pressure sensor',
  P0471: 'Exhaust pressure sensor range or performance',
  P0500: 'Vehicle speed sensor A',
  P0505: 'Idle air control system',
  P0506: 'Idle speed lower than expected',
  P0507: 'Idle speed higher than expected',
  P0562: 'System voltage low',
  P0563: 'System voltage high',
  P0603: 'Control module keep alive memory error',
  P0611: 'Fuel injector control module performance',
  P0700: 'Transmission control system, check TCM codes',
  P0741: 'Torque converter clutch performance or stuck off',
  P2290: 'Injector control pressure too low',
  P2291: 'Injector control pressure too low during cranking',
  U0100: 'Lost communication with ECM/PCM',
}

export function describe(code: string) {
  if (DTC_TEXT[code]) return DTC_TEXT[code]
  if (code[1] === '1' || code[1] === '3') return 'Manufacturer specific'
  return 'Not in local list'
}

export function system(code: string) {
  return { P: 'Powertrain', C: 'Chassis', B: 'Body', U: 'Network' }[code[0]] ?? 'Unknown'
}
