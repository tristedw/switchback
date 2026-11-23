import { tel } from './store'
import { getSettings, profile, updateSettings } from './settings'
import { createStore } from './state'
import { logEvent } from './events'

export interface Trip {
  start: number
  end?: number
  km: number
  litres: number
  idleMs: number
  movingMs: number
  maxKmh: number
  maxEct: number
  climbM: number
}

export interface Launch {
  state: 'armed' | 'running' | 'done' | 'idle'
  startedAt?: number
  result?: number // seconds 0-100
  best?: number
}

const KEY_TRIP = 'switchback.trip'
const KEY_TRIPS = 'switchback.trips'
const KEY_LAUNCH = 'switchback.best0100'

function newTrip(now = Date.now()): Trip {
  return { start: now, km: 0, litres: 0, idleMs: 0, movingMs: 0, maxKmh: 0, maxEct: 0, climbM: 0 }
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const hasLs = typeof localStorage !== 'undefined'

export const tripStore = createStore({
  trip: hasLs ? loadJson<Trip>(KEY_TRIP, newTrip()) : newTrip(),
  history: hasLs ? loadJson<Trip[]>(KEY_TRIPS, []) : [],
  launch: { state: 'idle', best: hasLs ? loadJson<number | undefined>(KEY_LAUNCH, undefined) : undefined } as Launch,
})

// litres per hour from whatever the truck gives us
export function fuelRateLph(): number | undefined {
  const direct = tel.fresh('fuelRate', 3000)
  if (direct !== undefined) return direct
  const p = profile()
  // diesel runs way lean and the ratio swings with load, MAF math is useless there
  if (p.fuel === 'diesel') return undefined
  const maf = tel.fresh('maf', 3000)
  if (maf !== undefined) return (maf * 3600) / (14.7 * 745)
  const rpm = tel.fresh('rpm', 3000)
  const map = tel.fresh('map', 3000)
  const iat = tel.fresh('iat', 10000)
  if (rpm === undefined || map === undefined || iat === undefined) return undefined
  // speed density fallback, VE guessed at 80%
  const imap = (rpm * map) / (iat + 273.15)
  const mafEst = (imap / 120) * 0.8 * p.displacementL * (28.97 / 8.314)
  return (mafEst * 3600) / (14.7 * 745)
}

let lastTick = 0
let lastMoving = 0
let lastAlt: number | undefined
let tripSaveAt = 0

export function tickTrip(now = Date.now()) {
  const dt = lastTick ? Math.min(now - lastTick, 2000) : 0
  lastTick = now
  const st = tripStore.get()
  let trip = st.trip
  const rpm = tel.fresh('rpm', 4000)
  const kmh = tel.fresh('speed', 4000)
  const engineOn = rpm !== undefined && rpm > 300

  // auto roll to a new trip after the truck has been off for 30 min
  if (!engineOn) {
    if (trip.km > 0.5 && lastMoving && now - lastMoving > 30 * 60000) endTrip(now)
    return
  }
  lastMoving = now

  const lph = fuelRateLph()
  if (lph !== undefined) {
    tel.set('calc.lph', lph, 'calc', now)
    if (kmh !== undefined && kmh > 3) tel.set('calc.inst', (lph / kmh) * 100, 'calc', now)
  }

  const hours = dt / 3600000
  const km = (kmh ?? 0) * hours
  const alt = tel.fresh('alt', 10000)
  let climb = 0
  if (alt !== undefined && lastAlt !== undefined && alt > lastAlt) climb = alt - lastAlt
  if (alt !== undefined) lastAlt = alt

  trip = {
    ...trip,
    km: trip.km + km,
    litres: trip.litres + (lph ?? 0) * hours,
    idleMs: trip.idleMs + ((kmh ?? 0) < 2 ? dt : 0),
    movingMs: trip.movingMs + ((kmh ?? 0) >= 2 ? dt : 0),
    maxKmh: Math.max(trip.maxKmh, kmh ?? 0),
    maxEct: Math.max(trip.maxEct, tel.fresh('ect') ?? 0),
    climbM: trip.climbM + climb,
  }

  // rolling trip average and range
  if (trip.km > 1 && trip.litres > 0) {
    const avg = (trip.litres / trip.km) * 100
    tel.set('calc.avg', avg, 'calc', now)
    const fuelPct = tel.fresh('fuel', 15000)
    if (fuelPct !== undefined) tel.set('calc.range', ((fuelPct / 100) * profile().tankL) / avg * 100, 'calc', now)
  }

  tickLaunch(kmh, now)
  tripStore.set({ trip })

  if (now - tripSaveAt > 5000) {
    tripSaveAt = now
    try {
      localStorage.setItem(KEY_TRIP, JSON.stringify(trip))
    } catch {
      /* ignore */
    }
  }
}

export function endTrip(now = Date.now()) {
  const st = tripStore.get()
  const done = { ...st.trip, end: now }
  if (done.km > 0.2) {
    const history = [done, ...st.history].slice(0, 50)
    const s = getSettings()
    updateSettings({ odoKm: s.odoKm + done.km })
    logEvent('trip', `Trip ${done.km.toFixed(1)} km${done.litres > 0 ? `, ${done.litres.toFixed(1)} L` : ''}`, 'info', now)
    tripStore.set({ history })
    try {
      localStorage.setItem(KEY_TRIPS, JSON.stringify(history))
    } catch {
      /* ignore */
    }
  }
  const fresh = newTrip(now)
  tripStore.set({ trip: fresh })
  try {
    localStorage.setItem(KEY_TRIP, JSON.stringify(fresh))
  } catch {
    /* ignore */
  }
}

// ---- 0-100 timer ----

export function armLaunch() {
  const l = tripStore.get().launch
  tripStore.set({ launch: { ...l, state: 'armed', startedAt: undefined, result: undefined } })
}

export function cancelLaunch() {
  const l = tripStore.get().launch
  tripStore.set({ launch: { ...l, state: 'idle' } })
}

function tickLaunch(kmh: number | undefined, now: number) {
  const l = tripStore.get().launch
  if (kmh === undefined) return
  if (l.state === 'armed' && kmh > 1) {
    tripStore.set({ launch: { ...l, state: 'running', startedAt: now } })
  } else if (l.state === 'running' && l.startedAt) {
    if (kmh >= 100) {
      const result = (now - l.startedAt) / 1000
      const best = l.best === undefined ? result : Math.min(l.best, result)
      try {
        localStorage.setItem(KEY_LAUNCH, JSON.stringify(best))
      } catch {
        /* ignore */
      }
      logEvent('note', `0 to 100 ${result.toFixed(2)} s${best === result ? ', best' : ''}`)
      tripStore.set({ launch: { state: 'done', result, best } })
    } else if (now - l.startedAt > 60000 || kmh < 0.5) {
      tripStore.set({ launch: { ...l, state: 'idle' } })
    }
  }
}

let timer: ReturnType<typeof setInterval> | undefined
export function startTrip() {
  if (timer) return
  timer = setInterval(() => tickTrip(), 250)
}
