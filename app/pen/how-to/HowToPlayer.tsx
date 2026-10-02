'use client'

// Plays HowToScene from the clock, with the controls a how-to needs: play/pause, a scrubber,
// and chapter buttons that jump to any step. Three places use it:
//
//   /pen/how-to   `review`: the four stories and both shapes on switches; ?for=students,
//                 ?format=portrait and ?t=12.5 open on one, for checking
//   the landing   `autoplay="visible"`: plays only while on screen, loops
//   the tour      `autoplay="always"`: starts at once, stops at the end
//
// Outside review, the shape follows the space: vertical when the frame is narrower than 560px.
// Anyone who prefers reduced motion gets a still frame (the finished notes) until they press play.

import { useEffect, useRef, useState } from 'react'
import HowToScene, { HOWTO_SECONDS, HOWTO_SIZE, type HowToFormat, type HowToKitKey } from '../film/HowToScene'

const KIT_LABELS: [HowToKitKey, string][] = [
  ['sales', 'Sales & real estate'],
  ['students', 'Students'],
  ['family', 'Family'],
  ['founders', 'Founders & teams'],
]
const CHAPTERS: [number, string][] = [
  [0, 'Plug in'],
  [8.2, 'Connect pen'],
  [12.9, 'Who & consent'],
  [21.0, 'People'],
  [27.6, 'Notes & to-dos'],
  [38.4, 'WhatsApp'],
]
/** The still for reduced motion: the summary, to-dos and follow-up on screen. */
const STILL_T = 36.4

export default function HowToPlayer({
  review = false,
  autoplay = 'always',
  loop = false,
  chapters = true,
  kit = 'sales',
}: {
  review?: boolean
  autoplay?: 'always' | 'visible'
  loop?: boolean
  chapters?: boolean
  /** Whose story: the landing page's chosen audience. Review has its own switch. */
  kit?: HowToKitKey
}) {
  const box = useRef<HTMLDivElement>(null)
  const [format, setFormat] = useState<HowToFormat>('landscape')
  const [scale, setScale] = useState(1)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [visible, setVisible] = useState(autoplay === 'always')
  const [mounted, setMounted] = useState(false)
  const [reviewKit, setReviewKit] = useState<HowToKitKey>(kit)
  const story = review ? reviewKit : kit
  const clock = useRef({ start: 0, offset: 0 })

  useEffect(() => {
    setMounted(true)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      clock.current.offset = STILL_T
      setT(STILL_T)
      return
    }
    if (review) {
      const q = new URLSearchParams(window.location.search)
      if (q.get('format') === 'portrait') setFormat('portrait')
      const k = q.get('for')
      if (k && KIT_LABELS.some(([key]) => key === k)) setReviewKit(k as HowToKitKey)
      const f = Number(q.get('t'))
      if (Number.isFinite(f) && f > 0) {
        clock.current.offset = f
        setT(f)
        return
      }
    }
    setPlaying(true)
  }, [review])

  // Size, and outside review the shape, follow the frame's width.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const f: HowToFormat = review ? format : el.clientWidth < 560 ? 'portrait' : 'landscape'
      if (f !== format) setFormat(f)
      setScale(el.clientWidth / HOWTO_SIZE[f].w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [format, review])

  // On the landing page it only runs while on screen.
  useEffect(() => {
    if (autoplay !== 'visible') return
    const el = box.current
    if (!el || !('IntersectionObserver' in window)) return setVisible(true)
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [autoplay])

  useEffect(() => {
    if (!playing || !visible) return
    clock.current.start = performance.now() - clock.current.offset * 1000
    let raf = 0
    const tick = (now: number) => {
      let e = (now - clock.current.start) / 1000
      if (e >= HOWTO_SECONDS) {
        if (loop) {
          clock.current.start = now
          e = 0
        } else {
          e = HOWTO_SECONDS
          setPlaying(false)
        }
      }
      clock.current.offset = e
      setT(e)
      if (loop || e < HOWTO_SECONDS) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, visible, loop])

  // Localhost only: window.__howto(12.5, 'portrait') jumps there and pauses, for frame checks.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !review) return
    const w = window as unknown as { __howto?: (s: number, f?: HowToFormat) => void }
    w.__howto = (s, f) => {
      setPlaying(false)
      if (f) setFormat(f)
      clock.current.offset = s
      setT(s)
    }
  }, [review])

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
  const max = format === 'portrait' ? 420 : 1100
  return (
    <div className="howto">
      <div className="howto-frame" ref={box} style={{ aspectRatio: `${w} / ${h}`, maxWidth: max }}>
        <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0' }} aria-hidden>
          {mounted && <HowToScene t={t} format={format} kit={story} />}
        </div>
      </div>

      <div className="howto-bar" style={{ maxWidth: max }}>
        <button type="button" className="howto-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            {playing ? <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /> : <path d="M4 2.5v11l9-5.5z" fill="currentColor" />}
          </svg>
        </button>
        <input className="howto-scrub" type="range" min={0} max={HOWTO_SECONDS} step={0.05} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="Position in the video" />
        <span className="howto-time">
          {Math.floor(t)}s / {HOWTO_SECONDS}s
        </span>
      </div>

      {review && (
        <div className="howto-chips" style={{ maxWidth: max }}>
          {KIT_LABELS.map(([key, label]) => (
            <button key={key} type="button" className="howto-chip" data-on={reviewKit === key} onClick={() => { setReviewKit(key); seek(0); setPlaying(true) }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {(chapters || review) && (
        <div className="howto-chips" style={{ maxWidth: max }}>
          {CHAPTERS.map(([at, label], i) => (
            <button key={label} type="button" className="howto-chip" data-on={t >= at && (i === CHAPTERS.length - 1 || t < CHAPTERS[i + 1][0])} onClick={() => seek(at)}>
              {i + 1}. {label}
            </button>
          ))}
          {review && (
            <>
              <span style={{ flex: 1 }} />
              {(['landscape', 'portrait'] as const).map((f) => (
                <button key={f} type="button" className="howto-chip" data-on={format === f} onClick={() => setFormat(f)}>
                  {f === 'landscape' ? 'Landscape' : 'Vertical'}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
