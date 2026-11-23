import { useState } from 'react'
import { Panel } from '../ui/Readout'
import { app } from '../core/state'
import { useSettings, updateSettings, updateThresholds, resetSettings, PROFILES, type Thresholds } from '../core/settings'
import { BleTransport, SerialTransport, bleSupported, serialSupported } from '../obd/transports'
import { connectObd, disconnectObd, obdConsole } from '../obd/session'
import { connectHomebase, disconnectHomebase, homebaseUrl } from '../sources/homebase'
import { startSim, stopSim, setScenario, SCENARIOS } from '../sources/sim'
import { klaxon, chime, say, unlockAudio } from '../core/audio'
import { tempUnit } from '../core/units'

function Num({ label, value, onChange, unit, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; min?: number; max?: number }) {
  const [draft, setDraft] = useState<string>()
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input
          type="number"
          inputMode="decimal"
          value={draft ?? value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number(draft)
            if (draft !== undefined && Number.isFinite(n)) onChange(n)
            setDraft(undefined)
          }}
        />
        {unit && <span className="faint">{unit}</span>}
      </span>
    </label>
  )
}

function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      <span>
        {label}
        {hint && <span className="faint small"> {hint}</span>}
      </span>
    </label>
  )
}

// thresholds are stored in C, the form shows whatever units are on
function ThresholdTemp({ label, k, s }: { label: string; k: keyof Thresholds; s: ReturnType<typeof useSettings> }) {
  const imp = s.units === 'imperial'
  const v = s.thresholds[k]
  return <Num label={label} value={Math.round(imp ? v * 1.8 + 32 : v)} unit={tempUnit(s.units)} onChange={(n) => updateThresholds({ [k]: imp ? (n - 32) / 1.8 : n })} />
}

