import { Elm327, type Transport } from './elm'
import { PIDS, parseSupported, parseMonitorStatus } from './pids'
import { parseDtcBytes } from './dtc'
import { tel } from '../core/store'
import { app, createStore } from '../core/state'
import { logEvent } from '../core/events'
import { getSettings } from '../core/settings'

export const obdConsole = createStore({ lines: [] as string[], hz: 0 })

function consoleLine(line: string) {
  const lines = [...obdConsole.get().lines, `${new Date().toLocaleTimeString([], { hour12: false })}  ${line}`].slice(-80)
  obdConsole.set({ lines })
}

let elm: Elm327 | undefined
let running = false
let supported = new Set<number>()

export async function connectObd(t: Transport) {
  await disconnectObd()
  app.set({ obd: 'connecting', obdDetail: 'Waking adapter' })
  const e = new Elm327(t)
  e.log = consoleLine
  t.onClose = () => {
    if (running) {
      running = false
      app.set({ obd: 'error', obdDetail: 'Adapter dropped' })
      logEvent('conn', 'OBD adapter disconnected', 'warn')
    }
  }
  try {
    await e.init()
  } catch (err) {
    app.set({ obd: 'error', obdDetail: (err as Error).message })
    logEvent('conn', `OBD connect failed: ${(err as Error).message}`, 'warn')
    await e.close().catch(() => {})
    throw err
  }
  elm = e

  // walk the supported pid bitmaps. each block's last bit says if the next block exists
  supported = new Set()
  for (const base of [0x00, 0x20, 0x40]) {
    const data = await e.query(1, base).catch(() => null)
    if (!data) break
    const list = parseSupported(base, data)
    list.forEach((p) => supported.add(p))
    if (!list.includes(base + 0x20)) break
  }
  app.set({ obd: 'live', obdDetail: `${e.version} on ${e.label}, protocol ${e.protocol}`, supportedPids: [...supported] })
  logEvent('conn', `OBD connected, ${e.version}, ${supported.size} PIDs supported`)
  running = true
  loop()
}

export async function disconnectObd() {
  running = false
  if (elm) {
    await elm.close().catch(() => {})
    elm = undefined
    logEvent('conn', 'OBD disconnected')
  }
  app.set({ obd: 'off', obdDetail: '' })
}

async function loop() {
  let pass = 0
  let count = 0
  let windowStart = Date.now()
  const pids = () => PIDS.filter((p) => supported.has(p.pid))

  while (running && elm) {
    const list = pids()
    for (const p of list) {
      if (!running || !elm) return
      if (pass % p.every !== 0) continue
      try {
        const data = await elm.query(1, p.pid)
        if (data && data.length >= p.bytes) {
          tel.set(p.key, p.decode(data), 'obd')
          count++
        }
      } catch (err) {
        consoleLine(`! ${(err as Error).message}`)
      }
    }
    try {
      if (pass % 10 === 0) {
        const v = await elm.batteryVoltage()
        if (v !== undefined) tel.set('vbat', v, 'obd')
      }
      if (pass % 40 === 0) {
        const st = await elm.query(1, 0x01)
        if (st) {
          const { mil, dtcCount } = parseMonitorStatus(st)
          tel.set('mil', mil ? 1 : 0, 'obd')
          tel.set('dtcCount', dtcCount, 'obd')
        }
      }
    } catch {
      /* next pass */
    }

    pass++
    const now = Date.now()
    if (now - windowStart > 2000) {
      obdConsole.set({ hz: (count * 1000) / (now - windowStart) })
      count = 0
      windowStart = now
    }
    const wait = getSettings().pollMs
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  }
}

export async function readCodes() {
  if (!elm) throw new Error('Not connected')
  const stored = await elm.query(3, undefined, 6000)
  const pending = await elm.query(7, undefined, 6000)
  return {
    stored: stored ? parseDtcBytes(stored, elm.isCan) : [],
    pending: pending ? parseDtcBytes(pending, elm.isCan) : [],
  }
}

export async function clearCodes() {
  if (!elm) throw new Error('Not connected')
  const raw = await elm.send('04', 6000)
  if (!/44/.test(raw.replace(/\s/g, ''))) throw new Error('ECU refused the clear. Engine has to be off, key on.')
  logEvent('dtc', 'Cleared trouble codes and reset monitors', 'info')
}

export function obdConnected() {
  return running && !!elm
}
