import { useSyncExternalStore } from 'react'
import { tel } from './store'
import { getSettings, profile, type Settings } from './settings'
import { logEvent, type Severity } from './events'
import { app } from './state'
import { beep, doubleBeep } from './audio'
import { temp, tempUnit } from './units'
import { currentLevel } from './level'

export interface Ctx {
  g: (key: string, maxAgeMs?: number) => number | undefined
  s: Settings
  now: number
  engineOn: boolean
  active: boolean // was this rule already firing, lets rules use hysteresis
}

export interface Rule {
  id: string
  title: string
  // returns severity when tripped, null when clear
  check: (c: Ctx) => Severity | null
  detail: (c: Ctx) => string
  holdMs?: number // has to stay tripped this long before it fires
}

export interface ActiveAlarm {
  id: string
  title: string
  detail: string
  sev: Severity
  since: number
  acked: boolean
}

const T = (c: Ctx, v: number | undefined) => (v === undefined ? '--' : `${Math.round(temp(v, c.s.units))}${tempUnit(c.s.units)}`)

function inQuietHours(s: Settings, d = new Date()) {
  const h = d.getHours()
  return s.quietStart > s.quietEnd ? h >= s.quietStart || h < s.quietEnd : h >= s.quietStart && h < s.quietEnd
}

export function pressureTrend(hours = 3) {
  const { t, v } = tel.history('pressure', Date.now() - hours * 3600000)
  if (t.length < 10) return undefined
  const span = (t[t.length - 1] - t[0]) / 3600000
  if (span < 0.75) return undefined
  // normalize to hPa per 3h so a short window still means something
  return ((v[v.length - 1] - v[0]) / span) * 3
}

