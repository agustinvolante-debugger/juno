'use client'

// Plays HowToScene from the clock, with the controls a how-to needs: play/pause, a scrubber
// that jumps to any step, and the two shapes (16:9 for email and the site, 9:16 for phones).
// ?t=12.5 freezes on that second and ?format=portrait opens the vertical cut, for review.

import { useEffect, useRef, useState } from 'react'
import HowToScene, { HOWTO_SECONDS, HOWTO_SIZE, type HowToFormat } from '../film/HowToScene'

const CHAPTERS: [number, string][] = [
  [0, 'Plug in'],
  [8.2, 'Connect pen'],
  [12.9, 'Who & consent'],
  [21.0, 'People'],
  [27.6, 'Notes & to-dos'],
  [38.4, 'WhatsApp'],
]

export default function HowToPlayer() {
  const box = useRef<HTMLDivElement>(null)
  const [format, setFormat] = useState<HowToFormat>('landscape')
  const [scale, setScale] = useState(1)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [mounted, setMounted] = useState(false)
  const clock = useRef({ start: 0, offset: 0 })

  useEffect(() => {
    setMounted(true)
    const q = new URLSearchParams(window.location.search)
    if (q.get('format') === 'portrait') setFormat('portrait')
    const f = Number(q.get('t'))
    if (Number.isFinite(f) && f > 0) {
      clock.current.offset = f
      setT(f)
      setPlaying(false)
    }
  }, [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / HOWTO_SIZE[format].w)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [format])

  useEffect(() => {
    if (!playing) return
    clock.current.start = performance.now() - clock.current.offset * 1000
    let raf = 0
    const tick = (now: number) => {
      let e = (now - clock.current.start) / 1000
      if (e >= HOWTO_SECONDS) {
        e = HOWTO_SECONDS
        setPlaying(false)
      }
      clock.current.offset = e
      setT(e)
      if (e < HOWTO_SECONDS) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // Localhost only: window.__howto(12.5, 'portrait') jumps there and pauses, for frame checks.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const w = window as unknown as { __howto?: (s: number, f?: HowToFormat) => void }
    w.__howto = (s, f) => {
      setPlaying(false)
      if (f) setFormat(f)
      clock.current.offset = s
      setT(s)
    }
  }, [])

  const seek = (s: number) => {
    clock.current.offset = s
    clock.current.start = performance.now() - s * 1000
    setT(s)
  }
  const toggle = () => {
    if (!playing && t >= HOWTO_SECONDS - 0.05) seek(0)
    setPlaying((p) => !p)
  }

  const { w, h } = HOWTO_SIZE[format]
  return (
    <div className="howto">
      <div className="howto-frame" ref={box} style={{ aspectRatio: `${w} / ${h}`, maxWidth: format === 'portrait' ? 420 : 1100 }}>
        <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0' }} aria-hidden>
          {mounted && <HowToScene t={t} format={format} />}
        </div>
      </div>

      <div className="howto-bar" style={{ maxWidth: format === 'portrait' ? 420 : 1100 }}>
        <button type="button" className="howto-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            {playing ? <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /> : <path d="M4 2.5v11l9-5.5z" fill="currentColor" />}
          </svg>
        </button>
        <input
          className="howto-scrub"
          type="range"
          min={0}
          max={HOWTO_SECONDS}
          step={0.05}
          value={t}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Position in the video"
        />
        <span className="howto-time">
          {Math.floor(t)}s / {HOWTO_SECONDS}s
        </span>
      </div>

      <div className="howto-chips">
        {CHAPTERS.map(([at, label], i) => (
          <button key={label} type="button" className="howto-chip" data-on={t >= at && (i === CHAPTERS.length - 1 || t < CHAPTERS[i + 1][0])} onClick={() => seek(at)}>
            {i + 1}. {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {(['landscape', 'portrait'] as const).map((f) => (
          <button key={f} type="button" className="howto-chip" data-on={format === f} onClick={() => setFormat(f)}>
            {f === 'landscape' ? 'Landscape' : 'Vertical'}
          </button>
        ))}
      </div>
    </div>
  )
}
