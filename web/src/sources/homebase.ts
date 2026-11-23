import { tel } from '../core/store'
import { app } from '../core/state'
import { getSettings } from '../core/settings'
import { logEvent, type Severity } from '../core/events'

// homebase is the pi in the camper. it relays esp32 sensor data to every screen
// and logs everything we send it, including obd from whichever screen has the adapter.

let ws: WebSocket | undefined
let retry: ReturnType<typeof setTimeout> | undefined
let backoff = 1000
let wanted = false
let outbox: Record<string, number> = {}
let flushTimer: ReturnType<typeof setInterval> | undefined
let untap: (() => void) | undefined

function isLocalHost(h: string) {
  return h === 'localhost' || h.endsWith('.local') || /^(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)
}

export function homebaseUrl() {
  const s = getSettings()
  if (s.homebaseUrl) {
    const u = s.homebaseUrl.replace(/\/$/, '')
    return (u.startsWith('ws') ? u : u.replace(/^http/, 'ws').replace(/^(?!ws)/, 'ws://')) + '/live'
  }
  if (typeof location !== 'undefined' && isLocalHost(location.hostname)) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live`
  }
  return undefined
}

export function connectHomebase() {
  wanted = true
  const url = homebaseUrl()
  if (!url) return
  clearTimeout(retry)
  app.set({ homebase: 'connecting' })
  try {
    ws = new WebSocket(url)
  } catch {
    scheduleRetry()
    return
  }

  ws.onopen = () => {
    backoff = 1000
    app.set({ homebase: 'live' })
    logEvent('conn', 'Homebase connected')
  }

  ws.onmessage = (msg) => {
    let m: { type: string; t?: number; data?: Record<string, number>; text?: string; sev?: Severity }
    try {
      m = JSON.parse(msg.data)
    } catch {
      return
    }
    if ((m.type === 'state' || m.type === 'snapshot') && m.data) {
      tel.setMany(m.data, 'esp', m.t ?? Date.now())
    } else if (m.type === 'event' && m.text) {
      logEvent(m.text.startsWith('Motion') ? 'visitor' : 'note', m.text, m.sev ?? 'info', m.t)
    }
  }

  ws.onclose = () => {
    if (app.get().homebase === 'live') logEvent('conn', 'Homebase connection lost', 'warn')
    app.set({ homebase: wanted ? 'error' : 'off' })
    if (wanted) scheduleRetry()
  }

  ws.onerror = () => ws?.close()

  // forward obd readings in 1s batches so the pi can keep a full log
  untap?.()
  untap = tel.tap((key, r) => {
    if (r.src === 'obd' || r.src === 'calc') outbox[key] = r.v
  })
  clearInterval(flushTimer)
  flushTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN && Object.keys(outbox).length) {
      ws.send(JSON.stringify({ type: 'obd', t: Date.now(), data: outbox }))
      outbox = {}
    }
  }, 1000)
}

function scheduleRetry() {
  clearTimeout(retry)
  retry = setTimeout(connectHomebase, backoff)
  backoff = Math.min(backoff * 2, 30000)
}

export function disconnectHomebase() {
  wanted = false
  clearTimeout(retry)
  clearInterval(flushTimer)
  untap?.()
  ws?.close()
  ws = undefined
  app.set({ homebase: 'off' })
}

export function sendToHomebase(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}
