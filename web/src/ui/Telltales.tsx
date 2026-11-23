import { useAlarms } from '../core/alarms'
import { app } from '../core/state'
import { useTel } from './hooks'
import type { Severity } from '../core/events'

// the idiot light strip. same symbols as a real cluster so you read it without thinking.
// dim when fine, amber for warnings, red for the stuff that needs you right now

const P = { viewBox: '0 0 24 24', 'aria-hidden': true }

const SYMBOLS: Record<string, JSX.Element> = {
  engine: (
    <svg {...P}>
      <path fill="currentColor" d="M5 8h3l1.5-2h6L17 8h2v3h2V8h1.5v9H21v-3h-2v4H9l-2-3H5v2H3.5V9H5z" />
    </svg>
  ),
  coolant: (
    <svg {...P}>
      <path fill="currentColor" d="M11 3h2v2h3v1.6h-3v1.8h3V10h-3v3.3a3 3 0 1 1-2 0V3zM3 18.5c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1V20c-1.5 0-1.5 1-3 1s-1.5-1-3-1-1.5 1-3 1-1.5-1-3-1-1.5 1-3 1-1.5-1-3-1z" />
    </svg>
  ),
  charging: (
    <svg {...P}>
      <path fill="currentColor" d="M3 7h3V5h3v2h6V5h3v2h3v12H3zm3 5v1.5h4V12zm8 0v1.5h1.25v1.25h1.5V13.5H18V12h-1.25v-1.25h-1.5V12z" />
    </svg>
  ),
  fuel: (
    <svg {...P}>
      <path fill="currentColor" d="M4 4h9v8h1.5a2 2 0 0 1 2 2v3a.75.75 0 0 0 1.5 0V9.5l-2-2 1-1 2.5 2.5V17a2.25 2.25 0 0 1-4.5 0v-3a.5.5 0 0 0-.5-.5H13V20H4zm2 2v4h5V6z" />
    </svg>
  ),
  house: (
    <svg {...P}>
      <path fill="currentColor" d="M12 3l9 7v11H3V10zm-1.2 6l-3 5.5h3V19l3.8-6.5h-3.2L13 9z" />
    </svg>
  ),
  propane: (
    <svg {...P}>
      <path fill="currentColor" d="M12 2c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.6 1.8 3C10 7.5 11 4.5 12 2zm0 12c-.8 1-1.5 1.8-1.5 3a1.5 1.5 0 0 0 3 0c0-1.2-.7-2-1.5-3z" />
    </svg>
  ),
  door: (
    <svg {...P}>
      <path fill="currentColor" d="M5 3h10v2H7v14h8v2H5zm11 0l4 2v14l-4 2zm1 8v2h1v-2z" />
    </svg>
  ),
  freeze: (
    <svg {...P}>
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 2v20M3.5 7l17 10M3.5 17l17-10M9 4l3 2.5L15 4M9 20l3-2.5 3 2.5" />
    </svg>
  ),
  guard: (
    <svg {...P}>
      <path fill="currentColor" d="M12 2l8 3v6.5c0 5-3.5 9-8 10.5-4.5-1.5-8-5.5-8-10.5V5zm0 5a2.5 2.5 0 0 0-1 4.8V15h2v-3.2A2.5 2.5 0 0 0 12 7z" />
    </svg>
  ),
}

interface Light {
  id: string
  name: string
  sym: keyof typeof SYMBOLS
  alarms: string[]
}

const LIGHTS: Light[] = [
  { id: 'engine', name: 'Check engine', sym: 'engine', alarms: [] },
  { id: 'coolant', name: 'Coolant temp', sym: 'coolant', alarms: ['coolant', 'oil-delta'] },
  { id: 'charging', name: 'Charging', sym: 'charging', alarms: ['charging'] },
  { id: 'fuel', name: 'Low fuel', sym: 'fuel', alarms: ['fuel'] },
  { id: 'house', name: 'House power', sym: 'house', alarms: ['house-soc'] },
  { id: 'propane', name: 'Propane', sym: 'propane', alarms: ['lpg'] },
  { id: 'door', name: 'Camper door', sym: 'door', alarms: [] },
  { id: 'freeze', name: 'Freeze', sym: 'freeze', alarms: ['freeze'] },
  { id: 'guard', name: 'Camp guard', sym: 'guard', alarms: ['guard'] },
]

const rank = (s?: Severity) => (s === 'crit' ? 2 : s === 'warn' ? 1 : s === 'info' ? 0.5 : 0)

export function Telltales() {
  const alarms = useAlarms()
  const tel = useTel()
  const st = app.use()

  return (
    <ul className="telltales" aria-label="Warning lights">
      {LIGHTS.map((l) => {
        let sev: Severity | undefined
        for (const a of alarms) if (l.alarms.includes(a.id) && rank(a.sev) > rank(sev)) sev = a.sev
        // a couple of lights come straight off a sensor rather than an alarm
        if (l.id === 'engine' && tel.fresh('mil', 60000) === 1) sev = 'warn'
        if (l.id === 'door' && tel.fresh('door.camper', 10000) === 1) sev = sev ?? 'warn'
        if (l.id === 'guard' && st.guardArmed && !sev) sev = 'info'
        const state = sev === 'crit' ? 'red' : sev === 'warn' ? 'amber' : sev === 'info' ? (l.id === 'guard' ? 'green' : 'amber') : undefined
        return (
          <li key={l.id} data-light={state} title={`${l.name}${state ? '' : ', clear'}`}>
            {SYMBOLS[l.sym]}
            <span className="sr-only">
              {l.name} {state ? 'on' : 'off'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
