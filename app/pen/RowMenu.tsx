'use client'

import { useEffect, useRef, useState } from 'react'
import Icon, { type IconName } from './Icon'

/**
 * The "⋯" menu on a row (people; same look and keys as the sidebar's chat menu in PenApp).
 * The button never triggers the row's own click. Esc closes and hands focus back to the
 * button, an outside click closes, arrow keys move between items.
 */
export type RowMenuItem = { label: string; icon: IconName; danger?: boolean; onSelect: () => void }

export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        btn.current?.focus()
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        if (!els.length) return
        e.preventDefault()
        const at = els.indexOf(document.activeElement as HTMLElement)
        els[e.key === 'ArrowDown' ? (at + 1) % els.length : (at - 1 + els.length) % els.length].focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  return (
    <span className="pen-rowmenu" ref={wrap} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        className="pen-chatrow-more pen-rowmenu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <span className="pen-menu pen-menu-right" role="menu" aria-label={label}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`pen-menu-item${it.danger ? ' pen-menu-danger' : ''}`}
              onClick={() => { setOpen(false); it.onSelect() }}
            >
              <Icon name={it.icon} size={15} />{it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

/** Rename in place: Enter saves, Esc or leaving the field cancels. Shows the save error under it. */
export function RenameInput({ value, label, error, busy, onSave, onCancel }: {
  value: string
  label: string
  error: string | null
  busy: boolean
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    requestAnimationFrame(() => { input.current?.focus(); input.current?.select() })
  }, [])
  return (
    <span className="pen-rename">
      <input
        ref={input}
        className="pen-chatrow-input"
        value={draft}
        maxLength={120}
        disabled={busy}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); onSave(draft.trim()) }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        // Leaving the field cancels, unless a save is in flight or an error is being shown.
        onBlur={() => { if (!busy && !error) onCancel() }}
      />
      {error && <span className="pen-chatrow-err" role="alert">{error}</span>}
    </span>
  )
}
