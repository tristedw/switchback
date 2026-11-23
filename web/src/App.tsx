import { useEffect, useState } from 'react'
import { TopBar, Nav, AlarmStack, SCREENS, type ScreenId } from './ui/Chrome'
import { RigScreen } from './screens/RigScreen'
import { DriveScreen } from './screens/DriveScreen'
import { CampScreen } from './screens/CampScreen'
import { SkyScreen } from './screens/SkyScreen'
import { CodesScreen } from './screens/CodesScreen'
import { LogScreen } from './screens/LogScreen'
import { SetupScreen } from './screens/SetupScreen'
import { useSettings, type ThemeMode } from './core/settings'
import { useAlarms, ackAll } from './core/alarms'
import { sunPosition } from './core/sky'
import { useNow } from './ui/hooks'

function resolveTheme(mode: ThemeMode, lat: number, lon: number, now: number) {
  if (mode !== 'auto') return mode
  // auto stays on next unless it's proper night, the white one is opt in for glare
  return sunPosition(now, lat, lon).altitude < -12 ? 'night' : 'dusk'
}

function initialScreen(): ScreenId {
  const h = location.hash.slice(1) as ScreenId
  return SCREENS.some((s) => s.id === h) ? h : 'rig'
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>(initialScreen)
  const s = useSettings()
  const alarms = useAlarms()
  const now = useNow(60000)

  const go = (id: ScreenId) => {
    setScreen(id)
    history.replaceState(null, '', `#${id}`)
  }

  const theme = resolveTheme(s.theme, s.lat, s.lon, now)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())
  }, [theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      const sc = SCREENS.find((x) => x.key === e.key)
      if (sc) go(sc.id)
      if (e.key === 'Escape') ackAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const unacked = alarms.filter((a) => !a.acked).length
  const badges: Partial<Record<ScreenId, number>> = { rig: unacked }

  return (
    <div className="shell">
      <TopBar onNav={go} />
      <main className="main" id="main">
        <AlarmStack />
        {screen === 'rig' && <RigScreen go={go} />}
        {screen === 'drive' && <DriveScreen />}
        {screen === 'camp' && <CampScreen />}
        {screen === 'sky' && <SkyScreen />}
        {screen === 'codes' && <CodesScreen go={go} />}
        {screen === 'log' && <LogScreen />}
        {screen === 'setup' && <SetupScreen />}
      </main>
      <Nav current={screen} onNav={go} badges={badges} />
    </div>
  )
}
