import { useRef, useState } from 'react'
import { Panel } from '../ui/Readout'
import { useEvents, clearEvents, type LogEvent } from '../core/events'
import { tripStore } from '../core/trip'
import { app } from '../core/state'
import { useSettings } from '../core/settings'
import * as U from '../core/units'
import { startRecording, stopRecording, downloadCsv, parseCsv, replay, stopReplay, recordedCount } from '../core/recorder'
import { service, markDone, addService, removeService, dueIn, odometer } from '../core/maintenance'
import { useNow } from '../ui/hooks'

type Filter = 'all' | 'alarm' | 'visitor' | 'trip' | 'conn'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'alarm', label: 'Alarms' },
  { id: 'visitor', label: 'Motion' },
  { id: 'trip', label: 'Trips' },
  { id: 'conn', label: 'Connections' },
]

function dayLabel(t: number) {
  const d = new Date(t)
  const today = new Date()
  const y = new Date(Date.now() - 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function matches(e: LogEvent, f: Filter) {
  if (f === 'all') return true
  if (f === 'alarm') return e.kind === 'alarm' || e.kind === 'clear' || e.kind === 'guard'
  return e.kind === f
}

export function LogScreen() {
  const events = useEvents()
  const { history } = tripStore.use()
  const { items } = service.use()
  const st = app.use()
  const s = useSettings()
  useNow(5000)
  const [filter, setFilter] = useState<Filter>('all')
  const [newName, setNewName] = useState('')
  const [newKm, setNewKm] = useState('10000')
  const file = useRef<HTMLInputElement>(null)
  const u = s.units

  const list = events.filter((e) => matches(e, filter)).slice(0, 200)
  let lastDay = ''
  const odo = odometer()

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const data = parseCsv(await f.text())
    replay(data, 1)
  }

  return (
    <div className="screen log-screen">
      <Panel primary title="Timeline" className="timeline" aside={<button className="text-btn" onClick={() => confirm('Clear the whole log?') && clearEvents()}>Clear log</button>}>
        <div className="seg" role="tablist" aria-label="Filter log">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {!list.length && <p className="muted">Empty.</p>}
        <ol className="events">
          {list.map((e) => {
            const day = dayLabel(e.t)
            const header = day !== lastDay ? day : null
            lastDay = day
            return (
              <li key={e.id} data-sev={e.sev} data-kind={e.kind}>
                {header && <h3 className="event-day">{header}</h3>}
                <time className="num">{U.fmtClock(e.t)}</time>
                <span>{e.text}</span>
              </li>
            )
          })}
        </ol>
      </Panel>

      <div className="log-side">
        <Panel title="Recording" aside={st.recording ? <span className="rec num">{recordedCount().toLocaleString()} samples</span> : undefined}>
          <div className="btn-row wrap">
            {st.recording ? (
              <button className="btn danger" onClick={stopRecording}>
                Stop
              </button>
            ) : (
              <button className="btn primary" onClick={startRecording}>
                Record
              </button>
            )}
            <button className="btn" onClick={() => downloadCsv()} disabled={!recordedCount()}>
              Download CSV
            </button>
            {st.replaying ? (
              <button className="btn" onClick={stopReplay}>
                Stop replay
              </button>
            ) : (
              <button className="btn" onClick={() => file.current?.click()}>
                Replay CSV
              </button>
            )}
            <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </Panel>

        <Panel title="Service" aside={<span className="faint num">odo {Math.round(U.dist(odo, u)).toLocaleString()} {U.distUnit(u)}</span>}>
          <ul className="service">
            {items
              .slice()
              .sort((a, b) => dueIn(a, odo) - dueIn(b, odo))
              .map((it) => {
                const due = dueIn(it, odo)
                const state = due < 0 ? 'over' : due < it.everyKm * 0.1 ? 'soon' : undefined
                return (
                  <li key={it.id} data-state={state}>
                    <div>
                      <strong>{it.name}</strong>
                      <span className="muted small num">
                        {due < 0 ? `${Math.round(U.dist(-due, u)).toLocaleString()} ${U.distUnit(u)} overdue` : `due in ${Math.round(U.dist(due, u)).toLocaleString()} ${U.distUnit(u)}`}
                      </span>
                    </div>
                    <button className="text-btn" onClick={() => markDone(it.id)}>
                      Done
                    </button>
                    <button className="text-btn faint" onClick={() => removeService(it.id)} aria-label={`Remove ${it.name}`}>
                      Remove
                    </button>
                  </li>
                )
              })}
          </ul>
          <form
            className="add-service"
            onSubmit={(e) => {
              e.preventDefault()
              const km = Number(newKm)
              if (newName.trim() && km > 0) {
                addService(newName.trim(), km)
                setNewName('')
              }
            }}
          >
            <label>
              <span className="muted small">Item</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Glow plugs" />
            </label>
            <label>
              <span className="muted small">Every km</span>
              <input value={newKm} onChange={(e) => setNewKm(e.target.value)} inputMode="numeric" />
            </label>
            <button className="btn" type="submit">
              Add
            </button>
          </form>
        </Panel>

        <Panel title="Past trips">
          {!history.length && <p className="muted">None yet.</p>}
          <table className="trips">
            <tbody>
              {history.slice(0, 12).map((t) => (
                <tr key={t.start}>
                  <td>{new Date(t.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                  <td className="num">
                    {U.dist(t.km, u).toFixed(1)} {U.distUnit(u)}
                  </td>
                  <td className="num">{t.litres > 0 && t.km > 1 ? `${U.economy((t.litres / t.km) * 100, u).toFixed(1)} ${U.economyUnit(u)}` : '--'}</td>
                  <td className="num faint">{U.fmtDuration(t.movingMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}
