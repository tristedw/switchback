import { useTel } from './hooks'
import { useSettings } from '../core/settings'
import { temp, tempUnit } from '../core/units'
import { currentLevel } from '../core/level'

// drawn like a NeXT icon: grey bodies with a light top and dark bottom, black outline,
// dark glass with a glint. scale is roughly 64px to the metre, F250 with an 8ft slide in

const EXAGGERATE = 3
const GROUND = 240

function Defs({ p }: { p: string }) {
  return (
    <defs>
      <linearGradient id={`${p}-body`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--veh-hi)' }} />
        <stop offset="1" style={{ stopColor: 'var(--veh-lo)' }} />
      </linearGradient>
      <linearGradient id={`${p}-shell`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--shell-hi)' }} />
        <stop offset="1" style={{ stopColor: 'var(--shell-lo)' }} />
      </linearGradient>
      <linearGradient id={`${p}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--glass-hi)' }} />
        <stop offset="1" style={{ stopColor: 'var(--glass-lo)' }} />
      </linearGradient>
      <radialGradient id={`${p}-rim`} cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" style={{ stopColor: 'var(--veh-hi)' }} />
        <stop offset="1" style={{ stopColor: 'var(--veh-lo)' }} />
      </radialGradient>
    </defs>
  )
}

function Wheel({ cx, cy, p, spinning, speed }: { cx: number; cy: number; p: string; spinning: boolean; speed: number }) {
  const dur = spinning ? Math.max(0.25, 3 - speed / 40) : 0
  return (
    <g>
      <circle cx={cx} cy={cy} r="26" fill="var(--tire)" stroke="var(--veh-line)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r="21" fill="none" stroke="var(--tire-wall)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="14" fill={`url(#${p}-rim)`} stroke="var(--veh-line)" strokeWidth="1" />
      <g className="spokes" style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: `${dur}s`, animationPlayState: spinning ? 'running' : 'paused' }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <circle key={a} cx={cx + 9 * Math.sin((a * Math.PI) / 180)} cy={cy - 9 * Math.cos((a * Math.PI) / 180)} r="1.6" fill="var(--veh-line)" />
        ))}
      </g>
      <circle cx={cx} cy={cy} r="4" fill="var(--veh-lo)" stroke="var(--veh-line)" strokeWidth="1" />
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
  const solar = g('solar.w') ?? 0
  const door = g('door.camper', 10000) === 1
  const ect = g('ect', 6000)
  const furnace = g('furnace') === 1
  const hot = ect !== undefined && ect >= s.thresholds.coolantWarn
  const p = 'rig'

  const tilt = -pitch * EXAGGERATE
  const pivot = pitch >= 0 ? `277px ${GROUND}px` : `542px ${GROUND}px`

  return (
    <svg className="rig" viewBox="160 22 466 248" role="img" aria-label="Truck and camper">
      <Defs p={p} />
      <line x1="160" x2="626" y1={GROUND} y2={GROUND} stroke="var(--ground)" strokeWidth="1" />
      {/* level reference, tilts with the rig */}
      <line x1="60" x2="620" y1={GROUND} y2={GROUND} stroke="var(--ground)" strokeWidth="1" strokeDasharray="1 5" transform={`rotate(${tilt} ${pitch >= 0 ? 277 : 542} ${GROUND})`} />

      <g className="rig-body" style={{ transform: `rotate(${tilt}deg)`, transformOrigin: pivot }}>
        {/* truck: front bumper at 600, axles at 277 and 542 */}
        <path
          d="M196 172 H420 V124 Q421 118 428 118 H478 Q484 118 487 123 L506 156 H588 Q598 157 599 166 L601 196 Q601 202 595 202 H574 A32 32 0 0 0 510 202 H309 A32 32 0 0 0 245 202 H198 Q194 202 194 197 V176 Q194 172 196 172 Z"
          fill={`url(#${p}-body)`}
          stroke={hot ? 'var(--red)' : 'var(--veh-line)'}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* body crease and hood line */}
        <path d="M200 182 H245 M309 182 H510 M574 182 H598" stroke="var(--veh-crease)" strokeWidth="1" />
        <path d="M506 156 L420 156" stroke="var(--veh-line)" strokeWidth="0.8" opacity="0.5" />
        {/* cab glass */}
        <path d="M428 126 H476 L495 156 H428 Z" fill={`url(#${p}-glass)`} stroke="var(--veh-line)" strokeWidth="1" />
        <path d="M440 130 L452 130 L436 152 L428 152 Z" fill="var(--glint)" opacity="0.35" />
        {/* door seam and handle */}
        <path d="M498 158 V200 M425 158 V200" stroke="var(--veh-line)" strokeWidth="0.8" />
        <rect x="484" y="164" width="9" height="2.5" fill="var(--veh-line)" />
        {/* mirror */}
        <path d="M487 132 h8 v10 h-8 z" fill="var(--veh-lo)" stroke="var(--veh-line)" strokeWidth="1" />
        {/* grille, headlight, bumper */}
        <rect x="594" y="164" width="7" height="11" fill={engine ? 'var(--amber)' : 'var(--glass-lo)'} stroke="var(--veh-line)" strokeWidth="1" />
        <rect x="592" y="190" width="12" height="10" fill="var(--veh-lo)" stroke="var(--veh-line)" strokeWidth="1" />
        <rect x="190" y="190" width="10" height="10" fill="var(--veh-lo)" stroke="var(--veh-line)" strokeWidth="1" />
        <rect x="196" y="176" width="4" height="8" fill="var(--red)" opacity="0.8" />

        {/* slide in camper */}
        <path
          d="M200 172 V58 Q200 48 210 48 H468 Q500 48 508 74 L511 90 Q512 104 498 108 L482 110 H424 V172 Z"
          fill={`url(#${p}-shell)`}
          stroke={door ? 'var(--red)' : 'var(--veh-line)'}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* the three band decal, every camper from the 80s had one */}
        <path d="M200 120 H424" stroke="var(--stripe-1)" strokeWidth="4" />
        <path d="M200 126 H424" stroke="var(--stripe-2)" strokeWidth="2.5" />
        <path d="M200 131 H424" stroke="var(--stripe-3)" strokeWidth="1.5" />
        <path d="M424 100 Q470 100 500 96" stroke="var(--stripe-1)" strokeWidth="3" fill="none" />
        {/* side window, warm when the furnace runs */}
        <rect x="318" y="66" width="70" height="36" rx="3" fill={furnace ? 'var(--amber)' : `url(#${p}-glass)`} fillOpacity={furnace ? 0.55 : 1} stroke="var(--veh-line)" strokeWidth="1" />
        <path d="M328 70 L342 70 L326 98 L322 98 Z" fill="var(--glint)" opacity="0.3" />
        {/* cabover window */}
        <path d="M454 60 H478 Q492 62 496 76 L498 86 H454 Z" fill={`url(#${p}-glass)`} stroke="var(--veh-line)" strokeWidth="1" />
        {/* small window and vents near the rear */}
        <rect x="226" y="70" width="34" height="24" rx="2" fill={`url(#${p}-glass)`} stroke="var(--veh-line)" strokeWidth="1" />
        <rect x="278" y="140" width="22" height="14" fill="none" stroke="var(--veh-crease)" strokeWidth="1" />
        <path d="M281 144 h16 M281 147 h16 M281 150 h16" stroke="var(--veh-crease)" strokeWidth="0.8" />
        {/* corner jacks */}
        <rect x="204" y="150" width="8" height="18" fill="var(--veh-lo)" stroke="var(--veh-line)" strokeWidth="1" />
        <rect x="412" y="150" width="8" height="18" fill="var(--veh-lo)" stroke="var(--veh-line)" strokeWidth="1" />
        {/* rear ladder */}
        <path d="M196 54 V170 M196 64 h-3 M196 84 h-3 M196 104 h-3 M196 124 h-3 M196 144 h-3" stroke="var(--veh-line)" strokeWidth="1.5" />
        {/* roof: vent and solar */}
        <rect x="246" y="42" width="26" height="6" fill="var(--veh-lo)" stroke="var(--veh-line)" strokeWidth="1" />
        <rect x="300" y="43" width="130" height="4" fill={solar > 5 ? 'var(--amber)' : 'var(--glass-lo)'} stroke="var(--veh-line)" strokeWidth="1" />
        <text x="365" y="36" textAnchor="middle" className="rig-label num">
          {Math.round(solar)} W
        </text>
        {door && (
          <text x="200" y="36" textAnchor="middle" className="rig-label rig-alert">
            door open
          </text>
        )}

        <Wheel cx={277} cy={214} p={p} spinning={speed > 1} speed={speed} />
        <Wheel cx={542} cy={214} p={p} spinning={speed > 1} speed={speed} />

        {engine && (
          <g className="exhaust">
            <circle cx="188" cy="206" r="4" />
            <circle cx="178" cy="201" r="6" />
          </g>
        )}
      </g>

      <text x="166" y="262" className="rig-label">
        tilt drawn {EXAGGERATE}x
      </text>
      <text x="620" y="262" textAnchor="end" className="rig-label num">
        {ect === undefined ? 'engine off' : `coolant ${Math.round(temp(ect, s.units))}${tempUnit(s.units)}`}
      </text>
    </svg>
  )
}

