import { createStore } from './state'
import { getSettings } from './settings'
import { tripStore } from './trip'
import { logEvent } from './events'

export interface Service {
  id: string
  name: string
  everyKm: number
  lastKm: number
}

const KEY = 'switchback.service'

const DEFAULTS: Service[] = [
  { id: 'oil', name: 'Oil and filter', everyKm: 8000, lastKm: 284100 },
  { id: 'fuel', name: 'Fuel filters', everyKm: 24000, lastKm: 270500 },
  { id: 'air', name: 'Air filter', everyKm: 24000, lastKm: 279000 },
  { id: 'rotate', name: 'Rotate tires', everyKm: 10000, lastKm: 281200 },
  { id: 'trans', name: 'Trans fluid', everyKm: 48000, lastKm: 252000 },
  { id: 'diffs', name: 'Diff and transfer case fluid', everyKm: 80000, lastKm: 231000 },
]

function load(): Service[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export const service = createStore({ items: typeof localStorage === 'undefined' ? DEFAULTS : load() })

function save(items: Service[]) {
  service.set({ items })
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

export function odometer() {
  return getSettings().odoKm + tripStore.get().trip.km
}

export function markDone(id: string) {
  const odo = Math.round(odometer())
  const items = service.get().items.map((s) => (s.id === id ? { ...s, lastKm: odo } : s))
  const it = items.find((s) => s.id === id)
  if (it) logEvent('note', `${it.name} done at ${odo.toLocaleString()} km`)
  save(items)
}

export function addService(name: string, everyKm: number) {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + Date.now().toString(36)
  save([...service.get().items, { id, name, everyKm, lastKm: Math.round(odometer()) }])
}

export function removeService(id: string) {
  save(service.get().items.filter((s) => s.id !== id))
}

export function dueIn(s: Service, odo = odometer()) {
  return s.lastKm + s.everyKm - odo
}
