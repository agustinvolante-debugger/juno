'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

// Small anchored menu: click to toggle, closes on outside click and Esc. Used by the avatar
// menu and each section's "⋯" menu.
export default function Popover({ label, trigger, children, className = '', align = 'right' }: {
  label: string; trigger: ReactNode; children: (close: () => void) => ReactNode; className?: string; align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onEsc = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('db:esc', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('db:esc', onEsc) }
  }, [open])
  return (
    <div ref={ref} className={`db-pop ${className}`}>
      <button type="button" className="db-pop-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && <div role="menu" className={`db-menu is-${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}
