import { tel } from './store'
import { getSettings } from './settings'

// least squares slope over the window, in units per hour. endpoints are too jumpy with tank senders
export function ratePerHour(key: string, windowMs: number, minSpanMs = 0) {
  const { t, v } = tel.history(key, Date.now() - windowMs)
  if (t.length < 8 || t[t.length - 1] - t[0] < minSpanMs) return undefined
  const n = t.length
  const t0 = t[0]
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0
  for (let i = 0; i < n; i++) {
    const x = (t[i] - t0) / 3600000
    sx += x
    sy += v[i]
    sxx += x * x
    sxy += x * v[i]
  }
  const den = n * sxx - sx * sx
  if (Math.abs(den) < 1e-9) return undefined
  return (n * sxy - sx * sy) / den
}

// hours until the house bank hits 0 at the current draw
export function batteryHoursLeft() {
  const soc = tel.fresh('house.soc', 30000)
  const a = tel.fresh('house.a', 30000)
  if (soc === undefined || a === undefined || a >= -0.05) return undefined
  return ((soc / 100) * getSettings().houseAh) / -a
}

export function hoursToFull() {
  const soc = tel.fresh('house.soc', 30000)
  const a = tel.fresh('house.a', 30000)
  if (soc === undefined || a === undefined || a <= 0.2) return undefined
  return (((100 - soc) / 100) * getSettings().houseAh) / a
}

// water is bursty, look at a long window and fall back to a sane guess
export function freshDaysLeft() {
  const pct = tel.fresh('fresh', 60000)
  if (pct === undefined) return undefined
  const s = getSettings()
  const litres = (pct / 100) * s.freshL
  const rate = ratePerHour('fresh', 6 * 3600000, 3600000)
  const perDay = rate !== undefined && rate < -0.05 ? ((-rate * 24) / 100) * s.freshL : 22
  return litres / perDay
}

export function propaneDaysLeft() {
  const kg = tel.fresh('propane', 60000)
  if (kg === undefined) return undefined
  const rate = ratePerHour('propane', 6 * 3600000, 3600000)
  if (rate === undefined || rate > -0.002) return undefined
  return kg / (-rate * 24)
}

export function engineOn() {
  return (tel.fresh('rpm', 4000) ?? 0) > 300
}
