'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import type { CSSProperties } from 'react'

// The signed-out face of pen.tryjunoapp.com.
//
// It deliberately reuses the app's own typography and palette — Instrument Serif, Literata,
// IBM Plex Mono, warm paper, one slate accent. A landing page that looks nothing like the
// product it sells is a promise the product then breaks. The pricing block inverts to ink
// for contrast without leaving the palette.

const SPRING = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.9 }
const FREE_MINUTES = 120
const SIGN_IN = '/auth/signin?callbackUrl=/pen'

/**
 * CSS-driven, deliberately. A marketing page must not start at opacity 0 and wait for JS:
 * a slow connection, a hydration error or a crawler that doesn't run scripts would all see a
 * blank page. A keyframe animation always completes, and `prefers-reduced-motion` is honoured
 * in the stylesheet.
 */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`pen-lp-rise${className ? ` ${className}` : ''}`} style={{ '--d': `${delay}s` } as CSSProperties}>
      {children}
    </div>
  )
}

export default function Landing() {
  return (
    <div className="pen-lp">
      <Nav />
      <Hero />
      <HowItWorks />
      <TheCatch />
      <Pricing />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------- nav */

function Nav() {
  return (
    <header className="pen-lp-nav">
      <div className="pen-lp-wrap flex items-center justify-between">
        <span className="pen-display text-[21px] leading-none">Pen</span>
        <nav className="flex items-center gap-1.5">
          <a href="#pricing" className="pen-lp-navlink">Pricing</a>
          <Link href={SIGN_IN} className="pen-lp-btn pen-lp-btn-sm">Sign in</Link>
        </nav>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="pen-lp-wrap pt-16 sm:pt-24">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <div>
          <Reveal>
            <div className="pen-label">A recorder pen &rarr; a written meeting</div>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="pen-display mt-5 text-[clamp(40px,7vw,68px)] leading-[1.03] tracking-[-0.02em]">
              You were in the room.
              <br />
              <span className="pen-lp-em">Now you have the notes.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-7 max-w-[46ch] text-[18px] leading-[1.6]" style={{ color: 'var(--soft)' }}>
              Record with a pen in your shirt pocket. Plug it into your laptop. Pen writes up
              what was said, who said it, what you agreed to, and the thing you nearly missed.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={SIGN_IN} className="pen-lp-btn pen-lp-btn-primary">
                Start free
              </Link>
              <a href="#how" className="pen-lp-btn">See how it works</a>
            </div>
            <p className="pen-mono mt-4 text-[11px]" style={{ color: 'var(--faint)' }}>
              {`${FREE_MINUTES} minutes free \u00B7 no card \u00B7 works with any USB recorder`}
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <NoteSpecimen />
        </Reveal>
      </div>
    </section>
  )
}

/**
 * The hero visual is the product's actual signature: your shorthand in black, the machine's
 * expansion in grey beneath it. Showing the artifact beats describing it.
 */
function NoteSpecimen() {
  const still = useReducedMotion()
  return (
    <figure className="pen-lp-specimen">
      <div className="pen-lp-specimen-bar">
        <span className="pen-mono text-[10px]" style={{ color: 'var(--faint)' }}>
          Ridgewood walk-through &middot; 38 min
        </span>
        <span className="pen-lp-dot" />
      </div>

      <div className="px-6 py-6 sm:px-7">
        <div className="pen-label mb-3">Your notes</div>

        <p className="pen-lp-black">kitchen big win, price still an issue</p>

        <motion.p
          className="pen-lp-grey"
          initial={still ? false : { opacity: 0, y: 6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...SPRING, delay: 0.5 }}
        >
          Sarah went straight to the island and called it lovely. Tom&rsquo;s first question was the
          asking price, which he said was above what they had agreed between themselves.
        </motion.p>

        <p className="pen-lp-black" style={{ marginTop: 22 }}>no garage again</p>

        <motion.p
          className="pen-lp-grey"
          initial={still ? false : { opacity: 0, y: 6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...SPRING, delay: 0.75 }}
        >
          Third property in a row without one. Sarah raised it in passing rather than as an
          objection, which makes it a filter rather than a preference.
        </motion.p>

        <div className="pen-lp-legend">
          <span><i className="pen-lp-swatch-ink" /> you wrote this</span>
          <span><i className="pen-lp-swatch-grey" /> written from the recording</span>
        </div>
      </div>
    </figure>
  )
}

/* ------------------------------------------------------------ how it works */

const STEPS = [
  {
    n: '01',
    h: 'Record',
    p: 'A pen in your shirt pocket, running the whole time. Nothing to open, nothing to remember to start.',
  },
  {
    n: '02',
    h: 'Plug it in',
    p: 'Connect the pen over USB and pick the drive. Pen finds the recordings and takes it from there.',
  },
  {
    n: '03',
    h: 'Read the note',
    p: 'Who was there, what was decided, what you owe people, and what you nearly let slide.',
  },
]

function HowItWorks() {
  return (
    <section id="how" className="pen-lp-wrap pt-28 sm:pt-36">
      <Reveal>
        <div className="pen-label">How it works</div>
        <h2 className="pen-display mt-4 max-w-[24ch] text-[clamp(28px,4vw,40px)] leading-[1.12] tracking-[-0.015em]">
          Three steps, and two of them are plugging in a cable.
        </h2>
      </Reveal>

      <div className="mt-14 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3" style={{ borderColor: 'var(--line)', background: 'var(--line)' }}>
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.07}>
            <div className="pen-lp-step">
              <span className="pen-mono text-[10.5px]" style={{ color: 'var(--accent)' }}>{s.n}</span>
              <h3 className="pen-display mt-3 text-[22px]">{s.h}</h3>
              <p className="mt-2.5 text-[15px] leading-[1.6]" style={{ color: 'var(--soft)' }}>{s.p}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- the catch */

function TheCatch() {
  return (
    <section className="pen-lp-wrap pt-28 sm:pt-36">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1fr] lg:gap-20">
        <Reveal>
          <div className="pen-label">The part that earns its keep</div>
          <h2 className="pen-display mt-4 text-[clamp(28px,4vw,40px)] leading-[1.12] tracking-[-0.015em]">
            A summary tells you what you already remember.
          </h2>
          <p className="mt-6 max-w-[40ch] text-[17px] leading-[1.62]" style={{ color: 'var(--soft)' }}>
            The useful part is the commitment somebody made in passing, the constraint mentioned
            once, the question asked of you that never got answered. Pen goes looking for those.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="pen-lp-missed">
            <div className="pen-label" style={{ color: 'var(--warn)' }}>You might have missed</div>
            <ul className="mt-4 space-y-5">
              {[
                ['Tom said the price is above what they had agreed between themselves',
                 'He never named the number, and you did not ask. That number is the whole negotiation.'],
                ['You committed to checking the HOA on the carport',
                 'Promised aloud, and easy to forget before a weekend viewing.'],
                ['They asked to come back with her mother',
                 'The strongest buying signal in the recording, and it arrived in the last thirty seconds.'],
              ].map(([item, why]) => (
                <li key={item}>
                  <div className="text-[15.5px] leading-[1.45]">{item}</div>
                  <div className="mt-1 text-[13px] leading-[1.45]" style={{ color: 'var(--warn)' }}>{why}</div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- pricing */

const FREE = [
  `${FREE_MINUTES} minutes of recording a month`,
  'Full transcript with who said what',
  'Summary, decisions, action items',
  'What you might have missed',
  'Ask questions about one recording',
]

const PRO = [
  'Unlimited minutes, unlimited recordings',
  'Everything in Starter',
  'Ask across every recording you own',
  'Draft emails, memos and tracker rows',
  'A briefing in your inbox after each meeting',
  'What each client wants, learned over time',
]

function Pricing() {
  return (
    <section id="pricing" className="pen-lp-dark mt-28 sm:mt-36">
      <div className="pen-lp-wrap py-24 sm:py-28">
        <Reveal>
          <div className="pen-label" style={{ color: 'rgba(251,250,246,.42)' }}>Pricing</div>
          <h2 className="pen-display mt-4 max-w-[22ch] text-[clamp(30px,4.4vw,44px)] leading-[1.1] tracking-[-0.015em]" style={{ color: 'var(--paper)' }}>
            Start free. Pay when it becomes the way you work.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-7">
          <Reveal delay={0.06} className="order-2 lg:order-1">
            <article className="pen-lp-plan">
              <header>
                <h3 className="pen-mono text-[11px] uppercase tracking-[.14em]" style={{ color: 'rgba(251,250,246,.5)' }}>Starter</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="pen-display text-[46px] leading-none" style={{ color: 'var(--paper)' }}>Free</span>
                </div>
                <p className="mt-3 text-[14.5px] leading-[1.55]" style={{ color: 'rgba(251,250,246,.6)' }}>
                  Enough to find out whether it changes anything. No card.
                </p>
              </header>
              <ul className="pen-lp-feats">
                {FREE.map((f) => <Feat key={f}>{f}</Feat>)}
              </ul>
              <Link href={SIGN_IN} className="pen-lp-btn pen-lp-btn-ghost mt-auto w-full justify-center">
                Start free
              </Link>
            </article>
          </Reveal>

          <Reveal delay={0.12} className="order-1 lg:order-2">
            <article className="pen-lp-plan pen-lp-plan-pro">
              <span className="pen-lp-ribbon">Free while in beta</span>
              <header>
                <h3 className="pen-mono text-[11px] uppercase tracking-[.14em]" style={{ color: 'var(--accent-line)' }}>Pro</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="pen-display text-[46px] leading-none" style={{ color: 'var(--paper)' }}>$15</span>
                  <span className="pen-mono text-[12px]" style={{ color: 'rgba(251,250,246,.5)' }}>/month</span>
                </div>
                <p className="mt-3 text-[14.5px] leading-[1.55]" style={{ color: 'rgba(251,250,246,.72)' }}>
                  For anyone whose week is back-to-back and whose memory is the weak link.
                </p>
              </header>
              <ul className="pen-lp-feats">
                {PRO.map((f) => <Feat key={f} pro>{f}</Feat>)}
              </ul>
              <Link href={SIGN_IN} className="pen-lp-btn pen-lp-btn-accent mt-auto w-full justify-center">
                Start free
              </Link>
              {/* Honest: there is no billing yet, so nobody is charged and nobody is promised a
                  date. Saying so beats a checkout button that does not take money. */}
              <p className="pen-mono mt-3 text-center text-[10px]" style={{ color: 'rgba(251,250,246,.58)' }}>
                Billing isn&rsquo;t live yet. Pro is open to everyone meanwhile.
              </p>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Feat({ children, pro }: { children: React.ReactNode; pro?: boolean }) {
  return (
    <li>
      <svg viewBox="0 0 16 16" aria-hidden style={{ color: pro ? 'var(--accent-line)' : 'rgba(251,250,246,.4)' }}>
        <path d="M3 8.4 L6.2 11.6 L13 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  )
}

/* ------------------------------------------------------------------ footer */

function Footer() {
  return (
    <footer className="pen-lp-foot">
      <div className="pen-lp-wrap flex flex-wrap items-center justify-between gap-5 py-9">
        <div className="flex items-baseline gap-3">
          <span className="pen-display text-[17px]">Pen</span>
          <span className="pen-mono text-[10.5px]" style={{ color: 'var(--faint)' }}>
            &copy; {new Date().getFullYear()}
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a href="#how" className="pen-lp-footlink">How it works</a>
          <a href="#pricing" className="pen-lp-footlink">Pricing</a>
          <Link href="/privacy" className="pen-lp-footlink">Privacy</Link>
          <Link href="/terms" className="pen-lp-footlink">Terms</Link>
          <Link href={SIGN_IN} className="pen-lp-footlink">Sign in</Link>
        </nav>
      </div>
      <div className="pen-lp-wrap pb-10">
        <p className="pen-mono max-w-[70ch] text-[10px] leading-[1.8]" style={{ color: 'var(--faint)' }}>
          Recording a conversation needs everyone&rsquo;s permission in many places, Florida included.
          Pen asks you to confirm consent before it processes anything.
        </p>
      </div>
    </footer>
  )
}
