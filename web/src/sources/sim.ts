import { tel } from '../core/store'
import { app, type ScenarioId } from '../core/state'
import { getSettings, profile } from '../core/settings'
import { sunPosition } from '../core/sky'
import { logEvent } from '../core/events'

// Fake truck + camper so the dashboard does something without hardware.
// not a physics engine, just enough first order behaviour that the alarms trip
// for the right reasons (grades heat things up, night drains the bank, etc).

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const approach = (cur: number, target: number, tauS: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt / tauS))
const noise = (amt: number) => (Math.random() - 0.5) * 2 * amt

// kelowna monthly mean temps, close enough for "should the lines freeze tonight"
const MONTH_MEAN = [-3, -1, 4, 9, 13, 17, 21, 20, 15, 8, 2, -3]

export const SCENARIOS: { id: ScenarioId; name: string }[] = [
  { id: 'camp', name: 'Parked' },
  { id: 'idle', name: 'Cold start' },
  { id: 'town', name: 'Town' },
  { id: 'highway', name: 'Highway 97' },
  { id: 'coquihalla', name: 'Coquihalla grade' },
  { id: 'overheat', name: 'Stuck thermostat' },
  { id: 'night', name: 'Night' },
]

interface S {
  t: number // scenario seconds
  clock: number // sim wall clock ms
  engine: boolean
  speed: number
  rpm: number
  gear: number
  load: number
  ect: number
  oil: number
  iat: number
  fuel: number
  alt: number
  grade: number
  soc: number
  fresh: number
  grey: number
  black: number
  propane: number
  fridge: number
  fridgeOn: boolean
  fridgeDoor: number
  inside: number
  furnace: boolean
  camperDoor: number
  pir: number
  gas: number
  leak: boolean
  pitch: number
  roll: number
  baseRoll: number
  basePitch: number
  cloud: number
  weatherDrift: number
  nextVisitor: number
}

let s: S
let timer: ReturnType<typeof setInterval> | undefined
let last = 0
let slowAcc = 0
// timestamp to stamp readings with. only differs from now during the backfill
let stamp: number | undefined

function initial(): S {
  return {
    t: 0,
    clock: Date.now(),
    engine: false,
    speed: 0,
    rpm: 0,
    gear: 1,
    load: 0,
    ect: 12,
    oil: 12,
    iat: 10,
    fuel: 71,
    alt: 344, // kelowna
    grade: 0,
    soc: 78,
    fresh: 64,
    grey: 38,
    black: 52,
    propane: 6.2,
    fridge: 3.4,
    fridgeOn: false,
    fridgeDoor: 0,
    inside: 18,
    furnace: false,
    camperDoor: 0,
    pir: 0,
    gas: 4,
    leak: false,
    pitch: 1.2,
    roll: -1.1,
    basePitch: 1.2,
    baseRoll: -1.1,
    cloud: 0.85,
    weatherDrift: 0,
    nextVisitor: 600,
  }
}

function targetSpeed(sc: ScenarioId, t: number) {
  switch (sc) {
    case 'town': {
      // 60s cycles: stopped, launch, cruise 50-60, brake
      const c = t % 70
      if (c < 12) return 0
      if (c < 50) return c < 30 ? 50 : 60
      return 0
    }
    case 'highway':
    case 'overheat':
      return 105 + Math.sin(t / 40) * 4
    case 'coquihalla':
      return s.alt > 1230 ? 80 : 95
    default:
      return 0
  }
}

function gradeFor(sc: ScenarioId) {
  if (sc === 'coquihalla') return s.alt < 1244 ? 7.5 + Math.sin(s.t / 30) * 1.2 : -6
  if (sc === 'highway' || sc === 'overheat') return Math.sin(s.t / 90) * 2.5
  return 0
}

