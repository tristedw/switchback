// ELM327 command layer. Talks text over whatever transport (BLE or serial),
// one command at a time, waits for the '>' prompt.

export interface Transport {
  label: string
  open(): Promise<void>
  write(data: string): Promise<void>
  close(): Promise<void>
  onData: (chunk: string) => void
  onClose: () => void
}

export class ElmError extends Error {}

const ERRORS = ['NO DATA', 'UNABLE TO CONNECT', 'CAN ERROR', 'BUS ERROR', 'BUS BUSY', 'STOPPED', 'FB ERROR', 'DATA ERROR', 'ERR', '?']

export function cleanLines(raw: string): string[] {
  return raw
    .replace(/>/g, '')
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^SEARCHING/i.test(l) && !/^BUS INIT/i.test(l))
}

export function isError(lines: string[]) {
  return lines.find((l) => ERRORS.some((e) => l.toUpperCase().startsWith(e)))
}

function hexBytes(s: string): number[] {
  const clean = s.replace(/[^0-9A-Fa-f]/g, '')
  const out: number[] = []
  for (let i = 0; i + 1 < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16))
  return out
}

// pulls the data bytes for a mode/pid out of a raw response. handles multiple ecus answering
// (takes the first one with the right header) and iso-tp multi frame lines like "0: 43 06 ..."
export function extractPayload(raw: string, mode: number, pid?: number): number[] | null {
  const lines = cleanLines(raw)
  if (isError(lines)) return null
  const want = [0x40 + mode, ...(pid === undefined ? [] : [pid])]

  const multi = lines.some((l) => /^[0-9A-F]:/i.test(l))
  if (multi) {
    const bytes = lines
      .filter((l) => /^[0-9A-F]:/i.test(l))
      .flatMap((l) => hexBytes(l.slice(2)))
    const idx = findSeq(bytes, want)
    return idx < 0 ? null : bytes.slice(idx + want.length)
  }

  for (const line of lines) {
    const bytes = hexBytes(line)
    const idx = findSeq(bytes, want)
    if (idx >= 0) return bytes.slice(idx + want.length)
  }
  return null
}

function findSeq(arr: number[], seq: number[]) {
  outer: for (let i = 0; i <= arr.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (arr[i + j] !== seq[j]) continue outer
    return i
  }
  return -1
}

interface Pending {
  cmd: string
  resolve: (s: string) => void
  reject: (e: Error) => void
  timeout: number
}

export class Elm327 {
  private buf = ''
  private queue: Pending[] = []
  private current?: Pending
  private timer?: ReturnType<typeof setTimeout>
  version = ''
  protocol = ''
  isCan = true
  log: (line: string) => void = () => {}

  constructor(private t: Transport) {
    t.onData = (chunk) => this.onChunk(chunk)
  }

  get label() {
    return this.t.label
  }

  async init() {
    await this.t.open()
    // some clones need a reset twice, the first one gets eaten
    await this.send('ATZ', 4000).catch(() => this.send('ATZ', 4000))
    for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATAT1', 'ATSP0']) await this.send(c, 2000)
    this.version = cleanLines(await this.send('ATI', 2000))[0] ?? 'ELM327'
    // first real request kicks off the protocol search, can take a few seconds
    const r = await this.send('0100', 12000)
    if (!extractPayload(r, 1, 0)) throw new ElmError('ECU did not answer. Key on?')
    const dp = cleanLines(await this.send('ATDPN', 2000))[0] ?? ''
    const num = parseInt(dp.replace(/^A/i, ''), 16)
    this.protocol = dp
    this.isCan = num >= 6 && num <= 9
  }

  send(cmd: string, timeout = 3000): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject, timeout })
      this.pump()
    })
  }

  async query(mode: number, pid?: number, timeout = 3000) {
    const cmd = mode.toString(16).padStart(2, '0') + (pid === undefined ? '' : pid.toString(16).padStart(2, '0'))
    const raw = await this.send(cmd.toUpperCase(), timeout)
    return extractPayload(raw, mode, pid)
  }

  async batteryVoltage() {
    const r = cleanLines(await this.send('ATRV', 2000))[0] ?? ''
    const v = parseFloat(r)
    return Number.isFinite(v) ? v : undefined
  }

  async close() {
    this.queue.forEach((p) => p.reject(new ElmError('closed')))
    this.queue = []
    await this.t.close()
  }

  private pump() {
    if (this.current || !this.queue.length) return
    const p = this.queue.shift()!
    this.current = p
    this.buf = ''
    this.log(`> ${p.cmd}`)
    this.timer = setTimeout(() => this.finish(new ElmError(`timeout on ${p.cmd}`)), p.timeout)
    this.t.write(p.cmd + '\r').catch((e) => this.finish(e))
  }

  private onChunk(chunk: string) {
    this.buf += chunk
    if (this.buf.includes('>')) this.finish()
  }

  private finish(err?: Error) {
    clearTimeout(this.timer)
    const p = this.current
    this.current = undefined
    if (!p) return
    if (err) p.reject(err)
    else {
      this.log(`< ${this.buf.replace(/[\r\n]+/g, ' ').trim()}`)
      p.resolve(this.buf)
    }
    this.buf = ''
    this.pump()
  }
}
