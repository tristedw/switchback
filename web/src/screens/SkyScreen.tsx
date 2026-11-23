import { Panel, Readout } from '../ui/Readout'
import { Spark } from '../ui/Spark'
import { useNow, useTel } from '../ui/hooks'
import { useSettings, updateSettings } from '../core/settings'
import * as U from '../core/units'
import { sunPosition, sunTimes, moonPhase, solarForecastWh, pressureAltitude, boilingPointC } from '../core/sky'
import { pressureTrend } from '../core/alarms'
import { useState } from 'react'

function SunArc({ now, lat, lon }: { now: number; lat: number; lon: number }) {
  // window is centred on solar noon so the curve is always symmetric, whatever timezone the screen is in
  const times = sunTimes(now, lat, lon)
  const start = times.noon.getTime() - 12 * 3600000
  const W = 1000
  const H = 210
  const horizon = 120
  // scale to today's peak so a november sun doesn't sit flat on the floor
  const peak = Math.max(25, sunPosition(times.noon.getTime(), lat, lon).altitude + 6)
  const y = (alt: number) => (alt >= 0 ? horizon - (alt / peak) * (horizon - 30) : horizon - (alt / 70) * (H - horizon - 12))
  const x = (ms: number) => ((ms - start) / 86400000) * W
  const clampX = (v: number) => Math.min(W - 34, Math.max(34, v))

  let d = ''
  for (let m = 0; m <= 1440; m += 10) {
    const ms = start + m * 60000
    d += `${m ? 'L' : 'M'}${x(ms).toFixed(1)},${y(sunPosition(ms, lat, lon).altitude).toFixed(1)}`
  }
  const cur = sunPosition(now, lat, lon)
  const mark = (dt: Date | undefined, label: string) => {
    if (!dt) return null
    const mx = x(dt.getTime())
    return (
      <g key={label}>
        <line x1={mx} x2={mx} y1={horizon - 6} y2={horizon + 6} stroke="var(--ink-2)" strokeWidth="1.5" />
        <text x={clampX(mx)} y={horizon + 26} textAnchor="middle" className="arc-label num">
          {U.fmtClock(dt)}
        </text>
        <text x={clampX(mx)} y={horizon + 44} textAnchor="middle" className="arc-label faint">
          {label}
        </text>
      </g>
    )
  }
  const cx = x(now)
  const cy = y(cur.altitude)

  return (
    <svg className="sunarc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sun is ${cur.altitude.toFixed(0)} degrees ${cur.altitude >= 0 ? 'above' : 'below'} the horizon`}>
      <defs>
        <clipPath id="above">
          <rect x="0" y="0" width={W} height={horizon} />
        </clipPath>
      </defs>
      <rect x="0" y={horizon} width={W} height={H - horizon} fill="var(--panel-2)" />
      <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="3 5" />
      <path d={d} fill="none" stroke="var(--power)" strokeWidth="3.5" clipPath="url(#above)" />
      <line x1="0" x2={W} y1={horizon} y2={horizon} stroke="var(--ink-2)" strokeWidth="1.5" />
      {mark(times.sunrise, 'sunrise')}
      {mark(times.noon, 'solar noon')}
      {mark(times.sunset, 'sunset')}
      <circle cx={cx} cy={cy} r="11" fill={cur.altitude > 0 ? 'var(--power)' : 'var(--ink-3)'} stroke="var(--panel)" strokeWidth="4" />
      <text x={clampX(cx)} y={cy - 20} textAnchor="middle" className="arc-label num">
        {cur.altitude.toFixed(0)}°
      </text>
    </svg>
  )
}

function Moon({ phase }: { phase: number }) {
  // terminator is an ellipse whose x radius goes r -> 0 -> r over each half
  const r = 40
  const k = Math.cos(phase * 2 * Math.PI) // 1 new, -1 full
  const waxing = phase < 0.5
  const rx = Math.abs(k) * r
  // lit side path: half circle on the lit side plus the terminator ellipse
  const sweepOuter = waxing ? 1 : 0
  const sweepInner = k > 0 ? (waxing ? 0 : 1) : waxing ? 1 : 0
  const d = `M50 ${50 - r} A${r} ${r} 0 0 ${sweepOuter} 50 ${50 + r} A${rx} ${r} 0 0 ${sweepInner} 50 ${50 - r} Z`
  return (
    <svg className="moon" viewBox="0 0 100 100" role="img" aria-label="Moon phase">
      <circle cx="50" cy="50" r={r} fill="var(--moon-dark)" stroke="var(--rule)" strokeWidth="1.5" />
      <path d={d} fill="var(--moon-lit)" />
    </svg>
  )
}

