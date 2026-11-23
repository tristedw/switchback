import { Gauge } from '../ui/Gauge'
import { Readout, Panel, Lcd } from '../ui/Readout'
import { Spark } from '../ui/Spark'
import { useTel } from '../ui/hooks'
import { useSettings, profile } from '../core/settings'
import * as U from '../core/units'
import { tripStore, endTrip, armLaunch, cancelLaunch } from '../core/trip'
import { ratePerHour } from '../core/estimates'

function Trim({ label, st, lt }: { label: string; st?: number; lt?: number }) {
  const bar = (v?: number) => {
    const c = Math.max(-25, Math.min(25, v ?? 0))
    return <div className="trim-bar" style={{ left: c < 0 ? `${50 + c * 2}%` : '50%', width: `${Math.abs(c) * 2}%` }} data-bad={Math.abs(v ?? 0) > 10 || undefined} />
  }
  return (
    <div className="trim">
      <span className="muted">{label}</span>
      <div className="trim-track" aria-label={`${label} short term ${U.fmt(st, 1)} percent`}>
        {bar(st)}
        <i />
      </div>
      <span className="num">{U.fmt(st, 1)}%</span>
      <div className="trim-track lt" aria-label={`${label} long term ${U.fmt(lt, 1)} percent`}>
        {bar(lt)}
        <i />
      </div>
      <span className="num">{U.fmt(lt, 1)}%</span>
    </div>
  )
}

