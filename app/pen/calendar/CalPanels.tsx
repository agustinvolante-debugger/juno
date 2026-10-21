'use client'

// The Calendar page's floating surfaces: a panel beside what was clicked (desktop), a bottom sheet
// (phone), the "this will email guests" confirm, and the quiet toast.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type Anchor = { left: number; top: number; right: number; bottom: number }

/** Portalled into .pen-root so the skin's tokens still apply. */
function Portal({ children }: { children: React.ReactNode }) {
  // Panels only ever open after a click, so the document is always there; looked up during render
  // so the panel's own layout effect can measure it on the first pass.
  const host = typeof document === 'undefined' ? null : (document.querySelector('.pen-root') ?? document.body)
  return host ? createPortal(children, host) : null
}

/** Keep Tab inside a modal surface (the phone sheet, the confirm). */
function trapTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== 'Tab' || !root) return
  const els = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null)
  if (!els.length) return
  const first = els[0]
  const last = els[els.length - 1]
  const a = document.activeElement
  if (e.shiftKey && (a === first || !root.contains(a))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (a === last || !root.contains(a))) {
    e.preventDefault()
    first.focus()
  }
}

const W = 360
const GAP = 12

/** Desktop: a glass panel that sits beside its anchor, never under the pointer. */
export function Floating({
  anchor,
  label,
  onClose,
  children,
  wide,
}: {
  anchor: Anchor | null
  label: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const width = wide ? 400 : W

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const place = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const h = Math.min(el.offsetHeight, vh - 24)
      const a = anchor ?? { left: vw / 2 - width / 2, right: vw / 2 - width / 2, top: vh / 4, bottom: vh / 4 }
      let left = anchor ? a.right + GAP : a.left
      if (left + width > vw - 12) left = a.left - GAP - width
      if (left < 12) left = Math.max(12, Math.min(vw - width - 12, a.left))
      const top = Math.max(12, Math.min(vh - h - 12, a.top - 8))
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [anchor, width])

  useEffect(() => {
    // The form focuses its own title first; only take focus when nothing inside has it.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true })
  }, [])

  // A click outside closes it, except on another event (which opens its own panel).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!t || ref.current?.contains(t)) return
      if (t.closest('.pen-cal-confirm, .pen-cal-toast')) return
      onClose()
    }
    const id = window.setTimeout(() => window.addEventListener('pointerdown', down), 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', down)
    }
  }, [onClose])

  return (
    <Portal>
      <div
        ref={ref}
        className="pen-cal-float"
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
    </Portal>
  )
}

/** Phone: a sheet from the bottom over a scrim. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // The form focuses its own title first; only take focus when nothing inside has it.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      // The confirm dialog, when open on top, keeps Tab to itself.
      if (!document.querySelector('.pen-cal-confirm')) trapTab(e, ref.current)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return (
    <Portal>
      <div className="pen-cal-sheet-wrap">
        <button type="button" className="pen-cal-scrim" aria-label={label} tabIndex={-1} onClick={onClose} />
        <div ref={ref} className="pen-cal-sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
          <div className="pen-cal-sheet-grip" aria-hidden />
          {children}
        </div>
      </div>
    </Portal>
  )
}

export function ConfirmDialog({
  title,
  body,
  yes,
  no,
  onAnswer,
}: {
  title: string
  body: string
  yes: string
  no: string
  onAnswer: (ok: boolean) => void
}) {
  const yesRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // The parent re-renders every 30 s (the clock) and on refresh; focus "Send" once, never again,
  // or a keyboard user resting on "Don't send" would be moved back to "Send".
  const answer = useRef(onAnswer)
  answer.current = onAnswer
  useEffect(() => {
    yesRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        answer.current(false)
      } else trapTab(e, boxRef.current)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <Portal>
      <div className="pen-cal-confirm-wrap">
        <div className="pen-cal-confirm-scrim" aria-hidden onClick={() => onAnswer(false)} />
        <div ref={boxRef} className="pen-cal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pen-cal-confirm-t" aria-describedby="pen-cal-confirm-b">
          <span className="pen-cal-confirm-ic" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.8" y="4.6" width="14.4" height="10.8" rx="2" />
              <path d="m3.4 5.6 6.6 5.2 6.6-5.2" />
            </svg>
          </span>
          <h2 id="pen-cal-confirm-t" className="pen-cal-confirm-t">{title}</h2>
          <p id="pen-cal-confirm-b" className="pen-cal-confirm-b">{body}</p>
          <div className="pen-cal-confirm-acts">
            <button type="button" className="pen-btn" onClick={() => onAnswer(false)}>{no}</button>
            <button ref={yesRef} type="button" className="pen-btn pen-btn-accent" onClick={() => onAnswer(true)}>{yes}</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

export function Toast({ text, tone, onDone }: { text: string; tone: 'ok' | 'bad'; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, tone === 'bad' ? 6000 : 2600)
    return () => window.clearTimeout(id)
  }, [text, tone, onDone])
  return (
    <Portal>
      <div className="pen-cal-toast" data-tone={tone} role={tone === 'bad' ? 'alert' : 'status'}>
        {text}
      </div>
    </Portal>
  )
}
