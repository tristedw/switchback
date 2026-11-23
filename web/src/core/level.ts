import { tel } from './store'
import { getSettings, updateSettings } from './settings'

// pitch + means nose up, roll + means passenger side up. sensor sits on the camper floor

// calibrated pitch/roll. raw values from the mpu go through here so the zero offset applies everywhere
export function currentLevel(maxAge = 15000) {
  const p = tel.fresh('pitch', maxAge)
  const r = tel.fresh('roll', maxAge)
  const s = getSettings()
  return {
    pitch: p === undefined ? undefined : p - s.pitchZero,
    roll: r === undefined ? undefined : r - s.rollZero,
  }
}

// park on something you trust is flat, hit this, done
export function calibrateLevel() {
  const p = tel.fresh('pitch', 15000)
  const r = tel.fresh('roll', 15000)
  if (p === undefined || r === undefined) return false
  updateSettings({ pitchZero: p, rollZero: r })
  return true
}

export function clearLevelCal() {
  updateSettings({ pitchZero: 0, rollZero: 0 })
}
