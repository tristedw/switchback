import { useTel } from './hooks'
import { useSettings } from '../core/settings'
import { temp, tempUnit } from '../core/units'
import { currentLevel } from '../core/level'

const EXAGGERATE = 3

function Tank({ x, y, w, h, pct, label, color }: { x: number; y: number; w: number; h: number; pct?: number; label: string; color: string }) {
  const p = pct === undefined ? 0 : Math.max(0, Math.min(100, pct)) / 100
  const fh = (h - 4) * p
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="5" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="1.6" />
      <rect className="tank-fill" x={x + 2} y={y + h - 2 - fh} width={w - 4} height={fh} rx="3" fill={color} />
      <text x={x + w / 2} y={y + h + 14} textAnchor="middle" className="rig-label">
        {label}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" className="rig-pct num">
        {pct === undefined ? '--' : Math.round(pct)}
      </text>
    </g>
  )
}

function Wheel({ cx, cy, spinning, speed }: { cx: number; cy: number; spinning: boolean; speed: number }) {
  // spin rate scales with speed, capped so it doesn't strobe
  const dur = spinning ? Math.max(0.25, 3 - speed / 40) : 0
  return (
    <g>
      <circle cx={cx} cy={cy} r="34" fill="var(--canvas)" stroke="var(--rig-line)" strokeWidth="2.4" />
      <circle cx={cx} cy={cy} r="20" fill="none" stroke="var(--rig-line)" strokeWidth="1.4" />
      <g className="spokes" style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: `${dur}s`, animationPlayState: spinning ? 'running' : 'paused' }}>
        {[0, 72, 144, 216, 288].map((a) => (
          <line key={a} x1={cx} y1={cy} x2={cx + 18 * Math.sin((a * Math.PI) / 180)} y2={cy - 18 * Math.cos((a * Math.PI) / 180)} stroke="var(--rig-line)" strokeWidth="1.4" />
        ))}
      </g>
      <circle cx={cx} cy={cy} r="4" fill="var(--rig-line)" />
    </g>
  )
}

