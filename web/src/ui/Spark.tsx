import { useTel } from './hooks'

interface Props {
  k: string
  windowMs?: number
  height?: number
  color?: string
  min?: number
  max?: number
  fill?: boolean
  // horizontal threshold line, eg the coolant warn temp
  mark?: number
  label?: string
}

// sparkline straight off the ring buffer. viewBox is fixed width, stretched by css
export function Spark({ k, windowMs = 5 * 60000, height = 40, color = 'var(--ink-2)', min, max, fill, mark, label }: Props) {
  const tel = useTel()
  const now = Date.now()
  const { t, v } = tel.history(k, now - windowMs)
  const W = 300
  const H = height

  if (v.length < 2) {
    return <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true" />
  }

  let lo = min ?? Math.min(...v)
  let hi = max ?? Math.max(...v)
  if (mark !== undefined) {
    lo = Math.min(lo, mark)
    hi = Math.max(hi, mark)
  }
  if (hi - lo < 1e-6) {
    hi += 1
    lo -= 1
  }
  const x = (ts: number) => ((ts - (now - windowMs)) / windowMs) * W
  const y = (val: number) => H - 2 - ((val - lo) / (hi - lo)) * (H - 4)

  // thin out to ~1 point per pixel column
  const step = Math.max(1, Math.floor(v.length / W))
  let d = ''
  for (let i = 0; i < v.length; i += step) d += `${i ? 'L' : 'M'}${x(t[i]).toFixed(1)},${y(v[i]).toFixed(1)}`
  d += `L${x(t[t.length - 1]).toFixed(1)},${y(v[v.length - 1]).toFixed(1)}`

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label={label ?? `${k} trend`}>
      {fill && <path d={`${d}L${x(t[t.length - 1])},${H}L${x(t[0])},${H}Z`} fill={color} opacity="0.14" />}
      {mark !== undefined && <line x1="0" x2={W} y1={y(mark)} y2={y(mark)} stroke="var(--heat)" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
