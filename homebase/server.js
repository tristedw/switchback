// Switchback homebase. Lives on the pi in the camper.
//
//   ESP32  --POST /api/ingest-->  homebase  --ws /live-->  every screen
//   dashboard with the obd adapter  --ws {type:'obd'}-->  homebase (logged)
//
// Everything that comes in gets appended to data/YYYY-MM-DD.jsonl so there's a
// full history even when no screen is open.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const DATA = process.env.DATA_DIR || path.join(here, 'data')
const WEB = process.env.WEB_DIR || path.join(here, '..', 'web', 'dist')
const TOKEN = process.env.INGEST_TOKEN || '' // set the same in the esp32 config if you want it
const NTFY = process.env.NTFY_TOPIC || '' // ntfy.sh topic for phone alerts when you're away

fs.mkdirSync(DATA, { recursive: true })

const state = {} // latest value per key
const stamps = {} // when each key last changed
let guardArmed = false
let guardArmedAt = 0

// ---------- logging ----------

let logDay = ''
let logStream
function log(rec) {
  const day = new Date().toISOString().slice(0, 10)
  if (day !== logDay) {
    logStream?.end()
    logDay = day
    logStream = fs.createWriteStream(path.join(DATA, `${day}.jsonl`), { flags: 'a' })
  }
  logStream.write(JSON.stringify(rec) + '\n')
}

// ---------- notifications ----------

const lastNotify = {}
async function notify(id, title, body, priority = 'high') {
  if (!NTFY) return
  // one ping per thing per 10 min, nobody wants 40 propane alerts
  if (Date.now() - (lastNotify[id] || 0) < 10 * 60000) return
  lastNotify[id] = Date.now()
  try {
    await fetch(`https://ntfy.sh/${NTFY}`, { method: 'POST', body, headers: { Title: title, Priority: priority, Tags: 'rotating_light' } })
  } catch (e) {
    console.warn('ntfy failed', e.message)
  }
}

// ---------- server side rules ----------
// the dashboard has the full alarm engine. these are just the ones that matter
// when nobody's looking at a screen

let lastPir = 0
let lastVisitorLog = 0
function rules(patch, t) {
  if (patch.gas !== undefined && patch.gas >= 35) notify('gas', 'Propane detected', `Gas sensor at ${Math.round(patch.gas)}%. Camper needs venting.`, 'urgent')
  if (patch['house.soc'] !== undefined && patch['house.soc'] <= 15) notify('soc', 'House battery low', `House bank at ${Math.round(patch['house.soc'])}%.`)
  if (patch['fridge.t'] !== undefined && patch['fridge.t'] > 10) notify('fridge', 'Fridge warm', `Fridge at ${patch['fridge.t'].toFixed(1)}°C.`, 'default')

  const armedLongEnough = guardArmed && t - guardArmedAt > 30000
  if (armedLongEnough && (patch['door.camper'] === 1 || patch.pir === 1)) {
    const what = patch['door.camper'] === 1 ? 'Camper door opened' : 'Motion at the camper'
    notify('guard', 'Camp guard tripped', `${what} at ${new Date(t).toLocaleTimeString()}.`, 'urgent')
    event(`Guard: ${what}`, 'crit', t)
  }

  if (patch.pir !== undefined) {
    if (patch.pir === 1 && lastPir === 0 && t - lastVisitorLog > 120000) {
      const h = new Date(t).getHours()
      if (h >= 21 || h < 6) {
        lastVisitorLog = t
        event('Motion outside', 'info', t)
      }
    }
    lastPir = patch.pir
  }
}

// ---------- ws ----------

const server = http.createServer(handle)
const wss = new WebSocketServer({ server, path: '/live' })

function broadcast(msg, except) {
  const s = JSON.stringify(msg)
  for (const c of wss.clients) if (c !== except && c.readyState === 1) c.send(s)
}

function event(text, sev = 'info', t = Date.now()) {
  log({ t, event: text, sev })
  broadcast({ type: 'event', t, text, sev })
}

