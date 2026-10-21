'use client'

// Phone calendar swipes: a horizontal (or vertical) flick on the week strip, the day timeline or
// the month grid. Pointer events, so it works with touch, pen and a mouse in the dev preview.
//
// The surface keeps `touch-action: pan-y` (or none) in CSS: the browser still scrolls the
// timeline vertically, and a mostly-sideways move is ours. Until the move is clearly one way
// (10 px, and 1.3x more along the swipe axis than across it) nothing happens; a vertical move
// first hands the gesture back to the browser for good.

import { useRef, useState } from 'react'

const LOCK_PX = 10
const COMMIT_PX = 56
const FAST = 0.45 // px/ms: a quick flick commits even if short

type Axis = 'x' | 'y' | 'both'

export function useSwipe(onSwipe: (dir: 1 | -1, axis: 'x' | 'y') => void, axis: Axis = 'x') {
  const st = useRef<{ x: number; y: number; t: number; id: number; lock: 'x' | 'y' | 'none' | null } | null>(null)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const suppress = useRef(false)
  const cb = useRef(onSwipe)
  cb.current = onSwipe

  const reset = () => {
    st.current = null
    setOffset((o) => (o.x || o.y ? { x: 0, y: 0 } : o))
  }

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      st.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, lock: null }
    },
    onPointerMove(e: React.PointerEvent) {
      const s = st.current
      if (!s || s.id !== e.pointerId || s.lock === 'none') return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (!s.lock) {
        const ax = Math.abs(dx)
        const ay = Math.abs(dy)
        if (Math.max(ax, ay) < LOCK_PX) return
        const wantX = axis !== 'y' && ax > ay * 1.3
        const wantY = axis !== 'x' && ay > ax * 1.3
        s.lock = wantX ? 'x' : wantY ? 'y' : 'none'
        if (s.lock === 'none') return
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* the pointer already went away */
        }
      }
      setOffset(s.lock === 'x' ? { x: dx, y: 0 } : { x: 0, y: dy })
    },
    onPointerUp(e: React.PointerEvent) {
      const s = st.current
      if (!s || s.id !== e.pointerId) return
      if (s.lock === 'x' || s.lock === 'y') {
        const d = s.lock === 'x' ? e.clientX - s.x : e.clientY - s.y
        const v = Math.abs(d) / Math.max(1, e.timeStamp - s.t)
        // The click that follows a swipe must not open an event or the create form.
        suppress.current = true
        window.setTimeout(() => (suppress.current = false), 0)
        if (Math.abs(d) >= COMMIT_PX || (Math.abs(d) >= 24 && v > FAST)) cb.current(d < 0 ? 1 : -1, s.lock)
      }
      reset()
    },
    onPointerCancel() {
      reset()
    },
    onClickCapture(e: React.MouseEvent) {
      if (!suppress.current) return
      e.stopPropagation()
      e.preventDefault()
    },
  }

  return { handlers, offset, dragging: offset.x !== 0 || offset.y !== 0 }
}

export const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