function step(dt: number) {
  const st = app.get()
  const sc = st.scenario
  const p = profile()
  const diesel = p.fuel === 'diesel'
  const set = getSettings()
  s.t += dt
  s.clock += dt * 1000

  const month = new Date(s.clock).getMonth()
  const hour = new Date(s.clock).getHours() + new Date(s.clock).getMinutes() / 60
  const outside = MONTH_MEAN[month] + 6 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + noise(0.1)

  const wantEngine = sc !== 'camp' && sc !== 'night'
  if (wantEngine && !s.engine) {
    s.engine = true
    s.rpm = diesel ? 1100 : 1300
  }
  if (!wantEngine && s.engine) {
    s.engine = false
    s.speed = 0
  }

  // ---- truck ----
  if (s.engine) {
    s.grade = gradeFor(sc)
    const target = targetSpeed(sc, s.t)
    const maxAccel = clamp(2.4 - s.grade * 0.18, 0.4, 3)
    const accel = clamp((target - s.speed) * 0.35, -4, maxAccel)
    s.speed = clamp(s.speed + accel * dt, 0, 160)

    const per1000 = diesel ? [8, 15, 24, 35, 47] : [10, 18, 29, 41]
    const idle = diesel ? 680 : 620
    if (s.speed < 4) {
      s.gear = 1
      const fastIdle = s.ect < 40 ? 250 : 0
      s.rpm = approach(s.rpm, idle + fastIdle, 0.6, dt) + noise(8)
    } else {
      // pick the tallest gear that keeps rpm above a sane floor, drop one on a grade
      let g = per1000.length - 1
      const floor = s.grade > 4 ? 1900 : 1300
      while (g > 0 && (s.speed / per1000[g]) * 1000 < floor) g--
      s.gear = g + 1
      s.rpm = approach(s.rpm, (s.speed / per1000[g]) * 1000, 0.4, dt) + noise(10)
    }
    s.rpm = clamp(s.rpm, 0, p.redline)

    const targetLoad = s.speed < 4 ? 17 : 22 + accel * 14 + s.grade * 6.5 + s.speed * 0.16
    s.load = clamp(approach(s.load, targetLoad, 0.5, dt) + noise(1.2), 8, 100)

    // thermostat target rises with sustained load. stuck stat scenario cooks
    const stat = (diesel ? 92 : 90) + (sc === 'overheat' ? 26 : 0)
    const heat = Math.max(0, s.load - 50) * (diesel ? 0.32 : 0.22)
    s.ect = approach(s.ect, stat + heat, s.ect < 70 ? 140 : 70, dt)
    // the 6.0 oil cooler thing: oil runs away from coolant when it's working hard
    const plugged = diesel && sc === 'coquihalla' ? 0.14 : 0.04
    s.oil = approach(s.oil, s.ect + 3 + s.load * plugged, 120, dt)
    s.iat = approach(s.iat, outside + 14 - Math.min(s.speed, 90) * 0.08, 30, dt)

    const lph = diesel ? 1.3 + (s.load / 100) * (s.rpm / 1000) * 14 : 1.6 + (s.load / 100) * (s.rpm / 1000) * 10
    s.fuel = clamp(s.fuel - ((lph * dt) / 3600 / p.tankL) * 100, 0, 100)
    s.alt = Math.max(0, s.alt + (s.speed / 3.6) * (s.grade / 100) * dt)
    s.pitch = approach(s.pitch, Math.atan(s.grade / 100) * 57.3 + noise(0.3), 1.5, dt)
    s.roll = approach(s.roll, Math.sin(s.t / 7) * 1.5 + noise(0.4), 1, dt)

    const map = diesel ? 98 + s.load * 1.25 : 28 + s.load * 0.68
    const iatK = s.iat + 273.15
    const maf = (s.rpm / 120) * 0.82 * p.displacementL * (map / iatK) * (28.97 / 8.314)
    const baroKpa = 101.325 * Math.pow(1 - 2.25577e-5 * s.alt, 5.25588)

    tel.setMany(
      {
        rpm: s.rpm,
        speed: s.speed,
        load: s.load,
        tps: clamp(s.load * 0.85 + noise(1), 0, 100),
        ect: s.ect,
        oilT: s.oil,
        iat: s.iat,
        map,
        maf: diesel ? undefined : maf,
        fuelRate: diesel ? lph : undefined,
        timing: diesel ? 4 + s.load * 0.08 : 14 + s.speed * 0.08 - s.load * 0.06 + noise(1),
        stft: diesel ? undefined : noise(3.5),
        ltft: diesel ? undefined : 2.3,
        stft2: diesel ? undefined : noise(3.5),
        ltft2: diesel ? undefined : 3.1,
        fuel: s.fuel,
        baro: baroKpa,
        ambient: outside,
        vbat: 14.15 + noise(0.05),
        ecuV: 14.05 + noise(0.05),
        runtime: s.t,
        railP: diesel ? undefined : 380 + noise(5),
        mil: 0,
        dtcCount: 0,
      },
      'sim',
      stamp
    )
  } else {
    s.ect = approach(s.ect, outside, 1800, dt)
    s.oil = approach(s.oil, outside, 2400, dt)
    s.pitch = approach(s.pitch, s.basePitch + noise(0.05), 3, dt)
    s.roll = approach(s.roll, s.baseRoll + noise(0.05), 3, dt)
  }

  // ---- camper, 1hz is plenty ----
  slowAcc += dt
  if (slowAcc < 1) return
  const sdt = slowAcc
  slowAcc = 0

  const sun = sunPosition(s.clock, set.lat, set.lon)
  s.cloud = clamp(s.cloud + noise(0.01), 0.35, 1)
  const solarW = Math.max(0, set.solarW * Math.sin((Math.max(sun.altitude, 0) * Math.PI) / 180) * s.cloud * 0.8)
  const night = sun.altitude < -6

  // inside temp and furnace
  s.furnace = s.furnace ? s.inside < 20 : s.inside < 18.5
  if (!night && !s.engine) s.furnace = false
  const sunGain = Math.max(0, sun.altitude) * 0.12
  s.inside = approach(s.inside, s.furnace ? 26 : outside + 4 + sunGain + (s.engine ? 3 : 0), 900, sdt)

  // compressor fridge with hysteresis, door kills it
  if (s.fridgeDoor && Math.random() < 0.05) s.fridgeDoor = 0
  s.fridgeOn = s.fridgeOn ? s.fridge > 2.2 : s.fridge > 4.6
  s.fridge = approach(s.fridge, s.fridgeOn ? -6 : s.inside + (s.fridgeDoor ? 6 : 0), s.fridgeOn ? 600 : 1500, sdt)

  const lightsA = night && hour > 17 && hour < 23 ? 1.4 : 0.1
  const loadsA = 0.45 + (s.fridgeOn ? 4.2 : 0) + lightsA + (s.furnace ? 2.8 : 0)
  const chargeA = solarW / 13.6 + (s.engine ? 22 : 0)
  const netA = chargeA - loadsA
  s.soc = clamp(s.soc + ((netA * sdt) / 3600 / set.houseAh) * 100, 0, 100)
  // lifepo4 is flat in the middle and falls off a cliff at the ends
  const restV = s.soc > 95 ? 13.45 : s.soc > 20 ? 13.05 + (s.soc - 20) * 0.0045 : 12.4 + s.soc * 0.032
  const houseV = restV + netA * 0.006

  if (s.furnace) s.propane = Math.max(0, s.propane - (0.24 * sdt) / 3600)

  // water use: random sink/toilet events, more in the morning and evening
  const busy = (hour > 7 && hour < 9) || (hour > 18 && hour < 21)
  if (!s.engine && Math.random() < (busy ? 0.02 : 0.004) * sdt) {
    const used = 0.6 + Math.random() * 3
    s.fresh = clamp(s.fresh - used, 0, 100)
    if (Math.random() < 0.25) s.black = clamp(s.black + used * 0.8, 0, 100)
    else s.grey = clamp(s.grey + used * 1.1, 0, 100)
  }

  // leak
  s.gas = s.leak ? clamp(s.gas + 6 * sdt, 0, 92) : approach(s.gas, 4 + noise(1), 30, sdt)

  // night visitors. deer mostly
  s.pir = 0
  if (!s.engine && night) {
    s.nextVisitor -= sdt
    if (s.nextVisitor <= 0) {
      s.pir = 1
      s.nextVisitor = 900 + Math.random() * 2400
    }
  }

  s.weatherDrift = clamp(s.weatherDrift + noise(0.02), -3, 3)
  const stationHpa = 1013.25 * Math.pow(1 - 2.25577e-5 * s.alt, 5.25588) + s.weatherDrift

  tel.setMany(
    {
      'house.soc': s.soc,
      'house.v': houseV,
      'house.a': netA,
      'solar.w': solarW,
      fresh: s.fresh,
      grey: s.grey,
      black: s.black,
      propane: s.propane,
      gas: s.gas,
      'fridge.t': s.fridge,
      'fridge.on': s.fridgeOn,
      'door.fridge': s.fridgeDoor,
      'door.camper': s.camperDoor,
      'inside.t': s.inside,
      'inside.rh': clamp(48 + (s.inside < 15 ? 12 : 0) + noise(1), 20, 95),
      'outside.t': outside,
      furnace: s.furnace,
      pressure: stationHpa,
      alt: s.alt,
      pitch: s.pitch,
      roll: s.roll,
      pir: s.pir,
    },
    'sim',
    stamp
  )
}

