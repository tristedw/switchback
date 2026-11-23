import { Readout, Panel } from '../ui/Readout'
import { Spark } from '../ui/Spark'
import { RearView } from '../ui/Rig'
import { useTel } from '../ui/hooks'
import { useSettings } from '../core/settings'
import * as U from '../core/units'
import { app } from '../core/state'
import { logEvent } from '../core/events'
import { currentLevel, calibrateLevel, clearLevelCal } from '../core/level'
import { batteryHoursLeft, hoursToFull } from '../core/estimates'
import { solarForecastWh } from '../core/sky'
import { poke, simLeaking } from '../sources/sim'
import { sendToHomebase } from '../sources/homebase'

// side on: the camper floor tips with pitch
function PitchView({ pitch }: { pitch: number | undefined }) {
  const p = pitch ?? 0
  return (
    <svg className="pitchview" viewBox="0 0 220 120" role="img" aria-label={`Pitch ${p.toFixed(1)} degrees`}>
      <line x1="6" x2="214" y1="104" y2="104" stroke="var(--ground)" strokeWidth="2" />
      <g style={{ transform: `rotate(${-p * 3}deg)`, transformOrigin: p >= 0 ? '62px 104px' : '168px 104px', transition: 'transform 0.4s' }}>
        <path d="M26 86 V36 Q26 28 34 28 H170 Q190 28 192 40 L194 54 H150 V86 Z" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="2" />
        <circle cx="62" cy="94" r="10" fill="var(--canvas)" stroke="var(--rig-line)" strokeWidth="2" />
        <circle cx="168" cy="94" r="10" fill="var(--canvas)" stroke="var(--rig-line)" strokeWidth="2" />
        <line x1="40" x2="140" y1="40" y2="40" stroke="var(--amber)" strokeWidth="2" />
      </g>
    </svg>
  )
}

function Bubble({ pitch, roll, tol }: { pitch?: number; roll?: number; tol: number }) {
  // full scale is 5 degrees
  const k = 40 / 5
  const x = Math.max(-40, Math.min(40, (roll ?? 0) * k))
  const y = Math.max(-40, Math.min(40, (pitch ?? 0) * k))
  const ok = Math.abs(pitch ?? 9) <= tol && Math.abs(roll ?? 9) <= tol
  return (
    <svg className="bubble" viewBox="0 0 100 100" role="img" aria-label={ok ? 'Level' : 'Not level'}>
      <circle cx="50" cy="50" r="46" fill="var(--well)" stroke="var(--rule)" strokeWidth="2" />
      <circle cx="50" cy="50" r={tol * k} fill="none" stroke="var(--ok)" strokeWidth="1.5" strokeDasharray="3 3" />
      <line x1="50" x2="50" y1="6" y2="94" stroke="var(--rule)" />
      <line x1="6" x2="94" y1="50" y2="50" stroke="var(--rule)" />
      <circle cx={50 + x} cy={50 + y} r="9" fill={ok ? 'var(--ok)' : 'var(--amber)'} style={{ transition: 'cx 0.4s, cy 0.4s' }} />
    </svg>
  )
}