export const RULES: Rule[] = [
  {
    id: 'coolant',
    title: 'Coolant hot',
    holdMs: 3000,
    check: ({ g, s, active }) => {
      const v = g('ect')
      if (v === undefined) return null
      const th = s.thresholds
      if (v >= th.coolantCrit) return 'crit'
      if (v >= th.coolantWarn - (active ? 2 : 0)) return 'warn'
      return null
    },
    detail: (c) => `Coolant ${T(c, c.g('ect'))}`,
  },
  {
    id: 'oil-delta',
    title: 'Oil over coolant',
    holdMs: 60000,
    check: ({ g, s, engineOn }) => {
      const oil = g('oilT')
      const ect = g('ect')
      // only meaningful once warmed up and on a diesel, this is the classic 6.0 oil cooler symptom
      if (!engineOn || oil === undefined || ect === undefined || ect < 80 || profile(s).fuel !== 'diesel') return null
      return oil - ect > s.thresholds.oilCoolantDelta ? 'warn' : null
    },
    detail: (c) => {
      const d = (c.g('oilT') ?? 0) - (c.g('ect') ?? 0)
      return `Oil ${Math.round(c.s.units === 'imperial' ? d * 1.8 : d)}${tempUnit(c.s.units)} over coolant`
    },
  },
  {
    id: 'charging',
    title: 'Not charging',
    holdMs: 15000,
    check: ({ g, engineOn }) => {
      const v = g('vbat')
      if (!engineOn || v === undefined) return null
      return v < 13.0 ? 'warn' : null
    },
    detail: (c) => `Battery ${c.g('vbat')?.toFixed(1)} V, engine running`,
  },
  {
    id: 'house-soc',
    title: 'House battery low',
    holdMs: 30000,
    check: ({ g, s, active }) => {
      const v = g('house.soc', 30000)
      if (v === undefined) return null
      if (v <= s.thresholds.houseSocCrit) return 'crit'
      return v <= s.thresholds.houseSocWarn + (active ? 3 : 0) ? 'warn' : null
    },
    detail: (c) => `House bank ${Math.round(c.g('house.soc', 30000) ?? 0)}%`,
  },
  {
    id: 'fridge',
    title: 'Fridge warm',
    holdMs: 10 * 60000,
    check: ({ g, s }) => {
      const v = g('fridge.t', 30000)
      return v !== undefined && v > s.thresholds.fridgeWarn ? 'warn' : null
    },
    detail: (c) => `Fridge ${T(c, c.g('fridge.t', 30000))} for 10 min`,
  },
  {
    id: 'fridge-door',
    title: 'Fridge door open',
    holdMs: 90000,
    check: ({ g }) => (g('door.fridge', 30000) === 1 ? 'warn' : null),
    detail: () => 'Open 90 s',
  },
  {
    id: 'freeze',
    title: 'Freeze watch',
    holdMs: 5 * 60000,
    check: ({ g, s, active }) => {
      const v = g('outside.t', 30000)
      if (v === undefined) return null
      return v <= s.thresholds.freezeWarn + (active ? 1 : 0) ? 'info' : null
    },
    detail: (c) => `Outside ${T(c, c.g('outside.t', 30000))}`,
  },
  {
    id: 'lpg',
    title: 'Propane detected',
    holdMs: 2000,
    check: ({ g, s }) => {
      const v = g('gas', 30000)
      return v !== undefined && v >= s.thresholds.gasCrit ? 'crit' : null
    },
    detail: (c) => `Gas sensor ${Math.round(c.g('gas', 30000) ?? 0)}%`,
  },
  {
    id: 'black',
    title: 'Black tank nearly full',
    check: ({ g, s }) => {
      const v = g('black', 60000)
      return v !== undefined && v >= s.thresholds.blackWarn ? 'warn' : null
    },
    detail: (c) => `Black ${Math.round(c.g('black', 60000) ?? 0)}%`,
  },
  {
    id: 'fresh',
    title: 'Fresh water low',
    check: ({ g, s }) => {
      const v = g('fresh', 60000)
      return v !== undefined && v <= s.thresholds.freshWarn ? 'info' : null
    },
    detail: (c) => `Fresh ${Math.round(c.g('fresh', 60000) ?? 0)}%`,
  },
  {
    id: 'fuel',
    title: 'Low fuel',
    holdMs: 20000,
    check: ({ g, s }) => {
      const v = g('fuel', 15000)
      return v !== undefined && v <= s.thresholds.lowFuel ? 'warn' : null
    },
    detail: (c) => `Fuel ${Math.round(c.g('fuel', 15000) ?? 0)}%`,
  },
  {
    id: 'guard',
    title: 'Camp guard tripped',
    check: ({ g }) => {
      const st = app.get()
      // grace period after arming so you can walk away and shut the door
      if (!st.guardArmed || Date.now() - st.guardArmedAt < 30000) return null
      return g('door.camper', 10000) === 1 || g('pir', 10000) === 1 ? 'crit' : null
    },
    detail: (c) => (c.g('door.camper', 10000) === 1 ? 'Door opened' : 'Motion'),
  },
  {
    id: 'level',
    title: 'Not level',
    holdMs: 20000,
    check: ({ s, engineOn }) => {
      const { pitch: p, roll: r } = currentLevel()
      if (engineOn || p === undefined || r === undefined) return null
      return Math.max(Math.abs(p), Math.abs(r)) > s.thresholds.levelTol ? 'info' : null
    },
    detail: () => `Pitch ${currentLevel().pitch?.toFixed(1)}°, roll ${currentLevel().roll?.toFixed(1)}°`,
  },
  {
    id: 'weather',
    title: 'Pressure falling',
    check: ({ active }) => {
      const trend = pressureTrend()
      if (trend === undefined) return null
      return trend <= (active ? -2 : -3) ? 'info' : null
    },
    detail: () => `Pressure down ${Math.abs(pressureTrend() ?? 0).toFixed(1)} hPa in 3 h`,
  },
  {
    id: 'quiet',
    title: 'Idling in quiet hours',
    holdMs: 5 * 60000,
    check: ({ s, engineOn }) => (engineOn && inQuietHours(s) && (tel.fresh('speed') ?? 0) < 1 ? 'info' : null),
    detail: (c) => `Quiet hours ${c.s.quietStart}:00 to ${c.s.quietEnd}:00`,
  },
]

