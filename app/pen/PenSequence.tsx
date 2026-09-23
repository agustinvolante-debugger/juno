'use client'

import { motion, useReducedMotion } from 'motion/react'

/**
 * The page's one orchestrated moment: what the pen actually does, over about five seconds.
 *
 * It animates the TRANSFORMATION rather than the object. Three reasons that is the right
 * call and not a dodge. The product is not a stylus, so there is no drawing gesture to show.
 * A photograph of a pen lying still is a still, and animating one with an image-to-video
 * model warps the geometry of the thing we are asking someone to pay fifty dollars for. And
 * the transformation is the actual product: sound in, a written decision out.
 *
 * This is deliberately NOT a mock of a screen. No browser chrome, no phone frame, no fake
 * window. It renders the real content types Pen produces, as page content, in the page's own
 * typeface, on the page's own paper. A device mockup built out of divs is the oldest tell
 * there is.
 */

/** Deterministic, so the server and the client agree and no hydration mismatch appears. */
function bars(count: number): number[] {
  const out: number[] = []
  let seed = 8_675_309
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const base = 0.22 + (seed / 0x7fffffff) * 0.78
    // A slow swell across the clip so it reads as speech rather than noise.
    const swell = 0.55 + 0.45 * Math.sin((i / count) * Math.PI * 2.4)
    out.push(Math.max(0.12, Math.min(1, base * swell)))
  }
  return out
}

const WAVE = bars(72)

const TURNS = [
  { who: 'A', text: 'We love the kitchen. The parking is the thing.' },
  { who: 'B', text: 'There is a covered spot with the unit, round the back.' },
  { who: 'A', text: 'Then we would want to move on it this week.' },
]

// One easing for the whole sequence, so it reads as one gesture.
const EASE = [0.16, 1, 0.3, 1] as const

export default function PenSequence() {
  const reduce = useReducedMotion()

  // Reduced motion gets the final frame, immediately. Not a shortened animation: none.
  const enter = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: EASE },
        }

  return (
    <div className="pen-seq" aria-label="A recording turning into notes">
      <div className="pen-seq-head">
        <span className="pen-mono pen-t-micro">Ridgewood walk-through</span>
        <span className="pen-mono pen-t-micro pen-seq-live">
          <i aria-hidden />
          recording
        </span>
      </div>

      {/* The waveform. Bars scale up from the baseline in sequence, which is the shape of a
          clip being read left to right, then hold a small idle so the device reads as on. */}
      <div className="pen-seq-wave" aria-hidden>
        {WAVE.map((h, i) => (
          <motion.span
            key={i}
            style={{ height: `${Math.round(h * 100)}%` }}
            initial={reduce ? false : { scaleY: 0.06, opacity: 0.25 }}
            animate={
              reduce
                ? { scaleY: 1, opacity: 1 }
                : { scaleY: [0.06, 1, 0.94, 1], opacity: 1 }
            }
            transition={
              reduce
                ? undefined
                : {
                    duration: 1.5,
                    delay: 0.3 + i * 0.016,
                    ease: EASE,
                    times: [0, 0.55, 0.8, 1],
                  }
            }
          />
        ))}
      </div>

      <div className="pen-seq-turns">
        {TURNS.map((t, i) => (
          <motion.p key={t.text} className="pen-seq-turn" {...enter(1.5 + i * 0.6)}>
            <span className="pen-mono pen-seq-who">{t.who}</span>
            <span>{t.text}</span>
          </motion.p>
        ))}
      </div>

      {/* The rule draws rather than fades: it is the moment the transcript becomes a note. */}
      <motion.div
        className="pen-seq-rule"
        aria-hidden
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={reduce ? undefined : { duration: 0.7, delay: 3.4, ease: EASE }}
      />

      <motion.div className="pen-seq-out" {...enter(3.9)}>
        <span className="pen-mono pen-t-micro pen-seq-tag">Decided</span>
        <p>They will offer this week, subject to seeing the covered parking.</p>
      </motion.div>

      <motion.div className="pen-seq-out" {...enter(4.5)}>
        <span className="pen-mono pen-t-micro pen-seq-tag" data-tone="warn">
          Nearly missed
        </span>
        <p>Covered parking has now come up at all three viewings.</p>
      </motion.div>
    </div>
  )
}