// from behind, for roll. passenger side up tips it counterclockwise
export function RearView({ roll, size = 160 }: { roll: number | undefined; size?: number }) {
  const r = roll ?? 0
  const p = 'rear'
  return (
    <svg className="rearview" viewBox="0 0 160 140" style={{ maxWidth: size }} role="img" aria-label={`Roll ${r.toFixed(1)} degrees`}>
      <Defs p={p} />
      <line x1="4" x2="156" y1="128" y2="128" stroke="var(--ground)" />
      <g style={{ transform: `rotate(${-r * EXAGGERATE}deg)`, transformOrigin: r >= 0 ? '46px 128px' : '114px 128px', transition: 'transform 0.4s' }}>
        <rect x="34" y="108" width="22" height="20" rx="3" fill="var(--tire)" stroke="var(--veh-line)" />
        <rect x="104" y="108" width="22" height="20" rx="3" fill="var(--tire)" stroke="var(--veh-line)" />
        <rect x="40" y="96" width="80" height="14" fill={`url(#${p}-body)`} stroke="var(--veh-line)" />
        <path d="M30 98 V24 Q30 16 38 16 H122 Q130 16 130 24 V98 Z" fill={`url(#${p}-shell)`} stroke="var(--veh-line)" strokeWidth="1.5" />
        <rect x="64" y="32" width="32" height="64" fill={`url(#${p}-body)`} stroke="var(--veh-line)" />
        <rect x="70" y="38" width="20" height="16" fill={`url(#${p}-glass)`} stroke="var(--veh-line)" />
        <path d="M30 70 H64 M96 70 H130" stroke="var(--stripe-1)" strokeWidth="3" />
        <line x1="40" x2="120" y1="24" y2="24" stroke="var(--amber)" strokeWidth="1.5" />
      </g>
    </svg>
  )
}