export function SetupScreen() {
  const st = app.use()
  const s = useSettings()
  const con = obdConsole.use()
  const [baud, setBaud] = useState(38400)
  const [err, setErr] = useState('')
  const [hbUrl, setHbUrl] = useState(s.homebaseUrl)
  const [showConsole, setShowConsole] = useState(false)
  const t = s.thresholds

  const connect = async (kind: 'ble' | 'serial') => {
    setErr('')
    if (st.sim) stopSim()
    try {
      await connectObd(kind === 'ble' ? new BleTransport() : new SerialTransport(baud))
    } catch (e) {
      const msg = (e as Error).message
      // user closing the picker isn't an error worth shouting about
      if (!/cancel|chosen|No port selected/i.test(msg)) setErr(msg)
    }
  }

  return (
    <div className="screen setup-screen">
      <Panel title="OBD adapter" aside={<span className="faint">{st.obd === 'live' ? `${con.hz.toFixed(1)} readings a second` : st.obd}</span>}>
        {st.obd === 'live' && <p className="muted small">{st.obdDetail}</p>}
        <div className="btn-row wrap">
          {st.obd === 'live' || st.obd === 'connecting' ? (
            <button className="btn" onClick={() => disconnectObd()}>
              Disconnect
            </button>
          ) : (
            <>
              <button className="btn primary" onClick={() => connect('ble')} disabled={!bleSupported()}>
                Bluetooth LE
              </button>
              <button className="btn" onClick={() => connect('serial')} disabled={!serialSupported()}>
                Serial
              </button>
              <label className="inline">
                <span className="muted small">Baud</span>
                <select value={baud} onChange={(e) => setBaud(Number(e.target.value))}>
                  {[9600, 38400, 115200, 230400, 500000].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button className="text-btn" onClick={() => setShowConsole(!showConsole)}>
            {showConsole ? 'Hide console' : 'Console'}
          </button>
        </div>
        {st.obd === 'connecting' && <p className="muted small">{st.obdDetail}</p>}
        {(err || st.obd === 'error') && <p className="error">{err || st.obdDetail}</p>}
        {!bleSupported() && !serialSupported() && <p className="small faint">Needs Chrome or Edge.</p>}
        {st.obd === 'live' && <p className="small faint num">{st.supportedPids.length} PIDs supported</p>}
        <Num label="Poll delay" value={s.pollMs} unit="ms" step={10} min={0} onChange={(v) => updateSettings({ pollMs: Math.max(0, v) })} />
        {showConsole && (
          <pre className="console" aria-label="ELM327 console">
            {con.lines.length ? con.lines.join('\n') : 'Nothing yet.'}
          </pre>
        )}
      </Panel>

      <Panel title="Homebase" aside={<span className="faint">{st.homebase}</span>}>
        <label className="field wide">
          <span>Address</span>
          <span className="field-input">
            <input value={hbUrl} onChange={(e) => setHbUrl(e.target.value)} placeholder="camper.local:8787" />
          </span>
        </label>
        <div className="btn-row">
          {st.homebase === 'live' || st.homebase === 'connecting' ? (
            <button className="btn" onClick={disconnectHomebase}>
              Disconnect
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                updateSettings({ homebaseUrl: hbUrl.trim() })
                setTimeout(connectHomebase, 0)
              }}
              disabled={!hbUrl.trim() && !homebaseUrl()}
            >
              Connect
            </button>
          )}
        </div>
      </Panel>

      <Panel title="Simulator" className="sim" aside={<Toggle label="On" on={st.sim} onChange={(v) => (v ? startSim() : stopSim())} />}>
        <div className="scenarios" role="radiogroup" aria-label="Scenario">
          {SCENARIOS.map((sc) => (
            <button key={sc.id} role="radio" aria-checked={st.scenario === sc.id} disabled={!st.sim} onClick={() => setScenario(sc.id)}>
              <strong>{sc.name}</strong>
            </button>
          ))}
        </div>
        <div className="seg" role="radiogroup" aria-label="Time warp">
          {[1, 10, 60].map((w) => (
            <button key={w} role="radio" aria-checked={st.warp === w} aria-selected={st.warp === w} disabled={!st.sim} onClick={() => app.set({ warp: w })}>
              {w === 1 ? 'Real time' : `${w}x`}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Truck">
        <label className="field wide">
          <span>Profile</span>
          <span className="field-input">
            <select value={s.profileId} onChange={(e) => updateSettings({ profileId: e.target.value })}>
              {PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <div className="seg" role="radiogroup" aria-label="Units">
          {(['metric', 'imperial'] as const).map((uu) => (
            <button key={uu} role="radio" aria-checked={s.units === uu} aria-selected={s.units === uu} onClick={() => updateSettings({ units: uu })}>
              {uu === 'metric' ? 'Metric' : 'Imperial'}
            </button>
          ))}
        </div>
        <Num label="Odometer" value={Math.round(s.odoKm)} unit="km" onChange={(v) => updateSettings({ odoKm: v })} />
      </Panel>

      <Panel title="Camper">
        <div className="field-grid">
          <Num label="Solar" value={s.solarW} unit="W" onChange={(v) => updateSettings({ solarW: v })} />
          <Num label="House bank" value={s.houseAh} unit="Ah" onChange={(v) => updateSettings({ houseAh: v })} />
          <Num label="Fresh tank" value={s.freshL} unit="L" onChange={(v) => updateSettings({ freshL: v })} />
          <Num label="Grey tank" value={s.greyL} unit="L" onChange={(v) => updateSettings({ greyL: v })} />
          <Num label="Black tank" value={s.blackL} unit="L" onChange={(v) => updateSettings({ blackL: v })} />
          <Num label="Propane, full" value={s.propaneKg} unit="kg" step={0.1} onChange={(v) => updateSettings({ propaneKg: v })} />
        </div>
      </Panel>

      <Panel title="Alarms">
        <div className="field-grid">
          <ThresholdTemp label="Coolant warning" k="coolantWarn" s={s} />
          <ThresholdTemp label="Coolant critical" k="coolantCrit" s={s} />
          <Num label="Oil over coolant" value={t.oilCoolantDelta} unit="°C" onChange={(v) => updateThresholds({ oilCoolantDelta: v })} />
          <Num label="House bank warning" value={t.houseSocWarn} unit="%" onChange={(v) => updateThresholds({ houseSocWarn: v })} />
          <Num label="House bank critical" value={t.houseSocCrit} unit="%" onChange={(v) => updateThresholds({ houseSocCrit: v })} />
          <ThresholdTemp label="Fridge too warm" k="fridgeWarn" s={s} />
          <ThresholdTemp label="Freeze watch" k="freezeWarn" s={s} />
          <Num label="Gas sensor trip" value={t.gasCrit} unit="%" onChange={(v) => updateThresholds({ gasCrit: v })} />
          <Num label="Waste tank warning" value={t.blackWarn} unit="%" onChange={(v) => updateThresholds({ blackWarn: v })} />
          <Num label="Fresh water low" value={t.freshWarn} unit="%" onChange={(v) => updateThresholds({ freshWarn: v })} />
          <Num label="Low fuel" value={t.lowFuel} unit="%" onChange={(v) => updateThresholds({ lowFuel: v })} />
          <Num label="Level tolerance" value={t.levelTol} unit="°" step={0.1} onChange={(v) => updateThresholds({ levelTol: v })} />
          <Num label="Quiet hours start" value={s.quietStart} unit="h" min={0} max={23} onChange={(v) => updateSettings({ quietStart: v })} />
          <Num label="Quiet hours end" value={s.quietEnd} unit="h" min={0} max={23} onChange={(v) => updateSettings({ quietEnd: v })} />
        </div>
        <Toggle label="Alarm sounds" on={s.sound} onChange={(v) => updateSettings({ sound: v })} />
        <Toggle label="Spoken alerts" on={s.voice} onChange={(v) => updateSettings({ voice: v })} />
        <div className="btn-row wrap">
          <button className="btn" onClick={() => (unlockAudio(), chime())}>
            Test chime
          </button>
          <button className="btn" onClick={() => (unlockAudio(), klaxon())}>
            Test alarm
          </button>
          <button className="btn" onClick={() => say('Coolant at 106 degrees')}>
            Test voice
          </button>
        </div>
      </Panel>

      <Panel title="Location">
        <div className="field-grid">
          <Num label="Latitude" value={s.lat} step={0.001} onChange={(v) => updateSettings({ lat: v })} />
          <Num label="Longitude" value={s.lon} step={0.001} onChange={(v) => updateSettings({ lon: v })} />
        </div>
        <button className="text-btn danger" onClick={() => confirm('Reset every setting back to default?') && resetSettings()}>
          Reset settings
        </button>
      </Panel>
    </div>
  )
}
