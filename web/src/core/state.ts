import { useSyncExternalStore } from 'react'

// tiny observable for app level state that isn't telemetry. didn't want a state lib for this
export function createStore<T extends object>(initial: T) {
  let state = initial
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch }
      subs.forEach((f) => f())
    },
    use(): T {
      return useSyncExternalStore(
        (f) => {
          subs.add(f)
          return () => subs.delete(f)
        },
        () => state
      )
    },
  }
}

export type LinkStatus = 'off' | 'connecting' | 'live' | 'error'

export const app = createStore({
  obd: 'off' as LinkStatus,
  obdDetail: '',
  homebase: 'off' as LinkStatus,
  sim: false,
  scenario: 'camp' as ScenarioId,
  warp: 1,
  guardArmed: false,
  guardArmedAt: 0,
  recording: false,
  replaying: false,
  supportedPids: [] as number[],
})

export type ScenarioId = 'camp' | 'idle' | 'town' | 'highway' | 'coquihalla' | 'overheat' | 'night'
