// Sun and moon math, no network needed. Based on the formulas from
// suncalc (Agafonkin) which come from the astronomy answers site. Good to about a minute.

const rad = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545
const e = rad * 23.4397

const toJulian = (ms: number) => ms / DAY_MS - 0.5 + J1970
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS)
const toDays = (ms: number) => toJulian(ms) - J2000

const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
const siderealTime = (d: number, lw: number) => rad * (280.16 + 360.9856235 * d) - lw
const altitudeOf = (H: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
const azimuthOf = (H: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi))

const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d)

function eclipticLongitude(M: number) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const P = rad * 102.9372
  return M + C + P + Math.PI
}

function sunCoords(d: number) {
  const L = eclipticLongitude(solarMeanAnomaly(d))
  return { dec: declination(L, 0), ra: rightAscension(L, 0) }
}

export interface SunPos {
  altitude: number // degrees
  azimuth: number // degrees from north, clockwise
}

export function sunPosition(ms: number, lat: number, lon: number): SunPos {
  const lw = rad * -lon
  const phi = rad * lat
  const d = toDays(ms)
  const c = sunCoords(d)
  const H = siderealTime(d, lw) - c.ra
  return {
    altitude: altitudeOf(H, phi, c.dec) / rad,
    // suncalc measures from south, shift to compass bearing
    azimuth: ((azimuthOf(H, phi, c.dec) / rad + 180) % 360 + 360) % 360,
  }
}

const J0 = 0.0009
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI))
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n
const solarTransitJ = (ds: number, M: number, L: number) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
const hourAngle = (h: number, phi: number, d: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)))

export interface SunTimes {
  noon: Date
  sunrise?: Date
  sunset?: Date
  dawn?: Date // civil
  dusk?: Date
  goldenStart?: Date // evening golden hour
  goldenEnd?: Date // morning golden hour
  nightStart?: Date // astronomical
  nightEnd?: Date
}

export function sunTimes(ms: number, lat: number, lon: number): SunTimes {
  const lw = rad * -lon
  const phi = rad * lat
  const d = toDays(ms)
  const n = julianCycle(d, lw)
  const ds = approxTransit(0, lw, n)
  const M = solarMeanAnomaly(ds)
  const L = eclipticLongitude(M)
  const dec = declination(L, 0)
  const Jnoon = solarTransitJ(ds, M, L)

  const pair = (angle: number): [Date | undefined, Date | undefined] => {
    const w = hourAngle(angle * rad, phi, dec)
    if (Number.isNaN(w)) return [undefined, undefined] // midnight sun or polar night
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L)
    const Jrise = Jnoon - (Jset - Jnoon)
    return [fromJulian(Jrise), fromJulian(Jset)]
  }

  const [sunrise, sunset] = pair(-0.833)
  const [dawn, dusk] = pair(-6)
  const [nightEnd, nightStart] = pair(-18)
  const [goldenEnd, goldenStart] = pair(6)
  return { noon: fromJulian(Jnoon), sunrise, sunset, dawn, dusk, nightEnd, nightStart, goldenEnd, goldenStart }
}

// moon phase off the mean synodic month. 0 new, 0.5 full
const SYNODIC = 29.530588853
const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14)

export function moonPhase(ms: number) {
  const days = (ms - KNOWN_NEW) / DAY_MS
  const phase = (((days / SYNODIC) % 1) + 1) % 1
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
  const name = names[Math.round(phase * 8) % 8]
  const daysToFull = ((0.5 - phase + 1) % 1) * SYNODIC
  return { phase, illumination, name, daysToFull }
}

// rough clear sky solar harvest. integrates sin(altitude) across the day, scaled by panel watts.
// derate covers panel temp, wiring, controller and the fact the panels are flat on the roof
export function solarForecastWh(dayMs: number, lat: number, lon: number, panelW: number, derate = 0.72) {
  const start = new Date(dayMs)
  start.setHours(0, 0, 0, 0)
  let wh = 0
  const stepMin = 10
  for (let m = 0; m < 1440; m += stepMin) {
    const alt = sunPosition(start.getTime() + m * 60000, lat, lon).altitude
    if (alt > 0) {
      // air mass hurts a lot near the horizon, crude but in the right ballpark
      const am = 1 / (Math.sin(alt * rad) + 0.50572 * Math.pow(alt + 6.07995, -1.6364))
      const intensity = Math.pow(0.7, Math.pow(am, 0.678))
      wh += panelW * Math.sin(alt * rad) * intensity * (stepMin / 60) / 0.7
    }
  }
  return wh * derate
}

// barometric altitude from station pressure, standard atmosphere
export function pressureAltitude(hpa: number, seaLevelHpa = 1013.25) {
  return 44330 * (1 - Math.pow(hpa / seaLevelHpa, 1 / 5.255))
}

// water boils lower up high. good enough for "why is my pasta taking forever"
export function boilingPointC(hpa: number) {
  // clausius clapeyron with water's enthalpy of vaporization
  const L = 40660
  const R = 8.314
  const T0 = 373.15
  const invT = 1 / T0 - (R / L) * Math.log(hpa / 1013.25)
  return 1 / invT - 273.15
}
