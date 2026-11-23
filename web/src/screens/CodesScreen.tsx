import { useState } from 'react'
import { Panel } from '../ui/Readout'
import { useTel } from '../ui/hooks'
import { app } from '../core/state'
import { readCodes, clearCodes, obdConnected } from '../obd/session'
import { describe, system } from '../obd/dtc'
import { logEvent } from '../core/events'
import { profile, useSettings } from '../core/settings'
import type { ScreenId } from '../ui/Chrome'

interface Result {
  stored: string[]
  pending: string[]
  at: number
}

function CodeList({ codes, kind }: { codes: string[]; kind: string }) {
  if (!codes.length) return <p className="muted">None {kind === 'stored' ? 'stored' : 'pending'}.</p>
  return (
    <ul className="codes">
      {codes.map((c) => (
        <li key={c}>
          <span className="code num">{c}</span>
          <span>
            {describe(c)}
            <span className="faint"> {system(c)}</span>
          </span>
          <a className="text-btn" href={`https://www.google.com/search?q=${encodeURIComponent(c + ' ' + profile().name)}`} target="_blank" rel="noreferrer">
            Search
          </a>
        </li>
      ))}
    </ul>
  )
}

export function CodesScreen({ go }: { go: (s: ScreenId) => void }) {
  const tel = useTel()
  const st = app.use()
  useSettings()
  const [res, setRes] = useState<Result>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const live = st.obd === 'live'
  const mil = tel.fresh('mil', 60000)
  const count = tel.fresh('dtcCount', 60000)

  const read = async () => {
    setBusy(true)
    setErr('')
    try {
      if (live && obdConnected()) {
        const r = await readCodes()
        setRes({ ...r, at: Date.now() })
        logEvent('dtc', r.stored.length || r.pending.length ? `Read codes: ${[...r.stored, ...r.pending].join(', ')}` : 'Read codes, none stored', r.stored.length ? 'warn' : 'info')
      } else if (st.sim) {
        await new Promise((r) => setTimeout(r, 700))
        // the sim always has the classic 6.0 backpressure sensor code pending, because of course it does
        setRes({ stored: [], pending: profile().fuel === 'diesel' ? ['P0471'] : ['P0442'], at: Date.now() })
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setConfirm(false)
    setBusy(true)
    setErr('')
    try {
      if (live) await clearCodes()
      setRes({ stored: [], pending: [], at: Date.now() })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!live && !st.sim) {
    return (
      <div className="screen">
        <div className="empty">
          <h2>No OBD adapter</h2>
          <button className="btn primary" onClick={() => go('setup')}>
            Connect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen codes-screen">
      <Panel title="Check engine">
        <div className="mil" data-on={mil === 1 || undefined}>
          <svg viewBox="0 0 48 32" aria-hidden="true">
            <path d="M8 10h6l2-4h10l2 4h6v4h4v-4h4v14h-4v-4h-4v6H14l-3-5H8v4H4V10z" fill="currentColor" />
          </svg>
          <div>
            <p className="big">{mil === undefined ? 'Unknown' : mil ? 'On' : 'Off'}</p>
            <p className="muted num">{count === undefined ? '--' : `${count} stored`}</p>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn primary" onClick={read} disabled={busy}>
            {busy ? 'Reading' : 'Read'}
          </button>
          {!confirm ? (
            <button className="btn" onClick={() => setConfirm(true)} disabled={busy || !res}>
              Clear
            </button>
          ) : (
            <>
              <button className="btn danger" onClick={clear}>
                Clear, resets monitors
              </button>
              <button className="btn ghost" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
        {err && <p className="error">{err}</p>}
      </Panel>

      {res && (
        <>
          <Panel title="Stored">
            <CodeList codes={res.stored} kind="stored" />
          </Panel>
          <Panel title="Pending">
            <CodeList codes={res.pending} kind="pending" />
          </Panel>
        </>
      )}
    </div>
  )
}
