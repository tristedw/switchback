import { describe, it, expect } from 'vitest'
import { extractPayload, cleanLines } from './elm'
import { PID_BY_NUM, parseSupported, parseMonitorStatus } from './pids'
import { decodeDtc, parseDtcBytes, describe as dtcText } from './dtc'

describe('elm response parsing', () => {
  it('pulls rpm out of a plain response', () => {
    const data = extractPayload('410C1AF8\r\r>', 1, 0x0c)
    expect(data).toEqual([0x1a, 0xf8])
    expect(PID_BY_NUM.get(0x0c)!.decode(data!)).toBe(1726)
  })

  it('handles spaces, echo junk and SEARCHING', () => {
    const raw = 'SEARCHING...\r41 05 7B \r\r>'
    expect(extractPayload(raw, 1, 0x05)).toEqual([0x7b])
    expect(PID_BY_NUM.get(0x05)!.decode([0x7b])).toBe(83)
  })

  it('takes the first ecu that answers with the right header', () => {
    const raw = '7E8 03 41 0D 00\r410D3C\r>'
    // headers off is the normal case, but make sure a stray line doesn't confuse it
    expect(extractPayload('410D3C\r410D3D\r>', 1, 0x0d)).toEqual([0x3c])
    expect(extractPayload(raw, 1, 0x0d)).not.toBeNull()
  })

  it('returns null on NO DATA', () => {
    expect(extractPayload('NO DATA\r\r>', 1, 0x5c)).toBeNull()
    expect(extractPayload('UNABLE TO CONNECT\r>', 1, 0x00)).toBeNull()
  })

  it('stitches iso-tp multi frame lines', () => {
    const raw = '00A\r0: 43 04 01 33 02 21\r1: 04 71 01 01 00 00 00\r\r>'
    const data = extractPayload(raw, 3)
    expect(data!.slice(0, 5)).toEqual([0x04, 0x01, 0x33, 0x02, 0x21])
  })

  it('cleanLines drops prompt and blank lines', () => {
    expect(cleanLines('ELM327 v1.5\r\r>')).toEqual(['ELM327 v1.5'])
  })
})

describe('pids', () => {
  it('parses the supported bitmap', () => {
    // BE 3E B8 11 is what a lot of GM trucks answer
    const list = parseSupported(0, [0xbe, 0x3e, 0xb8, 0x11])
    expect(list).toContain(0x01)
    expect(list).toContain(0x0c)
    expect(list).toContain(0x0d)
    expect(list).toContain(0x20)
    expect(list).not.toContain(0x02)
  })

  it('decodes fuel trims around zero', () => {
    const trim = PID_BY_NUM.get(0x06)!
    expect(trim.decode([128])).toBe(0)
    expect(trim.decode([0])).toBe(-100)
  })

  it('reads mil status', () => {
    expect(parseMonitorStatus([0x83, 0, 0, 0])).toEqual({ mil: true, dtcCount: 3 })
    expect(parseMonitorStatus([0x00, 0, 0, 0])).toEqual({ mil: false, dtcCount: 0 })
  })
})

describe('dtc', () => {
  it('decodes letter and digits', () => {
    expect(decodeDtc(0x01, 0x33)).toBe('P0133')
    expect(decodeDtc(0x04, 0x71)).toBe('P0471')
    expect(decodeDtc(0x22, 0x90)).toBe('P2290')
    expect(decodeDtc(0xc1, 0x00)).toBe('U0100')
    expect(decodeDtc(0x41, 0x23)).toBe('C0123')
    expect(decodeDtc(0, 0)).toBeNull()
  })

  it('handles can count byte vs legacy padding', () => {
    expect(parseDtcBytes([0x02, 0x01, 0x33, 0x04, 0x71], true)).toEqual(['P0133', 'P0471'])
    expect(parseDtcBytes([0x01, 0x33, 0x00, 0x00, 0x00, 0x00], false)).toEqual(['P0133'])
  })

  it('knows the 6.0 classics', () => {
    expect(dtcText('P0471')).toMatch(/exhaust pressure/i)
    expect(dtcText('P1316')).toMatch(/manufacturer/i)
  })
})
