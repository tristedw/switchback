// hand drawn 24px stroke icons, all on the same grid so they sit together

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const Icon = {
  rig: () => (
    <svg {...base}>
      <path d="M2 16V9h7l3 3h3V7h7v9" />
      <circle cx="6" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M8 17h7M19 17h3" />
    </svg>
  ),
  drive: () => (
    <svg {...base}>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4-5" />
      <path d="M4 17h2M18 17h2M12 9V7" />
    </svg>
  ),
  camp: () => (
    <svg {...base}>
      <path d="M3 20L12 5l9 15" />
      <path d="M9 20l3-5 3 5" />
      <path d="M2 20h20" />
    </svg>
  ),
  sky: () => (
    <svg {...base}>
      <path d="M3 17h18" />
      <path d="M7 17a5 5 0 0 1 10 0" />
      <path d="M12 6V4M5.6 9.6 4.2 8.2M18.4 9.6l1.4-1.4" />
    </svg>
  ),
  codes: () => (
    <svg {...base}>
      <path d="M6 8h12l1 4v6H5v-6z" />
      <path d="M9 8V5h6v3" />
      <path d="M9 13h.01M12 13h.01M15 13h.01" />
    </svg>
  ),
  log: () => (
    <svg {...base}>
      <path d="M6 4h10l3 3v13H6z" />
      <path d="M9 10h7M9 14h7M9 18h4" />
    </svg>
  ),
  setup: () => (
    <svg {...base}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  moon: () => (
    <svg {...base}>
      <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" />
    </svg>
  ),
  sun: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  ),
  eye: () => (
    <svg {...base}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
  expand: () => (
    <svg {...base}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  bell: () => (
    <svg {...base}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  shield: () => (
    <svg {...base}>
      <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  ),
}

// the logo. a switchback, two hairpins up a hill
export function Mark() {
  return (
    <svg viewBox="0 0 26 18" aria-hidden="true">
      <path d="M2 16 L9 6 L14 12 L20 3 L24 8" fill="none" stroke="var(--power)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
