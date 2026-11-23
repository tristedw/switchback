import { Rig, RearView } from '../ui/Rig'
import { Readout, Meter, Panel, Lcd } from '../ui/Readout'
import { Spark } from '../ui/Spark'
import { useTel, useNow } from '../ui/hooks'
import { useSettings } from '../core/settings'
import { temp, tempUnit, fmtClock, speed as spd, speedUnit, fmt } from '../core/units'
import { batteryHoursLeft, freshDaysLeft, hoursToFull, propaneDaysLeft, engineOn } from '../core/estimates'
import { sunTimes } from '../core/sky'
import { currentLevel } from '../core/level'
import type { ScreenId } from '../ui/Chrome'

export function RigScreen({ go }: { go: (s: ScreenId) => void }) {
  const tel = useTel()
  const s = useSettings()
  const now = useNow(30000)
  const g = (k: string, a = 30000) => tel.fresh(k, a)
  const T = (v: number | undefined) => (v === undefined ? undefined : temp(v, s.units))

  const soc = g('house.soc')
  const amps = g('house.a')
  const hours = amps !== undefined && amps < 0 ? batteryHoursLeft() : hoursToFull()
  const sun = sunTimes(now, s.lat, s.lon)
  const nextSun = sun.sunset && sun.sunset.getTime() > now ? { label: 'Sunset', at: sun.sunset } : { label: 'Sunrise', at: sunTimes(now + 86400000, s.lat, s.lon).sunrise }
  const { pitch, roll } = currentLevel()
  const water = freshDaysLeft()
  const lp = propaneDaysLeft()
  const propane = g('propane', 60000)

  return (
    <div className="screen rig-screen">
      <Panel title="Rig" className="rig-hero">
        <div className="rig-canvas">
          <Rig />
        </div>
        <div className="rig-strip">
          {engineOn() ? (
            <>
              <Readout label="Speed" value={g('speed', 4000) === undefined ? undefined : spd(g('speed', 4000)!, s.units)} unit={speedUnit(s.units)} size="lg" />
              <Readout label="Engine" value={g('rpm', 4000)} unit="rpm" size="lg" />
              <Readout label="Coolant" value={T(g('ect', 6000))} unit={tempUnit(s.units)} size="lg" state={(g('ect', 6000) ?? 0) >= s.thresholds.coolantWarn ? 'warn' : undefined} />
            </>
          ) : (
            <>
              <Readout label="Inside" value={T(g('inside.t'))} unit={tempUnit(s.units)} digits={1} size="lg" />
              <Readout label="Outside" value={T(g('outside.t'))} unit={tempUnit(s.units)} digits={1} size="lg" state={(g('outside.t') ?? 9) <= s.thresholds.freezeWarn ? 'warn' : undefined} />
              <Readout label={nextSun.label} value={undefined} text={fmtClock(nextSun.at)} size="lg" />
            </>
          )}
        </div>
      </Panel>

      <div className="rig-side">
        <Panel title="House battery" aside={<button className="text-btn" onClick={() => go('camp')}>Power</button>}>
          <div className="soc-row">
            <Lcd text={fmt(soc)} size="xl" unit="%" state={soc !== undefined && soc <= s.thresholds.houseSocCrit ? 'crit' : soc !== undefined && soc <= s.thresholds.houseSocWarn ? 'warn' : undefined} />
            <div className="soc-side">
              <Readout label="Amps" value={amps} digits={1} unit="A" size="sm" />
              <Readout label={amps !== undefined && amps < 0 ? 'Left' : 'To full'} value={hours} digits={hours !== undefined && hours < 10 ? 1 : 0} unit="h" size="sm" />
            </div>
          </div>
          <Spark k="house.soc" windowMs={15 * 60000} height={32} color="var(--lcd)" min={0} max={100} />
        </Panel>

        <Panel title="Tanks">
          <Meter label="Fresh" pct={g('fresh', 60000)} warnAt={s.thresholds.freshWarn} right={water === undefined ? undefined : `${Math.round(g('fresh', 60000) ?? 0)}%  ${water.toFixed(1)} d`} />
          <Meter label="Grey" pct={g('grey', 60000)} color="var(--waste)" invert warnAt={s.thresholds.blackWarn} />
          <Meter label="Black" pct={g('black', 60000)} color="var(--waste)" invert warnAt={s.thresholds.blackWarn} />
          <Meter
            label="Propane"
            pct={propane === undefined ? undefined : (propane / s.propaneKg) * 100}
            color="var(--heat)"
            warnAt={15}
            right={propane === undefined ? undefined : `${propane.toFixed(1)} kg${lp ? `  ${lp.toFixed(0)} d` : ''}`}
          />
        </Panel>

        <Panel title="Level" aside={<button className="text-btn" onClick={() => go('camp')}>Level</button>}>
          <div className="level-mini">
            <RearView roll={roll} size={120} />
            <div className="level-nums">
              <Readout label="Pitch" value={pitch} digits={1} unit="°" size="sm" />
              <Readout label="Roll" value={roll} digits={1} unit="°" size="sm" />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
