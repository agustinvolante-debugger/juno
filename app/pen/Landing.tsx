'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
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
      <MultiUse />
      <HowItWorks />
      <TheCatch />
      <WhatYouGet />
      <Compounds />
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
    <section className="pen-lp-wrap pt-14 sm:pt-20">
      <div className="max-w-[62ch]">
        <Reveal>
          <div className="pen-lp-eyebrow">Any conversation, written up</div>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="pen-display mt-5 text-[clamp(40px,7vw,68px)] leading-[1.03] tracking-[-0.02em]">
            You were in the room.
            <br />
            <span className="pen-lp-em">Now you have the notes.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-7 max-w-[52ch] text-[18.5px] leading-[1.6]" style={{ color: 'var(--soft)' }}>
            Record with a pen in your shirt pocket. Plug it into your laptop. Pen writes up what
            was said, who said it, what you agreed to, and the thing you nearly missed.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href={SIGN_IN} className="pen-lp-btn pen-lp-btn-primary">Start free</Link>
            <a href="#how" className="pen-lp-btn">See how it works</a>
          </div>
          <p className="pen-mono mt-4 text-[11px]" style={{ color: 'var(--faint)' }}>
            {`${FREE_MINUTES} minutes free \u00B7 no card \u00B7 works with any USB recorder`}
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------- the multi-use section */

/**
 * The multi-use argument, given the room it needs. This used to be a grey footnote at the
 * bottom of a half-width card and was the single most-missed thing on the page: it is the
 * reason this is not a work tool, so it is now the section title.
 *
 * The card is full width because a note is prose — at half width the lines were too short to
 * read as a document, which is the whole impression it exists to create.
 */

type Example = {
  id: string
  tab: string
  /** Narrow-screen label. Three full labels do not fit 390px and "Coffee" got clipped. */
  short: string
  meta: string
  lines: { black: string; grey: string }[]
}

const EXAMPLES: Example[] = [
  {
    id: 'property',
    tab: 'Property viewing',
    short: 'Viewing',
    meta: 'Ridgewood walk-through \u00B7 38 min',
    lines: [
      {
        black: 'kitchen big win, price still an issue',
        grey:
          'Sarah went straight to the island and called it lovely. Tom\u2019s first question was ' +
          'the asking price, which he said was above what they had agreed between themselves.',
      },
      {
        black: 'no garage again',
        grey:
          'Third property in a row without one. Sarah raised it in passing rather than as an ' +
          'objection, which makes it a filter rather than a preference.',
      },
    ],
  },
  {
    id: 'client',
    tab: 'Client meeting',
    short: 'Client',
    meta: 'Quarterly review, Head of Treasury \u00B7 52 min',
    lines: [
      {
        black: 'covenant headroom is the real blocker',
        grey:
          'She said the board will not approve new facilities until the leverage test has two ' +
          'quarters of clearance. Her CFO put that at March at the earliest, and she did not ' +
          'contradict him.',
      },
      {
        black: 'wants the pricing grid before legal',
        grey:
          'Asked twice for indicative pricing ahead of documentation, which is the reverse of ' +
          'last year\u2019s process. She wants something to take to the board, not a signed deal.',
      },
    ],
  },
  {
    id: 'coffee',
    tab: 'Coffee',
    short: 'Coffee',
    meta: 'Coffee with Dani \u00B7 24 min',
    lines: [
      {
        black: 'she offered to intro me to her old cto',
        grey:
          'Said she would send it this week and asked you to remind her if it went quiet. She ' +
          'has worked with him twice and rates him on hiring rather than architecture.',
      },
      {
        black: 'they killed the marketplace thing',
        grey:
          'Two years in, shut it down over supply, not demand. She mentioned it once and moved ' +
          'on, but it is the reason she left.',
      },
    ],
  },
]

