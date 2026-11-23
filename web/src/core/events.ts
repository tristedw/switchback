import { useSyncExternalStore } from 'react'

export type Severity = 'info' | 'warn' | 'crit'

export interface LogEvent {
  id: string
  t: number
  kind: 'alarm' | 'clear' | 'trip' | 'conn' | 'guard' | 'note' | 'dtc' | 'visitor'
  sev: Severity
  text: string
}

const KEY = 'switchback.events'
const MAX = 600

function load(): LogEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

let events: LogEvent[] = typeof localStorage === 'undefined' ? [] : load()
const subs = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

export function logEvent(kind: LogEvent['kind'], text: string, sev: Severity = 'info', t = Date.now()) {
  const ev: LogEvent = { id: `${t.toString(36)}${Math.random().toString(36).slice(2, 6)}`, t, kind, sev, text }
  events = [ev, ...events].slice(0, MAX)
  subs.forEach((f) => f())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(events))
    } catch {
      /* ignore */
    }
  }, 500)
  return ev
}

export function clearEvents() {
  events = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f())
}

export function useEvents() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => events
  )
}
