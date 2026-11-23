import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { startAlarms } from './core/alarms'
import { startTrip } from './core/trip'
import { startWatchers } from './core/watchers'
import { unlockAudio } from './core/audio'
import { connectHomebase, homebaseUrl } from './sources/homebase'
import { startSim, setScenario, SCENARIOS } from './sources/sim'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/screens.css'

startAlarms()
startTrip()
startWatchers()

// on the pi (or anything on the lan) talk to the homebase. anywhere else, like the
// portfolio demo, there's no hardware so the sim runs. ?sim forces it either way
const params = new URLSearchParams(location.search)
if (params.has('sim') || !homebaseUrl()) {
  startSim()
  const sc = SCENARIOS.find((x) => x.id === params.get('sim'))
  if (sc) setScenario(sc.id)
} else {
  connectHomebase()
}

window.addEventListener('pointerdown', unlockAudio, { once: true })
window.addEventListener('keydown', unlockAudio, { once: true })

// keep the camper screen awake
async function wake() {
  try {
    await navigator.wakeLock?.request('screen')
  } catch {
    /* not allowed until a gesture, retry on visibility */
  }
}
wake()
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake())

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
