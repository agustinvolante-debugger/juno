'use client'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// A section's "What matters" line, clamped to two lines with a More / Less toggle that only
// appears when the text actually overflows.
export default function Clamp({ children, lang = 'en' }: { children: ReactNode; lang?: string }) {
  const [open, setOpen] = useState(false)
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOver(el.scrollHeight > el.clientHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const es = lang === 'es'
  return (
    <div className={`db-dek${open ? ' is-open' : ''}`}>
      <div ref={ref} className="db-dek-text">{children}</div>
      {(over || open) && (
        <button type="button" className="db-dek-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? (es ? 'Menos' : 'Less') : (es ? 'Más' : 'More')}
        </button>
      )}
    </div>
  )
}