// ---- engine ----

const pending = new Map<string, number>() // rule id -> first tripped
let active: ActiveAlarm[] = []
const snoozed = new Map<string, number>() // rule id -> until
const subs = new Set<() => void>()
let lastBeep = 0

function emit() {
  subs.forEach((f) => f())
}

export function evaluate(now = Date.now()) {
  const s = getSettings()
  const rpm = tel.fresh('rpm', 4000)
  const engineOn = rpm !== undefined && rpm > 300
  const g = (k: string, age = 5000) => tel.fresh(k, age)
  let changed = false

  for (const rule of RULES) {
    const existing = active.find((a) => a.id === rule.id)
    const ctx: Ctx = { g, s, now, engineOn, active: !!existing }
    let sev: Severity | null = null
    try {
      sev = rule.check(ctx)
    } catch {
      sev = null
    }

    if (sev) {
      if (!pending.has(rule.id)) pending.set(rule.id, now)
      const held = now - (pending.get(rule.id) ?? now) >= (rule.holdMs ?? 0)
      if (!held) continue
      if (!existing) {
        const a: ActiveAlarm = { id: rule.id, title: rule.title, detail: rule.detail(ctx), sev, since: now, acked: false }
        active = [...active, a]
        changed = true
        logEvent(rule.id === 'guard' ? 'guard' : 'alarm', `${rule.title}, ${a.detail}`, sev, now)
        announce(rule, ctx, sev)
      } else {
        const detail = rule.detail(ctx)
        // escalation re-arms the ack so a warn that goes crit gets noticed
        if (existing.sev !== sev || existing.detail !== detail) {
          const escalated = rank(sev) > rank(existing.sev)
          active = active.map((a) => (a.id === rule.id ? { ...a, sev, detail, acked: escalated ? false : a.acked } : a))
          changed = true
          if (escalated) {
            logEvent('alarm', `${rule.title}, ${detail}`, sev, now)
            announce(rule, ctx, sev)
          }
        }
      }
    } else {
      pending.delete(rule.id)
      if (existing) {
        active = active.filter((a) => a.id !== rule.id)
        changed = true
        logEvent('clear', `${rule.title} cleared`, 'info', now)
      }
    }
  }

  // an unacked critical gets a reminder blip every couple of minutes, nothing more
  const loud = active.find((a) => a.sev === 'crit' && !a.acked && !isSnoozed(a.id, now))
  if (loud && s.sound && now - lastBeep > 120000) {
    lastBeep = now
    doubleBeep()
  }

  if (changed) emit()
}

const rank = (s: Severity) => (s === 'crit' ? 2 : s === 'warn' ? 1 : 0)

function isSnoozed(id: string, now = Date.now()) {
  return (snoozed.get(id) ?? 0) > now
}

function announce(rule: Rule, ctx: Ctx, sev: Severity) {
  if (isSnoozed(rule.id)) return
  if (!ctx.s.sound || sev === 'info') return
  if (sev === 'crit') {
    lastBeep = Date.now()
    doubleBeep()
  } else beep()
}

export function ack(id: string) {
  active = active.map((a) => (a.id === id ? { ...a, acked: true } : a))
  emit()
}

export function ackAll() {
  active = active.map((a) => ({ ...a, acked: true }))
  emit()
}

export function snooze(id: string, minutes: number) {
  snoozed.set(id, Date.now() + minutes * 60000)
  ack(id)
}

export function useAlarms() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => active
  )
}

let timer: ReturnType<typeof setInterval> | undefined
export function startAlarms() {
  if (timer) return
  timer = setInterval(() => evaluate(), 1000)
}

// test hook
export function _resetAlarms() {
  active = []
  pending.clear()
  snoozed.clear()
}