export function Rig() {
  const tel = useTel()
  const s = useSettings()
  const g = (k: string, age = 30000) => tel.fresh(k, age)

  const pitch = currentLevel().pitch ?? 0
  const speed = g('speed', 4000) ?? 0
  const engine = (g('rpm', 4000) ?? 0) > 300
  const soc = g('house.soc')
  const solar = g('solar.w') ?? 0
  const door = g('door.camper', 10000) === 1
  const fridgeDoor = g('door.fridge', 10000) === 1
  const fridgeT = g('fridge.t')
  const ect = g('ect', 6000)
  const propane = g('propane')
  const propanePct = propane === undefined ? undefined : (propane / s.propaneKg) * 100
  const furnace = g('furnace') === 1
  const hot = ect !== undefined && ect >= s.thresholds.coolantWarn

  // pivot on whichever axle is low so the drawing never sinks into the ground
  const tilt = -pitch * EXAGGERATE
  const pivot = pitch >= 0 ? '180px 252px' : '500px 252px'

  return (
    <svg className="rig" viewBox="0 0 640 290" role="img" aria-label="Truck and camper status drawing">
      <line x1="10" x2="630" y1="252" y2="252" stroke="var(--ground)" strokeWidth="2" />
      <line x1="40" x2="600" y1="252" y2="252" stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 6" transform={`rotate(${tilt} ${pitch >= 0 ? 180 : 500} 252)`} opacity="0.6" />

      <g className="rig-body" style={{ transform: `rotate(${tilt}deg)`, transformOrigin: pivot }}>
        {/* bed and frame */}
        <path d="M100 196 H370 V214 H100 Z" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="2" />

        {/* truck cab and hood. hood picks up heat colour when coolant is high */}
        <path d="M370 214 V122 Q372 112 384 112 H446 Q456 112 462 122 L486 160 H560 Q578 162 582 178 V214 Z" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="2.2" />
        <path d="M486 160 H560 Q578 162 582 178 V214 H486 Z" className="hood" fill={hot ? 'var(--heat)' : 'transparent'} opacity={hot ? 0.35 : 0} />
        <path d="M384 124 H442 L462 158 H384 Z" fill="none" stroke="var(--rig-line)" strokeWidth="1.6" />
        <line x1="420" y1="124" x2="420" y2="208" stroke="var(--rig-line)" strokeWidth="1.2" />
        <rect x="574" y="176" width="10" height="10" rx="2" fill={engine ? 'var(--power)' : 'none'} stroke="var(--rig-line)" strokeWidth="1.4" />

        {/* slide in camper */}
        <path d="M96 196 V82 Q96 66 112 66 H436 Q462 66 464 86 L466 104 Q466 116 452 116 H376 V196 Z" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="2.4" />
        {/* solar on the roof */}
        <rect x="150" y="58" width="180" height="6" rx="1.5" fill={solar > 5 ? 'var(--power)' : 'var(--ink-3)'} opacity={solar > 5 ? 0.4 + Math.min(solar / 400, 0.6) : 0.6} />
        <text x="240" y="50" textAnchor="middle" className="rig-label num">
          {Math.round(solar)} W
        </text>

        {/* cabover window */}
        <path d="M402 78 H440 Q452 78 452 92 V102 H402 Z" fill="none" stroke="var(--rig-line)" strokeWidth="1.4" />
        {/* side window, warm when the furnace is going */}
        <rect x="292" y="84" width="58" height="34" rx="4" fill={furnace ? 'var(--power)' : 'none'} fillOpacity="0.18" stroke="var(--rig-line)" strokeWidth="1.4" />

        {/* entry door, swings open */}
        <rect x="108" y="92" width="38" height="96" rx="3" fill={door ? 'var(--heat)' : 'none'} fillOpacity="0.25" stroke={door ? 'var(--heat)' : 'var(--rig-line)'} strokeWidth="1.8" />
        <circle cx="140" cy="142" r="2.4" fill="var(--rig-line)" />

        {/* fridge */}
        <rect x="160" y="82" width="40" height="64" rx="3" fill="none" stroke={fridgeDoor ? 'var(--heat)' : 'var(--rig-line)'} strokeWidth="1.4" strokeDasharray={fridgeDoor ? '4 3' : undefined} />
        <text x="180" y="120" textAnchor="middle" className="rig-pct num">
          {fridgeT === undefined ? '--' : `${Math.round(temp(fridgeT, s.units))}°`}
        </text>

        {/* house battery */}
        <rect x="210" y="122" width="62" height="34" rx="3" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="1.6" />
        <rect x="272" y="132" width="5" height="14" rx="1" fill="var(--rig-line)" />
        <rect x="212" y="124" width={(58 * Math.max(0, Math.min(100, soc ?? 0))) / 100} height="30" rx="2" fill="var(--power)" opacity="0.85" />
        <text x="241" y="145" textAnchor="middle" className="rig-pct num rig-on-fill">
          {soc === undefined ? '--' : `${Math.round(soc)}%`}
        </text>

        <Tank x={210} y={160} w={36} h={30} pct={g('fresh', 60000)} label="fresh" color="var(--water)" />
        <Tank x={252} y={160} w={36} h={30} pct={g('grey', 60000)} label="grey" color="var(--ink-3)" />
        <Tank x={294} y={160} w={36} h={30} pct={g('black', 60000)} label="black" color="var(--ink-2)" />

        {/* propane bottle */}
        <path d="M340 190 V146 Q340 132 352 132 Q364 132 364 146 V190 Z" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="1.6" />
        <rect x="342" y={190 - (54 * Math.max(0, Math.min(100, propanePct ?? 0))) / 100} width="20" height={(54 * Math.max(0, Math.min(100, propanePct ?? 0))) / 100} fill="var(--heat)" opacity="0.35" />
        <text x="352" y="166" textAnchor="middle" className="rig-pct num" style={{ fontSize: 10 }}>
          LP
        </text>

        <Wheel cx={180} cy={218} spinning={speed > 1} speed={speed} />
        <Wheel cx={500} cy={218} spinning={speed > 1} speed={speed} />

        {engine && (
          <g className="exhaust">
            <circle cx="92" cy="208" r="5" />
            <circle cx="80" cy="202" r="7" />
          </g>
        )}
      </g>

      <text x="14" y="276" className="rig-label">
        tilt drawn {EXAGGERATE}x
      </text>
      <text x="626" y="276" textAnchor="end" className="rig-label num">
        {ect === undefined ? 'engine off' : `coolant ${Math.round(temp(ect, s.units))}${tempUnit(s.units)}`}
      </text>
    </svg>
  )
}

// view from behind for roll. bubble level style
export function RearView({ roll, size = 160 }: { roll: number | undefined; size?: number }) {
  const r = roll ?? 0
  return (
    <svg className="rearview" viewBox="0 0 160 130" style={{ maxWidth: size }} role="img" aria-label={`Roll ${r.toFixed(1)} degrees`}>
      <line x1="6" x2="154" y1="118" y2="118" stroke="var(--ground)" strokeWidth="2" />
      {/* looking from behind, driver side on the left. passenger side up tips it counterclockwise */}
      <g style={{ transform: `rotate(${-r * EXAGGERATE}deg)`, transformOrigin: r >= 0 ? '45px 118px' : '115px 118px', transition: 'transform 0.4s' }}>
        <rect x="28" y="20" width="104" height="80" rx="6" fill="var(--rig-fill)" stroke="var(--rig-line)" strokeWidth="2" />
        <rect x="64" y="40" width="32" height="56" rx="2" fill="none" stroke="var(--rig-line)" strokeWidth="1.4" />
        <rect x="36" y="100" width="18" height="18" rx="3" fill="var(--rig-line)" />
        <rect x="106" y="100" width="18" height="18" rx="3" fill="var(--rig-line)" />
        <line x1="40" x2="120" y1="30" y2="30" stroke="var(--power)" strokeWidth="2" />
      </g>
    </svg>
  )
}