// side on, for pitch
export function PitchView({ pitch }: { pitch: number | undefined }) {
  const v = pitch ?? 0
  const p = 'pitch'
  return (
    <svg className="pitchview" viewBox="0 0 220 120" role="img" aria-label={`Pitch ${v.toFixed(1)} degrees`}>
      <Defs p={p} />
      <line x1="4" x2="216" y1="108" y2="108" stroke="var(--ground)" />
      <g style={{ transform: `rotate(${-v * EXAGGERATE}deg)`, transformOrigin: v >= 0 ? '62px 108px' : '170px 108px', transition: 'transform 0.4s' }}>
        <path d="M24 88 V34 Q24 26 32 26 H164 Q184 26 188 40 L190 52 Q190 58 182 58 H150 V88 Z" fill={`url(#${p}-shell)`} stroke="var(--veh-line)" strokeWidth="1.5" />
        <path d="M24 64 H150" stroke="var(--stripe-1)" strokeWidth="3" />
        <rect x="22" y="86" width="178" height="10" fill={`url(#${p}-body)`} stroke="var(--veh-line)" />
        <circle cx="62" cy="96" r="12" fill="var(--tire)" stroke="var(--veh-line)" />
        <circle cx="170" cy="96" r="12" fill="var(--tire)" stroke="var(--veh-line)" />
        <line x1="40" x2="140" y1="36" y2="36" stroke="var(--amber)" strokeWidth="1.5" />
      </g>
    </svg>
  )
}
