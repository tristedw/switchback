import { createContext, useContext, type ReactNode } from 'react'
import { createStore } from '../core/state'

// NeXT style window manager, the dashboard version. one key window (black title bar),
// the rest grey. miniaturize drops the window into the tray bottom left like a miniwindow.

export const ScreenCtx = createContext('rig')

const KEY_MINI = 'switchback.mini'

function loadMini(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_MINI) || '[]')
  } catch {
    return []
  }
}

export const wm = createStore({
  key: '' as string,
  mini: (typeof localStorage === 'undefined' ? [] : loadMini()) as string[],
})

export function miniaturize(id: string) {
  const mini = [...wm.get().mini.filter((m) => m !== id), id]
  wm.set({ mini, key: wm.get().key === id ? '' : wm.get().key })
  save(mini)
}

export function restore(id: string) {
  const mini = wm.get().mini.filter((m) => m !== id)
  wm.set({ mini, key: id })
  save(mini)
}

function save(mini: string[]) {
  try {
    localStorage.setItem(KEY_MINI, JSON.stringify(mini))
  } catch {
    /* ignore */
  }
}

export const winId = (screen: string, title: string) => `${screen}/${title}`

interface Props {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  // the window that's key when nothing else has been clicked on this screen
  primary?: boolean
  noMini?: boolean
}

export function Panel({ title, aside, children, className = '', primary, noMini }: Props) {
  const screen = useContext(ScreenCtx)
  const st = wm.use()
  const id = winId(screen, title)
  if (st.mini.includes(id)) return null
  const isKey = st.key ? st.key === id : !!primary

  return (
    <section className={`win ${className}`} data-key={isKey || undefined} onPointerDown={() => !isKey && wm.set({ key: id })} aria-label={title}>
      <header className="titlebar">
        {!noMini ? (
          <button className="tb-btn" onClick={() => miniaturize(id)} aria-label={`Miniaturize ${title}`} title="Miniaturize">
            <svg viewBox="0 0 11 11" aria-hidden="true">
              <rect x="2.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" />
            </svg>
          </button>
        ) : (
          <span className="tb-spacer" />
        )}
        <h2>{title}</h2>
        <div className="tb-aside">{aside}</div>
      </header>
      <div className="win-body">{children}</div>
      <div className="resizebar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </section>
  )
}

// miniwindows for the current screen, bottom left of the workspace
export function MiniTray() {
  const screen = useContext(ScreenCtx)
  const st = wm.use()
  const mine = st.mini.filter((m) => m.startsWith(screen + '/'))
  if (!mine.length) return null
  return (
    <div className="minitray">
      {mine.map((id) => (
        <button key={id} className="miniwin" onClick={() => restore(id)} title={`Restore ${id.split('/')[1]}`}>
          <span className="miniwin-title">{id.split('/')[1]}</span>
          <span className="miniwin-icon" aria-hidden="true">
            <svg viewBox="0 0 26 18">
              <path d="M2 16 L9 6 L14 12 L20 3 L24 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
            </svg>
          </span>
        </button>
      ))}
    </div>
  )
}
