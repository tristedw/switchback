interface Props {
  value: number | undefined
  min: number
  max: number
  label: string
  unit: string
  warnFrom?: number
  critFrom?: number
  majors?: number // number of labelled ticks
  minors?: number // between majors
  tickLabel?: (v: number) => string
  digits?: number
  size?: number
  shift?: boolean // flash the face for a shift light
  legend?: string // printed on the face, like x1000 r/min
}

const SWEEP = 125
const rad = Math.PI / 180

function pt(cx: number, cy: number, r: number, deg: number) {
  return [cx + r * Math.sin(deg * rad), cy - r * Math.cos(deg * rad)]
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = pt(cx, cy, r, a0)
  const [x1, y1] = pt(cx, cy, r, a1)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

// analog gauge, drawn like the old cluster faces: heavy ticks, one fat needle, no glow
export function Gauge({ value, min, max, label, unit, warnFrom, critFrom, majors = 6, minors = 4, tickLabel, digits = 0, size = 260, shift, legend }: Props) {
  const cx = 100
  const cy = 100
  const r = 80
  const ang = (v: number) => -SWEEP + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * SWEEP * 2
  const ticks: JSX.Element[] = []
  const total = (majors - 1) * minors

  for (let i = 0; i <= total; i++) {
    const v = min + ((max - min) * i) / total
    const a = ang(v)
    const major = i % minors === 0
    const [x0, y0] = pt(cx, cy, r, a)
    const [x1, y1] = pt(cx, cy, r - (major ? 13 : 6), a)
    const hot = critFrom !== undefined && v >= critFrom
    ticks.push(<line key={`t${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke={hot ? 'var(--heat)' : 'var(--cink)'} strokeWidth={major ? 3 : 1.5} />)
    if (major) {
      const [lx, ly] = pt(cx, cy, r - 25, a)
      ticks.push(
        <text key={`l${i}`} x={lx} y={ly + 4} textAnchor="middle" className="gauge-tick">
          {tickLabel ? tickLabel(v) : Math.round(v)}
        </text>
      )
    }
  }

  const has = value !== undefined && Number.isFinite(value)
  const needleAng = has ? ang(value!) : -SWEEP
  const state = has && critFrom !== undefined && value! >= critFrom ? 'crit' : has && warnFrom !== undefined && value! >= warnFrom ? 'warn' : 'ok'

  return (
    <figure className="gauge" data-state={state} data-shift={shift ? 'on' : undefined} style={{ maxWidth: size }}>
      <svg viewBox="0 0 200 200" role="img" aria-label={`${label} ${has ? value!.toFixed(digits) : 'no data'} ${unit}`}>
        <circle cx={cx} cy={cy} r="97" fill="var(--canvas)" stroke="var(--edge)" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="93" fill="none" stroke="var(--lo)" strokeWidth="2" />
        {warnFrom !== undefined && <path d={arc(cx, cy, r + 5, ang(warnFrom), ang(critFrom ?? max))} fill="none" stroke="var(--amber)" strokeWidth="4" />}
        {critFrom !== undefined && <path d={arc(cx, cy, r + 5, ang(critFrom), SWEEP)} fill="none" stroke="var(--heat)" strokeWidth="6" />}
        {ticks}
        {legend && (
          <text x={cx} y={cy - 30} textAnchor="middle" className="gauge-legend">
            {legend}
          </text>
        )}
        <text x={cx} y={cy + 58} textAnchor="middle" className="gauge-value">
          {has ? value!.toFixed(digits) : '--'}
        </text>
        <text x={cx} y={cy + 76} textAnchor="middle" className="gauge-unit">
          {unit}
        </text>
        <g className="needle" style={{ transform: `rotate(${needleAng}deg)` }}>
          <path d={`M${cx - 3.5} ${cy + 16} L${cx - 1.2} ${cy - r + 4} L${cx + 1.2} ${cy - r + 4} L${cx + 3.5} ${cy + 16} Z`} fill="var(--needle)" />
        </g>
        <rect x={cx - 8} y={cy - 8} width="16" height="16" fill="var(--face)" stroke="var(--edge)" strokeWidth="2" />
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  )
}
