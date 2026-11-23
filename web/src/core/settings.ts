import { useSyncExternalStore } from 'react'

export type Units = 'metric' | 'imperial'
// dusk is the normal next look, night is the red only version for after dark
export type ThemeMode = 'auto' | 'dusk' | 'night'

export interface VehicleProfile {
  id: string
  name: string
  fuel: 'gas' | 'diesel'
  tankL: number
  redline: number
  shiftAt: number
  // displacement only used for the speed density fallback when there's no MAF
  displacementL: number
}

export const PROFILES: VehicleProfile[] = [
  { id: 'f250-60', name: 'F250 6.0 Powerstroke', fuel: 'diesel', tankL: 113, redline: 3800, shiftAt: 3300, displacementL: 6.0 },
  { id: 'tahoe-lm7', name: 'Tahoe 5.3 LM7', fuel: 'gas', tankL: 98, redline: 6000, shiftAt: 5600, displacementL: 5.3 },
  { id: 'generic-gas', name: 'Generic gas', fuel: 'gas', tankL: 80, redline: 6500, shiftAt: 6000, displacementL: 3.0 },
  { id: 'generic-diesel', name: 'Generic diesel', fuel: 'diesel', tankL: 100, redline: 4200, shiftAt: 3600, displacementL: 6.7 },
]

export interface Thresholds {
  coolantWarn: number // C
  coolantCrit: number
  oilCoolantDelta: number // C, the 6.0 oil cooler thing
  houseSocWarn: number
  houseSocCrit: number
  fridgeWarn: number
  freezeWarn: number
  gasCrit: number // % of sensor range
  blackWarn: number
  freshWarn: number
  levelTol: number // degrees
  lowFuel: number
}

export interface Settings {
  units: Units
  theme: ThemeMode
  profileId: string
  homebaseUrl: string
  pollMs: number
  lat: number
  lon: number
  sound: boolean
  quietStart: number // hour
  quietEnd: number
  solarW: number // panel rating
  freshL: number
  greyL: number
  blackL: number
  propaneKg: number // full tank net weight
  houseAh: number
  odoKm: number // odometer at last sync, trips add on top
  pitchZero: number // calibration, what the sensor reads when the camper is actually level
  rollZero: number
  thresholds: Thresholds
}

const DEFAULTS: Settings = {
  units: 'metric',
  theme: 'auto',
  profileId: 'f250-60',
  homebaseUrl: '',
  pollMs: 0,
  lat: 49.888, // kelowna
  lon: -119.496,
  sound: true,
  quietStart: 22,
  quietEnd: 7,
  solarW: 400,
  freshL: 114,
  greyL: 76,
  blackL: 60,
  propaneKg: 9.1, // 20lb bottle
  houseAh: 200,
  odoKm: 287400,
  pitchZero: 0,
  rollZero: 0,
  thresholds: {
    coolantWarn: 104,
    coolantCrit: 110,
    oilCoolantDelta: 8,
    houseSocWarn: 35,
    houseSocCrit: 20,
    fridgeWarn: 7,
    freezeWarn: 2,
    gasCrit: 35,
    blackWarn: 85,
    freshWarn: 15,
    levelTol: 1.5,
    lowFuel: 12,
  },
}

const KEY = 'switchback.settings'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULTS, ...parsed, thresholds: { ...DEFAULTS.thresholds, ...parsed.thresholds } }
    if (!['auto', 'dusk', 'night'].includes(merged.theme)) merged.theme = 'auto'
    return merged
  } catch {
    return structuredClone(DEFAULTS)
  }
}

let current: Settings = typeof localStorage === 'undefined' ? structuredClone(DEFAULTS) : load()
const subs = new Set<() => void>()

export function getSettings() {
  return current
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // private mode or full, not worth crashing over
  }
  subs.forEach((f) => f())
}

export function updateThresholds(patch: Partial<Thresholds>) {
  updateSettings({ thresholds: { ...current.thresholds, ...patch } })
}

export function resetSettings() {
  updateSettings(structuredClone(DEFAULTS))
}

export function useSettings() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current
  )
}

export function profile(s = current) {
  return PROFILES.find((p) => p.id === s.profileId) ?? PROFILES[0]
}