function MultiUse() {
  const [active, setActive] = useState(0)
  const ex = EXAMPLES[active]

  return (
    <section className="pen-lp-wrap pt-24 sm:pt-32">
      <Reveal>
        <div className="pen-lp-eyebrow">Same pen, same pocket</div>
        <h2 className="pen-display mt-5 max-w-[34ch] text-[clamp(30px,4.8vw,50px)] leading-[1.08] tracking-[-0.02em]">
          A viewing, a quarterly review, a coffee with someone whose favour you&rsquo;ll want in
          six months.
        </h2>
        <p className="mt-6 max-w-[52ch] text-[19px] leading-[1.55]" style={{ color: 'var(--soft)' }}>
          It doesn&rsquo;t know which of those matters most.
          <span className="pen-lp-strong"> Neither do you, at the time.</span>
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <Segmented
          items={EXAMPLES.map((e) => ({ long: e.tab, short: e.short }))}
          active={active}
          onChange={setActive}
        />
      </Reveal>

      <Reveal delay={0.14}>
        <figure className="pen-lp-specimen">
          <div className="pen-lp-specimen-bar">
            <span className="pen-mono text-[11px]" style={{ color: 'var(--faint)' }}>{ex.meta}</span>
            <span className="pen-lp-dot" />
          </div>

          <div className="pen-lp-specimen-body">
            <div className="pen-label mb-4">Your notes</div>

            {/* Keyed plain div: remounting restarts a CSS animation, so this content is never
                invisible waiting for a script. */}
            <div key={ex.id} className="pen-lp-swap">
              {ex.lines.map((l, i) => (
                <div key={l.black} style={{ marginTop: i === 0 ? 0 : 26 }}>
                  <p className="pen-lp-black">{l.black}</p>
                  <p className="pen-lp-grey">{l.grey}</p>
                </div>
              ))}
            </div>

            <div className="pen-lp-legend">
              <span><i className="pen-lp-swatch-ink" /> you wrote this</span>
              <span><i className="pen-lp-swatch-grey" /> written from the recording</span>
            </div>
          </div>
        </figure>
      </Reveal>
    </section>
  )
}

/**
 * Segmented control, iOS-style: an inset track with a single elevated pill whose position and
 * width are measured from the active segment and animated.
 *
 * The obvious implementation is motion's `layoutId` on a conditionally-rendered pill, and it
 * does not animate here — measured it jumping straight to the target on the first frame
 * (178px to 521px in 16ms). One pill whose x and width are animated is deterministic, works
 * without shared-layout semantics, and is what the real control does. Labels are plain text
 * above it, so the control is fully usable if the animation never runs at all.
 */
