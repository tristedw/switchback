import { useEffect, useState } from 'react'
import { app } from '../core/state'
import { useSettings, updateSettings, type ThemeMode } from '../core/settings'
import { useAlarms, ack, snooze, ackAll } from '../core/alarms'
import { fmtClock } from '../core/units'
import { Icon, Mark } from './icons'
import { Telltales } from './Telltales'
import { Lcd } from './Readout'
import { useNow } from './hooks'

export type ScreenId = 'rig' | 'drive' | 'camp' | 'sky' | 'codes' | 'log' | 'setup'

export const SCREENS: { id: ScreenId; label: string; icon: () => JSX.Element; key: string }[] = [
  { id: 'rig', label: 'Rig', icon: Icon.rig, key: '1' },
  { id: 'drive', label: 'Drive', icon: Icon.drive, key: '2' },
  { id: 'camp', label: 'Camp', icon: Icon.camp, key: '3' },
  { id: 'sky', label: 'Sky', icon: Icon.sky, key: '4' },
  { id: 'codes', label: 'Codes', icon: Icon.codes, key: '5' },
  { id: 'log', label: 'Log', icon: Icon.log, key: '6' },
  { id: 'setup', label: 'Setup', icon: Icon.setup, key: '7' },
]

const THEME_NEXT: Record<ThemeMode, ThemeMode> = { auto: 'day', day: 'dusk', dusk: 'night', night: 'phosphor', phosphor: 'auto' }
const THEME_LABEL: Record<ThemeMode, string> = { auto: 'Auto', day: 'Light', dusk: 'Dark', night: 'Amber', phosphor: 'Phosphor' }

export function TopBar({ onNav }: { onNav: (s: ScreenId) => void }) {
  const st = app.use()
  const s = useSettings()
  const now = useNow(5000)

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <header className="topbar">
      <div className="brand">
        <Mark />
        <span>Switchback</span>
      </div>
      <Telltales />
      <div className="spacer" />
      <div className="links">
        <button className="link" onClick={() => onNav('setup')} title={st.obdDetail || 'OBD adapter'}>
          <i className="dot" data-s={st.obd} />
          <span>OBD</span>
        </button>
        <button className="link" onClick={() => onNav('setup')} title="Homebase on the camper pi">
          <i className="dot" data-s={st.homebase} />
          <span>Home</span>
        </button>
        {st.sim && (
          <button className="link" onClick={() => onNav('setup')} title="Running on simulated data">
            <i className="dot" data-s="sim" />
            <span>Sim</span>
          </button>
        )}
        {st.recording && (
          <span className="link">
            <i className="dot" data-s="error" />
            <span>Rec</span>
          </span>
        )}
      </div>
      <span className="clock">
        <Lcd text={fmtClock(now)} size="sm" />
      </span>
      <button className="icon-btn" onClick={() => updateSettings({ theme: THEME_NEXT[s.theme] })} title="Change theme" aria-label={`Theme: ${THEME_LABEL[s.theme]}`}>
        {THEME_LABEL[s.theme]}
      </button>
      <button className="icon-btn hide-sm" onClick={fullscreen} title="Fullscreen" aria-label="Toggle fullscreen">
        <Icon.expand />
      </button>
    </header>
  )
}

export function Nav({ current, onNav, badges }: { current: ScreenId; onNav: (s: ScreenId) => void; badges: Partial<Record<ScreenId, number>> }) {
  return (
    <nav className="nav" aria-label="Screens">
      {SCREENS.map((sc) => (
        <button key={sc.id} aria-current={current === sc.id ? 'page' : undefined} onClick={() => onNav(sc.id)} title={`${sc.label} (${sc.key})`}>
          <i className="led" aria-hidden="true" />
          <sc.icon />
          <span>{sc.label}</span>
          {!!badges[sc.id] && <b className="badge num">{badges[sc.id]}</b>}
        </button>
      ))}
    </nav>
  )
}

export function AlarmStack() {
  const alarms = useAlarms()
  const [open, setOpen] = useState(true)
  const unacked = alarms.filter((a) => !a.acked)

  useEffect(() => {
    if (unacked.length) setOpen(true)
  }, [unacked.length])

  if (!alarms.length) return null
  const list = [...alarms].sort((a, b) => rank(b.sev) - rank(a.sev) || b.since - a.since)
  const shown = open ? list : list.slice(0, 1)

  return (
    <div className="alarms" role="region" aria-label="Active alarms" aria-live="assertive">
      {shown.map((a) => (
        <div key={a.id} className="alarm" data-sev={a.sev} data-acked={a.acked || undefined}>
          <div className="alarm-text">
            <strong>{a.title}</strong>
            <span>{a.detail}</span>
          </div>
          <div className="alarm-actions">
            {!a.acked && <button onClick={() => ack(a.id)}>Acknowledge</button>}
            <button onClick={() => snooze(a.id, 15)}>Snooze 15 min</button>
          </div>
        </div>
      ))}
      {list.length > 1 && (
        <div className="alarm-more">
          <button onClick={() => setOpen(!open)}>{open ? 'Show fewer' : `${list.length - 1} more`}</button>
          {unacked.length > 1 && <button onClick={ackAll}>Acknowledge all</button>}
        </div>
      )}
    </div>
  )
}

const rank = (s: string) => (s === 'crit' ? 2 : s === 'warn' ? 1 : 0)
