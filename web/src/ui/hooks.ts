import { useEffect, useState, useSyncExternalStore } from 'react'
import { tel } from '../core/store'

// re-render on telemetry updates. the store batches to ~10hz so this is cheap enough
export function useTel() {
  useSyncExternalStore(tel.subscribe, tel.getVersion)
  return tel
}

export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
