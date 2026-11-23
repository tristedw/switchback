import { describe, it, expect } from 'vitest'
import { sunTimes, sunPosition, moonPhase, boilingPointC, pressureAltitude } from './sky'
import * as U from './units'

const KELOWNA = { lat: 49.888, lon: -119.496 }

describe('sky', () => {
  it('gets kelowna summer solstice sunrise roughly right', () => {
    // june 21 2026, sunrise is about 04:50 PDT = 11:50 UTC
    const t = sunTimes(Date.UTC(2026, 5, 21, 19), KELOWNA.lat, KELOWNA.lon)
    const utcH = t.sunrise!.getUTCHours() + t.sunrise!.getUTCMinutes() / 60
    expect(utcH).toBeGreaterThan(11.5)
    expect(utcH).toBeLessThan(12.2)
  })

  it('sun is high at solar noon in summer, below horizon at midnight', () => {
    const t = sunTimes(Date.UTC(2026, 5, 21, 19), KELOWNA.lat, KELOWNA.lon)
    expect(sunPosition(t.noon.getTime(), KELOWNA.lat, KELOWNA.lon).altitude).toBeGreaterThan(60)
    expect(sunPosition(t.noon.getTime() + 12 * 3600000, KELOWNA.lat, KELOWNA.lon).altitude).toBeLessThan(0)
  })

  it('moon phase lands near full on a known full moon', () => {
    // full moon 2024-01-25 17:54 utc
    const m = moonPhase(Date.UTC(2024, 0, 25, 18))
    expect(m.illumination).toBeGreaterThan(0.97)
  })

  it('water boils lower at altitude', () => {
    expect(boilingPointC(1013.25)).toBeCloseTo(100, 1)
    // coquihalla summit is ~1244 m, ~873 hPa
    expect(boilingPointC(873)).toBeLessThan(96.5)
    expect(pressureAltitude(873)).toBeGreaterThan(1150)
  })
})

describe('units', () => {
  it('flips economy the right way', () => {
    expect(U.economy(10, 'imperial')).toBeCloseTo(23.5, 1)
    expect(U.economy(10, 'metric')).toBe(10)
  })
  it('formats durations', () => {
    expect(U.fmtDuration(65000)).toBe('1:05')
    expect(U.fmtDuration(3 * 3600000 + 5 * 60000)).toBe('3h 05m')
  })
})