export function SkyScreen() {
  const s = useSettings()
  const tel = useTel()
  const now = useNow(60000)
  const [locMsg, setLocMsg] = useState('')
  const u = s.units
  const t = sunTimes(now, s.lat, s.lon)
  const yest = sunTimes(now - 86400000, s.lat, s.lon)
  const dayLen = t.sunrise && t.sunset ? t.sunset.getTime() - t.sunrise.getTime() : undefined
  const yLen = yest.sunrise && yest.sunset ? yest.sunset.getTime() - yest.sunrise.getTime() : undefined
  const diffMin = dayLen !== undefined && yLen !== undefined ? Math.round((dayLen - yLen) / 60000) : undefined
  const moon = moonPhase(now)
  const forecast = solarForecastWh(now, s.lat, s.lon, s.solarW)
  const hpa = tel.fresh('pressure', 60000) ?? (tel.fresh('baro', 30000) !== undefined ? tel.fresh('baro', 30000)! * 10 : undefined)
  const trend = pressureTrend()


  const locate = () => {
    if (!navigator.geolocation) return setLocMsg('No location on this device.')
    setLocMsg('Locating')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        updateSettings({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) })
        setLocMsg('Updated.')
      },
      () => setLocMsg('Location blocked'),
      { timeout: 10000 }
    )
  }

  return (
    <div className="screen sky-screen">
      <Panel primary title="Sun today" className="sun" aside={<button className="text-btn" onClick={locate}>{locMsg || `${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}`}</button>}>
        <SunArc now={now} lat={s.lat} lon={s.lon} />
        <dl className="stats cols">
          <dt>First light</dt>
          <dd className="num">{U.fmtClock(t.dawn)}</dd>
          <dt>Sunrise</dt>
          <dd className="num">{U.fmtClock(t.sunrise)}</dd>
          <dt>Solar noon</dt>
          <dd className="num">{U.fmtClock(t.noon)}</dd>
          <dt>Golden hour</dt>
          <dd className="num">{U.fmtClock(t.goldenStart)}</dd>
          <dt>Sunset</dt>
          <dd className="num">{U.fmtClock(t.sunset)}</dd>
          <dt>Last light</dt>
          <dd className="num">{U.fmtClock(t.dusk)}</dd>
          <dt>Proper dark</dt>
          <dd className="num">{U.fmtClock(t.nightStart)}</dd>
          <dt>Daylight</dt>
          <dd className="num">
            {dayLen ? U.fmtDuration(dayLen) : '--'}
            {diffMin !== undefined && <span className="faint"> {diffMin >= 0 ? `+${diffMin}` : diffMin} min</span>}
          </dd>
        </dl>
      </Panel>

      <Panel title="Moon" className="moon-panel">
        <div className="moon-row">
          <Moon phase={moon.phase} />
          <div>
            <p className="big">{moon.name}</p>
            <p className="muted num">{Math.round(moon.illumination * 100)}% lit</p>
            <p className="muted num">{moon.daysToFull < 1 || moon.daysToFull > 28.5 ? 'Full tonight' : moon.daysToFull < 1.5 ? 'Full tomorrow' : `Full in ${Math.round(moon.daysToFull)} days`}</p>
          </div>
        </div>
      </Panel>

      <Panel title="Barometer">
        <div className="readout-grid two">
          <Readout label="Station pressure" value={hpa} unit="hPa" digits={1} />
          <Readout label="3 hour trend" value={trend} unit="hPa" digits={1} state={trend !== undefined && trend <= -3 ? 'warn' : undefined} />
          <Readout label="Pressure altitude" value={hpa === undefined ? undefined : U.alt(pressureAltitude(hpa), u)} unit={U.altUnit(u)} />
          <Readout label="Water boils at" value={hpa === undefined ? undefined : U.temp(boilingPointC(hpa), u)} unit={U.tempUnit(u)} digits={1} />
        </div>
        <Spark k="pressure" windowMs={3 * 3600000} color="var(--water)" height={44} label="Pressure, last 3 hours" />
      </Panel>

      <Panel title="Solar">
        <div className="readout-grid two">
          <Readout label={`Clear sky, ${s.solarW} W array`} value={forecast / 1000} unit="kWh" digits={2} size="lg" />
          <Readout label="Sun elevation" value={sunPosition(now, s.lat, s.lon).altitude} unit="°" />
        </div>
      </Panel>
    </div>
  )
}
