import { tel } from './store'
import { logEvent } from './events'
import { sunPosition } from './sky'
import { getSettings } from './settings'

// little edge triggered loggers that aren't alarms, just things worth a line in the log

let lastPir = 0
let lastVisitorAt = 0
let lastDoor = 0

export function startWatchers() {
  tel.tap((key, r) => {
    if (key === 'pir') {
      if (r.v === 1 && lastPir === 0) {
        const s = getSettings()
        const dark = sunPosition(Date.now(), s.lat, s.lon).altitude < -6
        const engine = (tel.fresh('rpm', 4000) ?? 0) > 300
        // only interesting at night with nobody up, and not every twitch
        if ((dark || r.src === 'sim') && !engine && r.t - lastVisitorAt > 120000) {
          lastVisitorAt = r.t
          logEvent('visitor', 'Motion outside', 'info', r.t)
        }
      }
      lastPir = r.v
    } else if (key === 'door.camper') {
      if (r.v === 1 && lastDoor === 0) logEvent('note', 'Camper door opened', 'info', r.t)
      lastDoor = r.v
    }
  })
}
