'use client'
import { useEffect, useRef, useState } from 'react'
import type { ToastOpts } from './soft'

const LIFE_MS = 6000

// One toast at a time, above the phone tab bar. A newer toast commits the one it replaces,
// so a pending removal never gets lost.
export default function Toaster({ lang = 'en' }: { lang?: string }) {
  const es = lang === 'es'
  const [cur, setCur] = useState<(ToastOpts & { key: number }) | null>(null)
  const curRef = useRef<typeof cur>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function close(commit: boolean) {
    const t = curRef.current
    if (timer.current) clearTimeout(timer.current)
    curRef.current = null
    setCur(null)
    if (t && commit) void t.onCommit?.()
  }

  useEffect(() => {
    const on = (e: Event) => {
      const opts = (e as CustomEvent<ToastOpts>).detail
      if (curRef.current) close(true)
      const next = { ...opts, key: Date.now() }
      curRef.current = next
      setCur(next)
      timer.current = setTimeout(() => close(true), LIFE_MS)
    }
    // Leaving the page commits whatever is pending.
    const flush = () => { if (curRef.current) close(true) }
    window.addEventListener('db:toast', on)
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('db:toast', on); window.removeEventListener('pagehide', flush) }
  }, [])

  if (!cur) return null
  return (
    <div className="db-toast" role="status" aria-live="polite" key={cur.key}>
      <span>{cur.text}</span>
      {cur.onUndo && (
        <button type="button" className="db-toast-undo" onClick={() => { const t = curRef.current; close(false); void t?.onUndo?.() }}>
          {cur.undoLabel || (es ? 'Deshacer' : 'Undo')}
        </button>
      )}
    </div>
  )
}
