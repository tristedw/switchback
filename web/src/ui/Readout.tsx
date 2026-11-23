import type { ReactNode } from 'react'
import { fmt } from '../core/units'

// numbers sit in a sunken white well, same as the fields in aster's desktop apps
export function Lcd({ text, size = 'md', state, unit }: { text: string; size?: 'sm' | 'md' | 'lg' | 'xl'; state?: 'warn' | 'crit'; unit?: string }) {
  return (
    <span className="lcd" data-size={size} data-state={state}>
      <span className="lcd-digits">{text}</span>
      {unit && <span className="lcd-unit">{unit}</span>}
    </span>
  )
}

const isSeg = (t: string) => /^[0-9.:\- ]+$/.test(t)

interface Props {
  label: string
  value: number | undefined
  // for things that aren't numbers, like on/off
  text?: string
  unit?: string
  digits?: number
  state?: 'ok' | 'warn' | 'crit'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  sub?: ReactNode
}

export function Readout({ label, value, text, unit, digits = 0, state, size = 'md', sub }: Props) {
  const t = text ?? fmt(value, digits)
  const st = state === 'ok' ? undefined : state
  return (
    <div className="readout" data-state={st}>
      {isSeg(t) ? (
        <Lcd text={t} size={size} state={st} unit={unit} />
      ) : (
        <span className="lcd lcd-text" data-size={size} data-state={st}>
          {t}
        </span>
      )}
      <div className="readout-label">
        {label}
        {sub && <span className="readout-sub"> {sub}</span>}
      </div>
    </div>
  )
}

interface MeterProps {
  label: string
  pct: number | undefined
  color?: string
  right?: ReactNode
  invert?: boolean // full is bad (waste tanks)
  warnAt?: number
  steps?: number
}

// led ladder like the monitor panel by the camper door. discrete on purpose,
// tank senders are only good to a quarter or so anyway
export function Meter({ label, pct, color = 'var(--water)', right, invert, warnAt, steps = 10 }: MeterProps) {
  const p = pct === undefined ? 0 : Math.max(0, Math.min(100, pct))
  const lit = pct === undefined ? 0 : Math.max(pct > 0.5 ? 1 : 0, Math.round((p / 100) * steps))
  const bad = pct !== undefined && warnAt !== undefined && (invert ? pct >= warnAt : pct <= warnAt)
  return (
    <div className="ladder" data-bad={bad || undefined}>
      <span className="ladder-label">{label}</span>
      <span className="ladder-leds" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === undefined ? undefined : Math.round(p)} aria-label={label}>
        {Array.from({ length: steps }, (_, i) => (
          <i key={i} data-on={i < lit || undefined} style={i < lit ? { background: bad ? 'var(--heat)' : color, color: bad ? 'var(--heat)' : color } : undefined} />
        ))}
      </span>
      <span className="ladder-val num">{right ?? (pct === undefined ? '--' : `${Math.round(p)}%`)}</span>
    </div>
  )
}

export function Panel({ title, aside, children, className = '', span }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; span?: number }) {
  return (
    <section className={`panel ${className}`} style={span ? { gridColumn: `span ${span}` } : undefined}>
      {(title || aside) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {aside && <div className="panel-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
