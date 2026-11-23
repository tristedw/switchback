import type { Units } from './settings'

// everything internal is metric. only convert at the edge for display

export const temp = (c: number, u: Units) => (u === 'imperial' ? c * 1.8 + 32 : c)
export const tempUnit = (u: Units) => (u === 'imperial' ? '°F' : '°C')
// for deltas, no +32
export const tempDelta = (c: number, u: Units) => (u === 'imperial' ? c * 1.8 : c)

export const speed = (kmh: number, u: Units) => (u === 'imperial' ? kmh * 0.621371 : kmh)
export const speedUnit = (u: Units) => (u === 'imperial' ? 'mph' : 'km/h')

export const dist = (km: number, u: Units) => (u === 'imperial' ? km * 0.621371 : km)
export const distUnit = (u: Units) => (u === 'imperial' ? 'mi' : 'km')

export const vol = (l: number, u: Units) => (u === 'imperial' ? l * 0.264172 : l)
export const volUnit = (u: Units) => (u === 'imperial' ? 'gal' : 'L')

export const mass = (kg: number, u: Units) => (u === 'imperial' ? kg * 2.20462 : kg)
export const massUnit = (u: Units) => (u === 'imperial' ? 'lb' : 'kg')

export const pressure = (kpa: number, u: Units) => (u === 'imperial' ? kpa * 0.145038 : kpa)
export const pressureUnit = (u: Units) => (u === 'imperial' ? 'psi' : 'kPa')

export const alt = (m: number, u: Units) => (u === 'imperial' ? m * 3.28084 : m)
export const altUnit = (u: Units) => (u === 'imperial' ? 'ft' : 'm')

// L/100km vs US mpg. note these go opposite directions, lower is better for metric
export function economy(lPer100: number, u: Units) {
  if (u === 'imperial') return lPer100 > 0 ? 235.215 / lPer100 : 0
  return lPer100
}
export const economyUnit = (u: Units) => (u === 'imperial' ? 'mpg' : 'L/100km')

export function fmt(v: number | undefined, digits = 0) {
  if (v === undefined || !Number.isFinite(v)) return '--'
  return v.toFixed(digits)
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function fmtClock(d: Date | number | undefined) {
  if (d === undefined) return '--:--'
  const date = typeof d === 'number' ? new Date(d) : d
  if (isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
