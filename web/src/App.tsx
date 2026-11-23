import { useEffect, useState } from 'react'
import { MainMenu, Dock, AlarmStack, SCREENS, type ScreenId } from './ui/Chrome'
import { ScreenCtx, MiniTray, wm } from './ui/Window'
import { RigScreen } from './screens/RigScreen'
import { DriveScreen } from './screens/DriveScreen'
import { CampScreen } from './screens/CampScreen'
import { SkyScreen } from './screens/SkyScreen'
import { CodesScreen } from './screens/CodesScreen'
import { LogScreen } from './screens/LogScreen'
import { SetupScreen } from './screens/SetupScreen'
import { useSettings, type ThemeMode } from './core/settings'
import { ackAll } from './core/alarms'
import { sunPosition } from './core/sky'
import { useNow } from './ui/hooks'

// auto goes red once it's properly dark out
function resolveTheme(mode: ThemeMode, lat: number, lon: number, now: number) {
  if (mode !== 'auto') return mode
  return sunPosition(now, lat, lon).altitude < -12 ? 'night' : 'dusk'
}

function initialScreen(): ScreenId {
  const h = location.hash.slice(1) as ScreenId
  return SCREENS.some((s) => s.id === h) ? h : 'rig'
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>(initialScreen)
  const s = useSettings()
  const now = useNow(60000)

  const go = (id: ScreenId) => {
    setScreen(id)
    wm.set({ key: '' })
    history.replaceState(null, '', `#${id}`)
  }

  const theme = resolveTheme(s.theme, s.lat, s.lon, now)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
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

  return (
    <ScreenCtx.Provider value={screen}>
      <div className="workspace">
        <MainMenu current={screen} onNav={go} nightOn={theme === 'night'} />
        <main className="desk" id="main">
          <div className="desk-inner">
            <AlarmStack />
            {screen === 'rig' && <RigScreen go={go} />}
            {screen === 'drive' && <DriveScreen />}
            {screen === 'camp' && <CampScreen />}
            {screen === 'sky' && <SkyScreen />}
            {screen === 'codes' && <CodesScreen go={go} />}
            {screen === 'log' && <LogScreen />}
            {screen === 'setup' && <SetupScreen />}
            <MiniTray />
          </div>
        </main>
        <Dock onNav={go} />
      </div>
    </ScreenCtx.Provider>
  )
}