export function CampScreen() {
  const tel = useTel()
  const s = useSettings()
  const st = app.use()
  const g = (k: string, a = 30000) => tel.fresh(k, a)
  const u = s.units
  const T = (v?: number) => (v === undefined ? undefined : U.temp(v, u))

  const amps = g('house.a')
  const draining = amps !== undefined && amps < 0
  const hours = draining ? batteryHoursLeft() : hoursToFull()
  const forecast = solarForecastWh(Date.now(), s.lat, s.lon, s.solarW)
  const { pitch, roll } = currentLevel()
  const gas = g('gas')
  const door = g('door.camper', 10000)

  const toggleGuard = () => {
    const armed = !st.guardArmed
    app.set({ guardArmed: armed, guardArmedAt: Date.now() })
    // the pi watches too so it can ping my phone when no screen is on
    sendToHomebase({ type: 'guard', armed })
    logEvent('guard', armed ? 'Guard armed' : 'Guard off')
  }

  return (
    <div className="screen camp-screen">
      <Panel primary title="Power" className="power">
        <div className="readout-grid">
          <Readout label="House bank" value={g('house.soc')} unit="%" size="lg" />
          <Readout label="Volts" value={g('house.v')} digits={2} unit="V" />
          <Readout label="Amps" value={amps} digits={1} unit="A" />
          <Readout label="Solar" value={g('solar.w')} unit="W" />
          <Readout label={draining ? 'Hours left' : 'Hours to full'} value={hours} digits={1} unit="h" />
          <Readout label="Clear sky today" value={forecast / 1000} digits={1} unit="kWh" />
        </div>
        <div className="spark-row">
          <Spark k="house.a" windowMs={15 * 60000} color="var(--lcd)" label="Net amps, last 15 minutes" />
          <Spark k="solar.w" windowMs={15 * 60000} color="var(--lcd)" min={0} label="Solar watts, last 15 minutes" />
        </div>
      </Panel>

      <Panel
        title="Level"
        className="leveling"
        aside={
          <span className="btn-row">
            <button className="text-btn" onClick={() => calibrateLevel()}>
              Zero here
            </button>
            {(s.pitchZero !== 0 || s.rollZero !== 0) && (
              <button className="text-btn" onClick={clearLevelCal}>
                Clear zero
              </button>
            )}
          </span>
        }
      >
        <div className="level-views">
          <PitchView pitch={pitch} />
          <Bubble pitch={pitch} roll={roll} tol={s.thresholds.levelTol} />
          <RearView roll={roll} size={170} />
        </div>
        <div className="readout-grid two">
          <Readout label="Pitch" value={pitch} digits={1} unit="°" size="lg" state={Math.abs(pitch ?? 0) > s.thresholds.levelTol ? 'warn' : undefined} />
          <Readout label="Roll" value={roll} digits={1} unit="°" size="lg" state={Math.abs(roll ?? 0) > s.thresholds.levelTol ? 'warn' : undefined} />
        </div>
      </Panel>

      <Panel title="Climate">
        <div className="readout-grid">
          <Readout label="Inside" value={T(g('inside.t'))} unit={U.tempUnit(u)} digits={1} />
          <Readout label="Humidity" value={g('inside.rh')} unit="%" />
          <Readout label="Outside" value={T(g('outside.t'))} unit={U.tempUnit(u)} digits={1} state={(g('outside.t') ?? 9) <= s.thresholds.freezeWarn ? 'warn' : undefined} />
          <Readout label="Fridge" value={T(g('fridge.t'))} unit={U.tempUnit(u)} digits={1} state={(g('fridge.t') ?? 0) > s.thresholds.fridgeWarn ? 'warn' : undefined} />
          <Readout label="Furnace" value={undefined} text={g('furnace') === 1 ? 'On' : g('furnace') === 0 ? 'Off' : '--'} />
          <Readout label="Propane" value={g('propane')} digits={1} unit="kg" />
        </div>
        <div className="spark-row">
          <Spark k="fridge.t" windowMs={15 * 60000} color="var(--water)" mark={s.thresholds.fridgeWarn} label="Fridge, last 15 minutes" />
          <Spark k="inside.t" windowMs={15 * 60000} color="var(--ink-2)" label="Inside, last 15 minutes" />
        </div>
      </Panel>

      <Panel title="Guard">
        <div className="guard-row">
          <button className="btn guard-btn" data-on={st.guardArmed || undefined} onClick={toggleGuard} aria-pressed={st.guardArmed}>
            {st.guardArmed ? 'Disarm' : 'Arm'}
          </button>
          <Readout label="Door" value={undefined} text={door === 1 ? 'Open' : door === 0 ? 'Shut' : '--'} state={door === 1 ? 'warn' : undefined} />
          <Readout label="Gas" value={gas} unit="%" state={(gas ?? 0) >= s.thresholds.gasCrit ? 'crit' : undefined} />
        </div>
      </Panel>

      {st.sim && (
        <Panel title="Sim" className="sim-pokes">
          <div className="btn-row wrap">
            <button className="btn" onClick={poke.camperDoor}>
              Open door
            </button>
            <button className="btn" onClick={poke.fridgeDoor}>
              Fridge open
            </button>
            <button className="btn" onClick={poke.visitor}>
              Motion
            </button>
            <button className="btn" onClick={poke.leak}>
              {simLeaking() ? 'Stop leak' : 'Gas leak'}
            </button>
            <button className="btn" onClick={poke.dumpTanks}>
              Dump and fill
            </button>
          </div>
        </Panel>
      )}
    </div>
  )
}
