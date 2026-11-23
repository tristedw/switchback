import { tel, type Source } from './store'
import { app } from './state'
import { logEvent } from './events'

// record every reading to memory, dump as csv. long format (t,key,value) so new
// channels don't break old files. replay feeds a file back through the store.

let rows: [number, string, number, Source][] = []
let untap: (() => void) | undefined
let replayTimer: ReturnType<typeof setTimeout> | undefined

export function startRecording() {
  rows = []
  untap?.()
  untap = tel.tap((key, r) => {
    if (r.src === 'replay') return
    rows.push([r.t, key, r.v, r.src])
    // ~2 hours of a busy obd session before we start dropping the oldest
    if (rows.length > 1_500_000) rows.splice(0, 100_000)
  })
  app.set({ recording: true })
  logEvent('note', 'Recording started')
}

export function stopRecording() {
  untap?.()
  untap = undefined
  app.set({ recording: false })
  logEvent('note', `Recording stopped, ${rows.length.toLocaleString()} samples`)
  return rows.length
}

export function recordedCount() {
  return rows.length
}

export function toCsv(data = rows) {
  const out = ['t,key,value,src']
  for (const [t, k, v, src] of data) out.push(`${t},${k},${Number(v.toFixed(4))},${src}`)
  return out.join('\n')
}

export function downloadCsv(name = `switchback-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`) {
  const blob = new Blob([toCsv()], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function parseCsv(text: string) {
  const lines = text.split(/\r?\n/)
  const out: [number, string, number][] = []
  for (let i = 1; i < lines.length; i++) {
    const [t, k, v] = lines[i].split(',')
    const tn = Number(t)
    const vn = Number(v)
    if (k && Number.isFinite(tn) && Number.isFinite(vn)) out.push([tn, k, vn])
  }
  return out.sort((a, b) => a[0] - b[0])
}

export function replay(data: [number, string, number][], speed = 1, onDone?: () => void) {
  stopReplay()
  if (!data.length) return
  app.set({ replaying: true })
  const t0 = data[0][0]
  const wall0 = Date.now()
  let i = 0
  const pump = () => {
    const elapsed = (Date.now() - wall0) * speed
    while (i < data.length && data[i][0] - t0 <= elapsed) {
      tel.set(data[i][1], data[i][2], 'replay')
      i++
    }
    if (i >= data.length) {
      app.set({ replaying: false })
      onDone?.()
      return
    }
    replayTimer = setTimeout(pump, 50)
  }
  pump()
  logEvent('note', `Replaying ${data.length.toLocaleString()} samples at ${speed}x`)
}

export function stopReplay() {
  clearTimeout(replayTimer)
  if (app.get().replaying) app.set({ replaying: false })
}