function ingest(patch, source, t = Date.now(), except) {
  const clean = {}
  for (const [k, v] of Object.entries(patch)) {
    const n = typeof v === 'boolean' ? Number(v) : Number(v)
    if (!Number.isFinite(n) || k.length > 40) continue
    clean[k] = n
    state[k] = n
    stamps[k] = t
  }
  if (!Object.keys(clean).length) return
  log({ t, src: source, d: clean })
  // obd comes from a dashboard, everyone else already has it from their own tap
  broadcast({ type: 'state', t, data: clean }, source === 'obd' ? except : undefined)
  rules(clean, t)
}

wss.on('connection', (ws) => {
  // send whatever's fresh so a screen coming online isn't blank
  const now = Date.now()
  const snap = {}
  for (const [k, v] of Object.entries(state)) if (now - stamps[k] < 120000) snap[k] = v
  ws.send(JSON.stringify({ type: 'snapshot', t: now, data: snap }))

  ws.on('message', (raw) => {
    let m
    try {
      m = JSON.parse(raw)
    } catch {
      return
    }
    if (m.type === 'obd' && m.data) ingest(m.data, 'obd', m.t || Date.now(), ws)
    if (m.type === 'guard') {
      guardArmed = !!m.armed
      guardArmedAt = Date.now()
      event(guardArmed ? 'Guard armed' : 'Guard off')
    }
  })
})

// ---------- http ----------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(body))
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('too big'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })
}

// pull a key out of the last couple days of logs, bucketed so a 24h query isn't 80k points
function history(key, hours) {
  const since = Date.now() - hours * 3600000
  const bucketMs = Math.max(1000, (hours * 3600000) / 600)
  const days = new Set([new Date(since).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)])
  const buckets = new Map()
  for (const day of days) {
    const file = path.join(DATA, `${day}.jsonl`)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes(`"${key}"`)) continue
      try {
        const r = JSON.parse(line)
        if (r.t < since || r.d?.[key] === undefined) continue
        const b = Math.floor(r.t / bucketMs) * bucketMs
        const cur = buckets.get(b) || [0, 0]
        buckets.set(b, [cur[0] + r.d[key], cur[1] + 1])
      } catch {
        /* torn line from a power cut, skip it */
      }
    }
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, [sum, n]]) => [t, +(sum / n).toFixed(3)])
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x')

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-token' })
    return res.end()
  }

  if (url.pathname === '/api/ingest' && req.method === 'POST') {
    if (TOKEN && req.headers['x-token'] !== TOKEN) return json(res, 401, { error: 'bad token' })
    try {
      const body = JSON.parse(await readBody(req))
      ingest(body.data || body, 'esp')
      return json(res, 200, { ok: true })
    } catch (e) {
      return json(res, 400, { error: e.message })
    }
  }

  if (url.pathname === '/api/state') return json(res, 200, { t: Date.now(), state, stamps, guardArmed })

  if (url.pathname === '/api/history') {
    const key = url.searchParams.get('key')
    const hours = Math.min(72, Number(url.searchParams.get('hours') || 6))
    if (!key) return json(res, 400, { error: 'key required' })
    return json(res, 200, { key, hours, points: history(key, hours) })
  }

  if (url.pathname === '/api/days') {
    return json(res, 200, fs.readdirSync(DATA).filter((f) => f.endsWith('.jsonl')).map((f) => ({ day: f.slice(0, 10), bytes: fs.statSync(path.join(DATA, f)).size })))
  }

  // static dashboard
  let file = path.normalize(path.join(WEB, decodeURIComponent(url.pathname)))
  if (!file.startsWith(WEB)) return json(res, 403, { error: 'nope' })
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end('Homebase is up. Build the dashboard with `npm run build` in web/ to serve it from here.')
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

server.listen(PORT, () => {
  console.log(`homebase on :${PORT}, logging to ${DATA}${NTFY ? `, alerts to ntfy.sh/${NTFY}` : ''}`)
})