export function startSim() {
  if (timer) return
  s = initial()
  app.set({ sim: true })
  // backfill 10 minutes so the sparklines have something on first load
  const now = Date.now()
  const N = 600
  s.clock = now - N * 1000
  for (let i = 0; i < N; i++) {
    stamp = now - (N - i) * 1000
    step(1)
  }
  stamp = undefined
  last = performance.now()
  timer = setInterval(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.5) * app.get().warp
    last = now
    // big warps get chopped into 1s steps so the first order stuff stays stable
    let left = dt
    while (left > 0) {
      const d = Math.min(left, 1)
      step(d)
      left -= d
    }
  }, 100)
}

export function stopSim() {
  clearInterval(timer)
  timer = undefined
  app.set({ sim: false })
  tel.clear()
}

export function setScenario(id: ScenarioId) {
  const prev = app.get().scenario
  app.set({ scenario: id })
  if (!s) return
  s.t = 0
  if (id === 'night') {
    const d = new Date()
    d.setHours(23, 0, 0, 0)
    s.clock = d.getTime()
    s.nextVisitor = 40
  } else if (prev === 'night') {
    s.clock = Date.now()
  }
  if (id === 'idle') {
    s.ect = 6
    s.oil = 6
  }
  // jumps in state would wreck the trend math, start those channels fresh
  for (const k of ['alt', 'ect', 'oilT', 'pressure']) tel.clear(k)
  if (id === 'coquihalla') s.alt = 41 // hope
  if (id === 'coquihalla' || id === 'highway' || id === 'overheat' || id === 'town') {
    // these start already warm, nobody hits the coq on a cold engine
    s.ect = Math.max(s.ect, 86)
    s.oil = Math.max(s.oil, 88)
  }
  if (id === 'camp' || id === 'night') {
    s.basePitch = 0.4 + Math.random() * 1.1
    s.baseRoll = -(0.5 + Math.random() * 1.3)
  }
  logEvent('note', `Sim scenario: ${SCENARIOS.find((x) => x.id === id)?.name}`)
}

// buttons on the sim panel poke these
export const poke = {
  camperDoor() {
    if (!s) return
    s.camperDoor = 1
    setTimeout(() => s && (s.camperDoor = 0), 6000)
  },
  fridgeDoor() {
    if (s) s.fridgeDoor = 1
  },
  leak() {
    if (!s) return
    s.leak = !s.leak
  },
  visitor() {
    if (s) s.nextVisitor = 0
  },
  dumpTanks() {
    if (!s) return
    s.black = 2
    s.grey = 3
    s.fresh = 100
    logEvent('note', 'Tanks dumped, fresh filled')
  },
  storm() {
    if (s) s.weatherDrift = -3
  },
}

export function simLeaking() {
  return !!s?.leak
}

export function simClock() {
  return s?.clock ?? Date.now()
}