export function DriveScreen() {
  const tel = useTel()
  const s = useSettings()
  const { trip, launch } = tripStore.use()
  const p = profile(s)
  const g = (k: string, a = 4000) => tel.fresh(k, a)
  const u = s.units
  const T = (v?: number) => (v === undefined ? undefined : U.temp(v, u))

  const rpm = g('rpm')
  const kmh = g('speed')
  const ect = g('ect', 8000)
  const oil = g('oilT', 8000)
  const map = g('map')
  const baro = g('baro', 30000) ?? 101
  const boost = map !== undefined && p.fuel === 'diesel' ? map - baro : undefined
  const inst = g('calc.inst')
  const avg = trip.km > 1 && trip.litres > 0 ? (trip.litres / trip.km) * 100 : undefined
  const ectRate = ratePerHour('ect', 3 * 60000, 60000) // C per hour
  const toWarn = ect !== undefined && ectRate && ectRate > 6 && ect < s.thresholds.coolantWarn ? ((s.thresholds.coolantWarn - ect) / ectRate) * 60 : undefined
  const climb = ratePerHour('alt', 2 * 60000, 30000)
  const grade = climb !== undefined && kmh && kmh > 20 ? (climb / (kmh * 1000)) * 100 : undefined
  const movingH = trip.movingMs / 3600000

  return (
    <div className="screen drive-screen">
      <Panel primary title="Gauges" className="gauges-win">
      <div className="gauges">
        <Gauge
          value={rpm}
          min={0}
          max={Math.ceil(p.redline / 1000) * 1000 + (p.fuel === 'diesel' ? 0 : 1000)}
          label="Engine"
          unit="rpm"
          legend="x1000 r/min"
          warnFrom={p.shiftAt}
          critFrom={p.redline}
          majors={Math.ceil(p.redline / 1000) + (p.fuel === 'diesel' ? 1 : 2)}
          minors={2}
          tickLabel={(v) => String(v / 1000)}
          shift={rpm !== undefined && rpm >= p.shiftAt}
          size={320}
        />
        <Gauge value={kmh === undefined ? undefined : U.speed(kmh, u)} min={0} max={u === 'metric' ? 160 : 100} label="Speed" unit={U.speedUnit(u)} majors={u === 'metric' ? 9 : 6} minors={2} size={320} />
        <Gauge
          value={T(ect)}
          min={T(40)!}
          max={T(130)!}
          label="Coolant"
          unit={U.tempUnit(u)}
          warnFrom={T(s.thresholds.coolantWarn)}
          critFrom={T(s.thresholds.coolantCrit)}
          majors={4}
          minors={3}
          size={260}
        />
      </div>
      </Panel>

      <div className="drive-grid">
        <Panel title="Engine" className="readouts">
          <div className="readout-grid">
            <Readout label="Load" value={g('load')} unit="%" />
            {boost !== undefined ? (
              <Readout label="Boost" value={U.pressure(Math.max(0, boost), u)} unit={U.pressureUnit(u)} digits={u === 'imperial' ? 1 : 0} />
            ) : (
              <Readout label="Manifold" value={map === undefined ? undefined : U.pressure(map, u)} unit={U.pressureUnit(u)} digits={u === 'imperial' ? 1 : 0} />
            )}
            <Readout label="Intake air" value={T(g('iat', 10000))} unit={U.tempUnit(u)} />
            <Readout
              label="Oil"
              value={T(oil)}
              unit={U.tempUnit(u)}
              state={oil !== undefined && ect !== undefined && ect > 80 && oil - ect > s.thresholds.oilCoolantDelta ? 'warn' : undefined}
              sub={oil !== undefined && ect !== undefined ? `${Math.abs(Math.round(U.tempDelta(oil - ect, u)))}° ${oil >= ect ? 'over' : 'under'} coolant` : undefined}
            />
            <Readout label="Battery" value={g('vbat', 15000)} unit="V" digits={1} state={rpm && rpm > 300 && (g('vbat', 15000) ?? 14) < 13 ? 'warn' : undefined} />
            <Readout label="Throttle" value={g('tps')} unit="%" />
          </div>
          <div className="spark-row">
            <Spark k="ect" color="var(--heat)" mark={s.thresholds.coolantWarn} label="Coolant, last 5 minutes" />
            <Spark k="load" min={0} max={100} color="var(--lcd)" fill label="Load, last 5 minutes" />
          </div>
        </Panel>

        <Panel title="Fuel">
          <div className="readout-grid two">
            {inst !== undefined && (kmh ?? 0) >= 15 ? (
              <Readout label="Right now" value={U.economy(inst, u)} unit={U.economyUnit(u)} digits={1} />
            ) : (
              <Readout label="Burning" value={g('calc.lph') === undefined ? undefined : U.vol(g('calc.lph')!, u)} unit={`${U.volUnit(u)}/h`} digits={1} />
            )}
            <Readout label="This trip" value={avg === undefined ? undefined : U.economy(avg, u)} unit={U.economyUnit(u)} digits={1} />
            <Readout label="Tank" value={g('fuel', 20000)} unit="%" state={(g('fuel', 20000) ?? 100) <= s.thresholds.lowFuel ? 'warn' : undefined} />
            <Readout label="Range" value={g('calc.range', 20000) === undefined ? undefined : U.dist(g('calc.range', 20000)!, u)} unit={U.distUnit(u)} />
          </div>
        </Panel>

        <Panel title="Grade">
          <div className="readout-grid two">
            <Readout label="Elevation" value={g('alt', 15000) === undefined ? undefined : U.alt(g('alt', 15000)!, u)} unit={U.altUnit(u)} />
            <Readout label="Grade" value={grade} unit="%" digits={1} />
            <Readout label="Climbing" value={climb === undefined ? undefined : U.alt(climb / 60, u)} unit={`${U.altUnit(u)}/min`} />
            <Readout label="Coolant trend" value={ectRate === undefined ? undefined : U.tempDelta(ectRate / 60, u)} unit="°/min" digits={1} />
            <Readout label="Hot in" value={toWarn === undefined ? undefined : Math.max(1, toWarn)} unit="min" state={toWarn !== undefined && toWarn < 10 ? 'warn' : undefined} />
          </div>
        </Panel>

        <Panel title="Trip" aside={<button className="text-btn" onClick={() => endTrip()}>Reset</button>}>
          <dl className="stats">
            <dt>Distance</dt>
            <dd className="num">
              {U.dist(trip.km, u).toFixed(1)} {U.distUnit(u)}
            </dd>
            <dt>Moving</dt>
            <dd className="num">{U.fmtDuration(trip.movingMs)}</dd>
            <dt>Idling</dt>
            <dd className="num">{U.fmtDuration(trip.idleMs)}</dd>
            <dt>Average</dt>
            <dd className="num">
              {movingH > 0.01 ? U.speed(trip.km / movingH, u).toFixed(0) : '--'} {U.speedUnit(u)}
            </dd>
            <dt>Top speed</dt>
            <dd className="num">
              {U.speed(trip.maxKmh, u).toFixed(0)} {U.speedUnit(u)}
            </dd>
            <dt>Fuel used</dt>
            <dd className="num">
              {trip.litres > 0 ? `${U.vol(trip.litres, u).toFixed(1)} ${U.volUnit(u)}` : '--'}
            </dd>
            <dt>Climbed</dt>
            <dd className="num">
              {Math.round(U.alt(trip.climbM, u))} {U.altUnit(u)}
            </dd>
            <dt>Hottest</dt>
            <dd className="num">{trip.maxEct ? `${Math.round(U.temp(trip.maxEct, u))}${U.tempUnit(u)}` : '--'}</dd>
          </dl>
        </Panel>

        <Panel title={u === 'metric' ? '0 to 100' : '0 to 62'} className="launch" aside={launch.best ? <span className="faint num">best {launch.best.toFixed(2)} s</span> : undefined}>
          <div className="launch-time">
            <Lcd
              text={launch.state === 'running' && launch.startedAt ? ((Date.now() - launch.startedAt) / 1000).toFixed(1) : launch.result ? launch.result.toFixed(2) : '0.00'}
              size="xl"
              unit="s"
              state={launch.state === 'running' ? 'crit' : undefined}
            />
          </div>
          {launch.state === 'armed' || launch.state === 'running' ? (
            <button className="btn" onClick={cancelLaunch}>
              Cancel
            </button>
          ) : (
            <button className="btn primary" onClick={armLaunch} disabled={(kmh ?? 0) > 1}>
              {launch.state === 'done' ? 'Again' : 'Arm'}
            </button>
          )}
        </Panel>

        {p.fuel === 'gas' && (
          <Panel title="Fuel trims">
            <Trim label="Bank 1" st={g('stft')} lt={g('ltft', 10000)} />
            <Trim label="Bank 2" st={g('stft2')} lt={g('ltft2', 10000)} />
          </Panel>
        )}
      </div>
    </div>
  )
}
