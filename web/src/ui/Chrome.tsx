import { useEffect } from 'react'
import { app } from '../core/state'
import { useSettings, updateSettings } from '../core/settings'
import { useAlarms, ack, snooze } from '../core/alarms'
import { fmtClock } from '../core/units'
import { Mark } from './icons'
import { Telltales } from './Telltales'
import { useNow } from './hooks'

export type ScreenId = 'rig' | 'drive' | 'camp' | 'sky' | 'codes' | 'log' | 'setup'

export const SCREENS: { id: ScreenId; label: string; key: string }[] = [
  { id: 'rig', label: 'Rig', key: '1' },
  { id: 'drive', label: 'Drive', key: '2' },
  { id: 'camp', label: 'Camp', key: '3' },
  { id: 'sky', label: 'Sky', key: '4' },
  { id: 'codes', label: 'Codes', key: '5' },
  { id: 'log', label: 'Log', key: '6' },
  { id: 'setup', label: 'Setup', key: '7' },
]

// the vertical main menu, top left of the screen like every NeXT app
export function MainMenu({ current, onNav, nightOn }: { current: string; onNav: (s: ScreenId) => void; nightOn: boolean }) {
  const s = useSettings()
  const cycleNight = () => updateSettings({ theme: s.theme === 'auto' ? 'night' : s.theme === 'night' ? 'dusk' : 'auto' })
  return (
    <nav className="mainmenu" aria-label="Main menu">
      <div className="menu-title">Switchback</div>
      <ul>
        {SCREENS.map((sc) => (
          <li key={sc.id}>
            <button aria-current={current === sc.id ? 'page' : undefined} onClick={() => onNav(sc.id)}>
              <span>{sc.label}</span>
              <kbd>{sc.key}</kbd>
            </button>
          </li>
        ))}
        <li>
          <button onClick={cycleNight} aria-pressed={nightOn}>
            <span>Night</span>
            <kbd>{s.theme === 'auto' ? 'auto' : s.theme === 'night' ? 'on' : 'off'}</kbd>
          </button>
        </li>
      </ul>
    </nav>
  )
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function StatusTile({ label, state, onClick }: { label: string; state: string; onClick: () => void }) {
  return (
    <button className="tile" onClick={onClick} title={`${label}: ${state}`}>
      <span className="tile-led" data-s={state} />
      <span className="tile-label">{label}</span>
      {/* the three dots on a docked app that isn't running */}
      {(state === 'off' || state === 'error') && <span className="tile-dots">...</span>}
    </button>
  )
}

// right edge of the screen, 64px tiles
export function Dock({ onNav }: { onNav: (s: ScreenId) => void }) {
  const st = app.use()
  const now = new Date(useNow(10000))
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }
  return (
    <aside className="dock" aria-label="Dock">
      <button className="tile app-tile" onClick={fullscreen} title="Fullscreen">
        <Mark />
      </button>
      <StatusTile label="OBD" state={st.obd} onClick={() => onNav('setup')} />
      <StatusTile label="Home" state={st.homebase} onClick={() => onNav('setup')} />
      {st.sim && <StatusTile label="Sim" state="sim" onClick={() => onNav('setup')} />}
      {st.recording && <StatusTile label="Rec" state="error" onClick={() => onNav('log')} />}
      <div className="tile lights-tile">
        <Telltales />
      </div>
      <div className="dock-spacer" />
      {/* the preferences app clock tile */}
      <div className="tile clock-tile" aria-label={`${fmtClock(now)} ${now.toDateString()}`}>
        <span className="ct-time">{fmtClock(now)}</span>
        <span className="ct-day">{DAYS[now.getDay()]}</span>
        <span className="ct-date">{now.getDate()}</span>
        <span className="ct-month">{MONTHS[now.getMonth()]}</span>
      </div>
    </aside>
  )
}

// alarms come up as attention panels
export function AlarmStack() {
  const alarms = useAlarms()
  const top = alarms.filter((a) => !a.acked).sort((a, b) => rank(b.sev) - rank(a.sev) || b.since - a.since)

  useEffect(() => {
    // return acks the front panel, same as the default button in a NeXT attention panel
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && top[0] && !(e.target instanceof HTMLInputElement)) ack(top[0].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top])

  const acked = alarms.filter((a) => a.acked)
  if (!alarms.length) return null

  return (
    <div className="alarms" role="region" aria-label="Alarms" aria-live="assertive">
      {top.map((a) => (
        <div key={a.id} className="attention" data-sev={a.sev}>
          <div className="att-bar" />
          <div className="att-body">
            <span className="att-icon" aria-hidden="true">
              {a.sev === 'info' ? 'i' : '!'}
            </span>
            <div className="att-text">
              <strong>{a.title}</strong>
              <span>{a.detail}</span>
            </div>
            <div className="att-buttons">
              <button className="btn" onClick={() => snooze(a.id, 15)}>
                Snooze
              </button>
              <button className="btn primary" onClick={() => ack(a.id)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ))}
      {!!acked.length && (
        <div className="acked">
          {acked.map((a) => (
            <span key={a.id} data-sev={a.sev}>
              {a.title}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const rank = (s: string) => (s === 'crit' ? 2 : s === 'warn' ? 1 : 0)
