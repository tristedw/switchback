// Central telemetry store. Every source (elm327, homebase, sim, replay) pushes into here
// and the ui reads from it. Keeps a short ring buffer per channel for sparklines.

export type Source = 'obd' | 'esp' | 'sim' | 'replay' | 'calc'

export interface Reading {
  v: number
  t: number
  src: Source
}

const HIST_LEN = 900 // ~15 min at 1hz, or 90s at 10hz for fast obd channels

class Ring {
  t = new Float64Array(HIST_LEN)
  v = new Float32Array(HIST_LEN)
  head = 0
  size = 0

  push(t: number, v: number) {
    this.t[this.head] = t
    this.v[this.head] = v
    this.head = (this.head + 1) % HIST_LEN
    if (this.size < HIST_LEN) this.size++
  }

  // oldest -> newest, optionally only samples newer than since
  values(since = 0): { t: number[]; v: number[] } {
    const t: number[] = []
    const v: number[] = []
    const start = (this.head - this.size + HIST_LEN) % HIST_LEN
    for (let i = 0; i < this.size; i++) {
      const idx = (start + i) % HIST_LEN
      if (this.t[idx] >= since) {
        t.push(this.t[idx])
        v.push(this.v[idx])
      }
    }
    return { t, v }
  }
}

type Listener = () => void
type Tap = (key: string, r: Reading) => void

class Telemetry {
  private latest = new Map<string, Reading>()
  private hist = new Map<string, Ring>()
  private listeners = new Set<Listener>()
  private taps = new Set<Tap>()
  private dirty = false
  version = 0

  set(key: string, v: number, src: Source, t = Date.now()) {
    if (!Number.isFinite(v)) return
    const r = { v, t, src }
    this.latest.set(key, r)
    let ring = this.hist.get(key)
    if (!ring) {
      ring = new Ring()
      this.hist.set(key, ring)
    }
    ring.push(t, v)
    for (const tap of this.taps) tap(key, r)
    this.markDirty()
  }

  setMany(obj: Record<string, number | boolean | null | undefined>, src: Source, t = Date.now()) {
    for (const [k, raw] of Object.entries(obj)) {
      if (raw === null || raw === undefined) continue
      this.set(k, typeof raw === 'boolean' ? (raw ? 1 : 0) : raw, src, t)
    }
  }

  get(key: string): number | undefined {
    return this.latest.get(key)?.v
  }

  reading(key: string) {
    return this.latest.get(key)
  }

  // value only if updated recently, so a dead source shows dashes instead of a frozen number
  fresh(key: string, maxAgeMs = 5000): number | undefined {
    const r = this.latest.get(key)
    if (!r) return undefined
    return Date.now() - r.t <= maxAgeMs ? r.v : undefined
  }

  history(key: string, since = 0) {
    return this.hist.get(key)?.values(since) ?? { t: [], v: [] }
  }

  keys() {
    return [...this.latest.keys()]
  }

  clear(prefix?: string) {
    for (const k of [...this.latest.keys()]) {
      if (!prefix || k.startsWith(prefix)) {
        this.latest.delete(k)
        this.hist.delete(k)
      }
    }
    this.markDirty()
  }

  tap(fn: Tap) {
    this.taps.add(fn)
    return () => this.taps.delete(fn)
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  private markDirty() {
    if (this.dirty) return
    this.dirty = true
    // batch updates, ui redraws at most ~10x a second. gauges animate between with css
    setTimeout(() => {
      this.dirty = false
      this.version++
      for (const l of this.listeners) l()
    }, 100)
  }
}

export const tel = new Telemetry()