function Segmented({
  items,
  active,
  onChange,
}: {
  items: { long: string; short: string }[]
  active: number
  onChange: (i: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)

  const measure = useCallback(() => {
    const track = trackRef.current
    const btn = btnRefs.current[active]
    if (!track || !btn) return
    const t = track.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    setPill({ x: b.left - t.left, w: b.width })
  }, [active])

  // Before paint, so the pill is never briefly in the wrong place.
  useLayoutEffect(measure, [measure])

  useEffect(() => {
    // Fonts land after first paint and change the segment widths, so remeasure then too.
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  return (
    <div className="pen-seg" role="tablist" aria-label="Example recordings" ref={trackRef}>
      {pill && (
        <motion.span
          className="pen-seg-pill"
          aria-hidden
          initial={false}
          animate={{ x: pill.x, width: pill.w }}
          transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
        />
      )}
      {items.map((it, i) => (
        <button
          key={it.long}
          ref={(el) => {
            btnRefs.current[i] = el
          }}
          role="tab"
          aria-selected={i === active}
          aria-label={it.long}
          data-active={i === active}
          className="pen-seg-btn"
          onClick={() => onChange(i)}
        >
          {/* Both rendered, one hidden by CSS. No resize listener needed for the swap, and
              the pill remeasures on resize anyway. aria-label always carries the full name. */}
          <span className="pen-seg-long">{it.long}</span>
          <span className="pen-seg-short">{it.short}</span>
        </button>
      ))}
    </div>
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
        <div className="pen-lp-eyebrow">How it works</div>
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
          <div className="pen-lp-eyebrow">The part that earns its keep</div>
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

/* ---------------------------------------------------------- what you get */

function WhatYouGet() {
  return (
    <section className="pen-lp-wrap pt-28 sm:pt-36">
      <Reveal>
        <div className="pen-lp-eyebrow">Out of one meeting</div>
        <h2 className="pen-display mt-4 max-w-[26ch] text-[clamp(28px,4vw,40px)] leading-[1.12] tracking-[-0.015em]">
          A summary you can send, a list you can work from, an email already written.
        </h2>
      </Reveal>

      <div className="mt-14 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        {/* Left: the note, as it actually renders */}
        <Reveal delay={0.06}>
          <div className="pen-lp-card h-full">
            <div className="pen-label">Summary</div>
            <p className="mt-2.5 text-[16px] leading-[1.62]">
              Third viewing with the Hendersons. Sarah led on the renovated kitchen; Tom went
              straight to price and flagged it as above their ceiling. No garage came up again,
              now three properties running. They asked to return at the weekend with her mother.
            </p>

            <div className="pen-label mt-8">Next actions</div>
            <ul className="pen-lp-todo">
              {[
                ['Check whether the HOA permits enclosing the carport', 'PRIORITY \u00B7 before the weekend'],
                ['Send comps for the street to justify the asking price', ''],
                ['Confirm the weekend time and that her mother is coming', ''],
              ].map(([task, meta]) => (
                <li key={task}>
                  <span className="pen-lp-check" aria-hidden />
                  <span>
                    <span className="text-[15px] leading-snug">{task}</span>
                    {meta && (
                      <span className="pen-mono mt-1 block text-[10px]" style={{ color: 'var(--bad)' }}>{meta}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* Right: the two things that leave the app */}
        <div className="grid gap-5">
          <Reveal delay={0.12}>
            <div className="pen-lp-card">
              <div className="flex items-center justify-between">
                <div className="pen-label">Drafted from one line</div>
                <span className="pen-lp-tag">Draft email</span>
              </div>
              <pre className="pen-lp-pre">{`To: the listing agent
Subject: Carport / HOA before Saturday

Quick one before the second viewing — can you confirm
whether the HOA allows the carport to be enclosed? The
buyers have asked about a garage at all three properties,
so it will decide whether they bid.`}</pre>
            </div>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="pen-lp-card">
              <div className="flex items-center justify-between">
                <div className="pen-label">In your inbox after</div>
                <span className="pen-lp-tag">Briefing</span>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.6]" style={{ color: 'var(--soft)' }}>
                One email with the summary, the three things you nearly missed, what is still
                open, and every action with its owner. Sent to you, not to anyone else.
              </p>
              <div className="pen-lp-mailrow">
                <span className="pen-mono text-[10.5px]" style={{ color: 'var(--faint)' }}>
                  Briefing &mdash; Ridgewood walk-through
                </span>
                <span className="pen-lp-dot" />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- compounding */

function Compounds() {
  return (
    <section className="pen-lp-wrap pt-28 sm:pt-36">
      <div className="grid gap-12 lg:grid-cols-[1fr_0.92fr] lg:gap-20">
        <Reveal>
          <div className="pen-lp-eyebrow">Why the tenth is better than the first</div>
          <h2 className="pen-display mt-4 text-[clamp(28px,4vw,40px)] leading-[1.12] tracking-[-0.015em]">
            Every recording makes the next one sharper.
          </h2>
          <p className="mt-6 max-w-[42ch] text-[17px] leading-[1.62]" style={{ color: 'var(--soft)' }}>
            One meeting gives you a note. Several give you a picture: what these people keep
            asking for, what they have quietly ruled out, what you still have not found out.
            Pen keeps that picture and updates it every time you record.
          </p>
          <p className="mt-5 max-w-[42ch] text-[17px] leading-[1.62]" style={{ color: 'var(--soft)' }}>
            It is also the part no general notetaker can give you. They summarise a meeting.
            This remembers a relationship.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="pen-lp-card">
            <header className="flex items-baseline justify-between">
              <h3 className="pen-display text-[20px]">The Hendersons</h3>
              <span className="pen-mono text-[10px]" style={{ color: 'var(--faint)' }}>3 meetings</span>
            </header>

            <Facet label="Must have" items={['Covered parking — raised at all three viewings', 'A kitchen that has already been done']} />
            <Facet label="Ruled out" items={['Anything over their stated ceiling', 'Busy through-roads']} tone="bad" />
            <Facet label="Never said outright" items={['The kitchen decides it for her; the number decides it for him']} tone="accent" />
            <Facet label="Still unknown" items={['The actual ceiling. He has referred to it twice without naming it.']} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Facet({ label, items, tone }: { label: string; items: string[]; tone?: 'bad' | 'accent' }) {
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'accent' ? 'var(--accent-ink)' : 'var(--dim)'
  return (
    <div className="mt-5">
      <div className="pen-mono text-[9.5px] uppercase tracking-[.12em]" style={{ color }}>{label}</div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((t) => <li key={t} className="text-[14.5px] leading-snug">{t}</li>)}
      </ul>
    </div>
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
          <div className="pen-lp-eyebrow pen-lp-eyebrow-dark">Pricing</div>
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
              {/* The "Free while in beta" ribbon carries this now, so the line under the
                  button was saying it twice. The CTA still signs you in rather than opening a
                  checkout, so nothing here claims to take payment. */}
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
