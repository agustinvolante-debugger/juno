'use client'

// The film on the landing page: PenFilmScene driven by the clock.
//
// It plays only while on screen (no work for a section nobody is looking at), loops, and has a
// pause button, because anything that moves for more than five seconds needs one. Reduced
// motion gets a single still frame with the phone and Today on screen, never the animation.

import { useEffect, useRef, useState } from 'react'
import PenFilmScene, { FILM_SECONDS, FILM_SIZE, type FilmFormat } from './PenFilmScene'
import type { Kit, Plus } from '../landing-audiences'

/** The still shown to anyone who prefers reduced motion: everything answered, nothing moving. */
const STILL_T = 12.9

export default function PenFilm({ kit, plus, labels }: { kit: Kit; plus: Plus; labels: { pause: string; play: string } }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [format, setFormat] = useState<FilmFormat>('landscape')
  const [t, setT] = useState(STILL_T)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)
  const clock = useRef({ start: 0, offset: 0 })
  // Browser only: the waveform's floating-point heights differ in the last digits between the
  // server render and the client, and a decorative animation gains nothing from SSR. The frame
  // keeps its size either way, so nothing shifts when it appears.
  const [mounted, setMounted] = useState(false)
  // Localhost only: ?filmT=9.5 freezes the film at that second, for checking single frames.
  const [frozen, setFrozen] = useState<number | null>(null)
  useEffect(() => {
    setMounted(true)
    if (process.env.NODE_ENV === 'production') return
    const f = Number(new URLSearchParams(window.location.search).get('filmT'))
    if (Number.isFinite(f) && f > 0) setFrozen(f)
  }, [])

  // Portrait on narrow screens, where a 16:9 frame would be too small to read.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const f: FilmFormat = el.clientWidth < 560 ? 'portrait' : 'landscape'
      setFormat(f)
      setScale(el.clientWidth / FILM_SIZE[f].w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    setReduced(!!mq?.matches)
    const el = box.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // A new audience starts the film over.
  useEffect(() => {
    clock.current = { start: performance.now(), offset: 0 }
  }, [kit.key])

  useEffect(() => {
    if (reduced || paused || !visible) return
    clock.current.start = performance.now() - clock.current.offset * 1000
    let raf = 0
    const tick = (now: number) => {
      const elapsed = ((now - clock.current.start) / 1000) % FILM_SECONDS
      clock.current.offset = elapsed
      setT(elapsed)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced, paused, visible, kit.key])

  const { w, h } = FILM_SIZE[format]
  return (
    <div className="pen-film" ref={box} style={{ aspectRatio: `${w} / ${h}` }}>
      <div className="pen-film-stage" style={{ width: w, height: h, transform: `scale(${scale})` }} aria-hidden>
        {mounted && <PenFilmScene t={frozen ?? (reduced ? STILL_T : t)} kit={kit} plus={plus} format={format} />}
      </div>
      {!reduced && (
        <button type="button" className="pen-film-toggle" onClick={() => setPaused((p) => !p)} aria-label={paused ? labels.play : labels.pause}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            {paused ? <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />}
          </svg>
          <span>{paused ? labels.play : labels.pause}</span>
        </button>
      )}
    </div>
  )
}
