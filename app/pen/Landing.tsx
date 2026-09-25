'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { CSSProperties } from 'react'
import PenSequence from './PenSequence'
import PenArt from './PenArt'
import Icon, { type IconName } from './Icon'
import { PLAN_MONTHLY_USD, PLAN_HALFYEAR_USD, PLAN_ANNUAL_USD, PEN_USD, SOFTWARE_MONTHLY_USD, SOFTWARE_HALFYEAR_USD, TRIAL_DAYS, TRIAL_DAYS_POSTED } from '@/lib/pen/plan'

// The signed-out face of tryjunoapp.com.
//
// Same typography and palette as the app (Instrument Serif, Literata, IBM Plex Mono, warm
// paper, one emerald accent): a landing page that looks nothing like the product it sells is
// a promise the product then breaks. What it sells is two things at once, the software and
// the pen, so the hero shows both in one picture and the page then gives each its own act.
//
// Copy rules kept from the previous page: one label per call to action, no em dashes in
// anything a reader sees, and no claim the product cannot stand behind. The security card
// says only what is true today: encrypted in transit and at rest, private to the account,
// deletable, never sold. It does not say end-to-end, because the AI has to read the audio.

const SIGN_IN = '/auth/signin?callbackUrl=/pen'
// Everything that means "I want to try this" goes here.
const SIGN_UP = '/pen/signup'
/** One label for one intent, in one place. */
const CTA = `Start ${TRIAL_DAYS_POSTED} days free`
/** The yearly plan is paid up front (no trial), so its button cannot promise free days. */
const CTA_YEARLY = 'Get the year'

/**
 * CSS-driven reveal. A marketing page must not start at opacity 0 and wait for JS: a slow
 * connection, a hydration error or a crawler would all see a blank page.
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
    <div className="pen-lp pen-lp2">
      <Nav />
      <Hero />
      <Audience />
      <Features />
      <HowItWorks />
      <ThePen />
      <Pricing />
      <Closing />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------- nav */

function Nav() {
  return (
    <header className="pen-lp-nav">
      <div className="pen-lp-wrap flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center" aria-label="Juno Pen, home">
          <Image src="/juno_mark.png" alt="" width={32} height={32} className="pen-mark" priority />
          <span className="pen-display pen-lp-wordmark">Juno Pen</span>
        </Link>
        <nav className="flex items-center gap-1">
          <a href="#features" className="pen-lp-navlink pen-lp2-hide-sm">What it does</a>
          <a href="#pen" className="pen-lp-navlink pen-lp2-hide-sm">The pen</a>
          <a href="#pricing" className="pen-lp-navlink pen-lp2-hide-sm">Pricing</a>
          <Link href={SIGN_IN} className="pen-lp-navlink">Sign in</Link>
          <Link href={`${SIGN_UP}?from=nav`} className="pen-lp-btn pen-lp-btn-sm pen-lp-btn-primary">{CTA}</Link>
        </nav>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="pen-lp-wrap pen-lp2-hero">
      <div className="pen-lp2-hero-copy">
        <Reveal>
          <h1 className="pen-lp-h1 pen-lp2-h1">
            Focus on the conversation. <span className="pen-lp-em">We&rsquo;ll remember every word.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="pen-lp2-lede">
            A real pen that records. Plug it in and Juno Pen writes up who was there, what was
            decided, what you owe people, and the thing you nearly missed. Then it drafts the
            follow-up email.
          </p>
        </Reveal>
        <Reveal delay={0.14}>
          <div className="pen-lp2-ctas">
            <Link href={`${SIGN_UP}?from=hero`} className="pen-lp-btn pen-lp-btn-accent pen-lp2-btn-lg">{CTA}</Link>
            <a href="#features" className="pen-lp-btn pen-lp2-btn-lg">See what it does</a>
          </div>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="pen-lp2-offer">
            {`Unlimited recording. $${PLAN_ANNUAL_USD} a year with the pen included, or $${SOFTWARE_MONTHLY_USD} a month with your own recorder.`}
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.1} className="pen-lp2-stage">
        <div className="pen-lp2-stage-inner" aria-hidden>
          <div className="pen-lp2-halo" />
          <PenArt id="hero-pen" className="pen-lp2-hero-pen" />

          {/* What comes out of it, as the app draws it. Three small cards, each one feature. */}
          <div className="pen-lp2-float pen-lp2-float-a">
            <span className="pen-lp2-float-label">Detected on this call</span>
            <span className="pen-lp2-chip"><span className="pen-lp2-av">CD</span>Chris Dyas <em>buyer</em></span>
          </div>
          <div className="pen-lp2-float pen-lp2-float-b">
            <span className="pen-lp2-tick" />
            <span>
              <span className="pen-lp2-float-strong">Send comps for Ridgewood</span>
              <span className="pen-lp2-float-meta">Due Friday</span>
            </span>
          </div>
          <div className="pen-lp2-float pen-lp2-float-c">
            <span className="pen-lp2-float-label"><Icon name="mail" size={13} /> Draft ready</span>
            <span className="pen-lp2-float-strong">Re: carport before Saturday</span>
            <span className="pen-lp2-mini-btn">Open in Gmail</span>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------- audience */

type Role = {
  tab: string
  short: string
  /** The question, with @-tags written as {Name}. */
  q: string
  /** The answer, with [n] citation markers. */
  a: string
  sources: { title: string; date: string }[]
}

// One question per kind of work, answered across several calls with the sources linked.
// Everything shown is what the real archive chat does: @-tags, answers drawn from more than
// one recording, and numbered citations that open the call they came from.
const ROLES: Role[] = [
  {
    tab: 'Realtors',
    short: 'Realtors',
    q: 'What has {Sarah} said about parking across all the viewings?',
    a: 'She has raised it at all three viewings [1][2][3]. At Oak Street she said they would not bid without covered parking [2], and at Ridgewood she called it the thing that decides it [3]. Tom has never objected to paying more for it [1].',
    sources: [
      { title: 'Maple Avenue viewing', date: 'Sep 9' },
      { title: 'Oak Street viewing', date: 'Sep 14' },
      { title: 'Ridgewood walk-through', date: 'Sep 21' },
    ],
  },
  {
    tab: 'Students',
    short: 'Students',
    q: 'What did Professor Ruiz say will be on the midterm?',
    a: 'One WACC question with a changing capital structure [2] and a bond pricing problem like problem set 3 [1]. She said most people lose marks on the tax shield, not the formula [2], and that a formula sheet is allowed [3].',
    sources: [
      { title: 'Corporate Finance, lecture 4', date: 'Sep 10' },
      { title: 'Corporate Finance, lecture 6', date: 'Sep 17' },
      { title: 'Office hours', date: 'Sep 19' },
    ],
  },
  {
    tab: 'Bankers',
    short: 'Bankers',
    q: 'Which clients raised covenant issues this quarter?',
    a: 'Two. Harbor Logistics said the board will not approve new facilities until leverage clears for two quarters [1]. Delta Foods asked to reset the interest cover test before renewal [3]. Meridian mentioned covenants but said it has headroom [2].',
    sources: [
      { title: 'Harbor Logistics review', date: 'Aug 4' },
      { title: 'Meridian quarterly', date: 'Aug 19' },
      { title: 'Delta Foods renewal call', date: 'Sep 2' },
    ],
  },
  {
    tab: 'Founders & CEOs',
    short: 'Founders',
    q: 'What did investors push back on most?',
    a: 'Market size, in three of four calls [1][2][4]. Northbeam wanted month-6 retention by channel instead [3], and two funds asked who else is in the round before taking it to a partner meeting [2][4].',
    sources: [
      { title: 'Harbor VC intro', date: 'Aug 28' },
      { title: 'Lattice Capital', date: 'Sep 3' },
      { title: 'Northbeam Ventures', date: 'Sep 11' },
      { title: 'Fieldstone seed call', date: 'Sep 16' },
    ],
  },
  {
    tab: 'Consultants',
    short: 'Consult',
    q: 'What did {Dana} commit to, and by when?',
    a: 'Three things. Discount data by rep before the workshop [1], the Q3 margin bridge by Friday [2], and bringing the CFO to the board-pack review on the 14th [3].',
    sources: [
      { title: 'Kickoff with the COO', date: 'Sep 1' },
      { title: 'Pricing workshop', date: 'Sep 12' },
      { title: 'Steering call', date: 'Sep 18' },
    ],
  },
]

function Audience() {
  const [active, setActive] = useState(0)
  return (
    <section className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">For anyone who talks for a living.</h2>
        <p className="pen-lp2-sub">
          Ask anything across every call you have ever recorded. Every answer shows exactly where
          it was said.
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <Segmented items={ROLES.map((r) => ({ long: r.tab, short: r.short }))} active={active} onChange={setActive} />
      </Reveal>
      <Reveal delay={0.14}>
        <ChatDemo role={ROLES[active]} />
      </Reveal>
    </section>
  )
}

/** Splits "text [1][2] more" into text and citation numbers, like the real answer renderer. */
function parts(text: string): (string | number)[] {
  return text.split(/(\[\d+\])/g).filter(Boolean).map((p) => (/^\[\d+\]$/.test(p) ? Number(p.slice(1, -1)) : p))
}

/**
 * Renders an answer with citation pills. Punctuation straight after a pill is kept on the
 * same line as it; otherwise a sentence can end with its full stop alone on the next line.
 */
function Cited({ text }: { text: string }) {
  const ps = parts(text)
  const out: React.ReactNode[] = []
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    if (typeof p !== 'number') {
      out.push(<span key={i}>{p}</span>)
      continue
    }
    const next = ps[i + 1]
    const punct = typeof next === 'string' ? /^[.,;:]/.exec(next)?.[0] ?? '' : ''
    out.push(
      <span key={i} className="pen-lp2-nowrap">
        <span className="pen-lp2-cite">{p}</span>
        {punct}
      </span>,
    )
    if (punct) ps[i + 1] = (next as string).slice(punct.length)
  }
  return <>{out}</>
}

/**
 * The archive chat, playing one exchange: the question types itself, the answer arrives a
 * few words at a time, the sources follow. It starts fully drawn so the page is never blank
 * without JS; the animation runs when it scrolls into view and on every tab change, and not
 * at all for anyone who prefers reduced motion.
 */
function ChatDemo({ role }: { role: Role }) {
  const q = role.q.replace(/\{([^}]+)\}/g, '@$1')
  const words = role.a.split(' ')
  const [step, setStep] = useState<{ q: number; a: number }>({ q: q.length, a: words.length })
  const box = useRef<HTMLDivElement>(null)
  const seen = useRef(false)
  const first = useRef(true)

  const play = useCallback(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let qi = 0
    let ai = 0
    setStep({ q: 0, a: 0 })
    const t = window.setInterval(() => {
      if (qi < q.length) {
        qi = Math.min(q.length, qi + 2)
        setStep({ q: qi, a: 0 })
      } else if (ai < words.length) {
        ai += 1
        setStep({ q: q.length, a: ai })
      } else window.clearInterval(t)
    }, 34)
    return () => window.clearInterval(t)
  }, [q, words.length])

  // Replay on tab change (not on first render).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    return play()
  }, [role, play])

  // Play once when it first scrolls into view.
  useEffect(() => {
    const el = box.current
    if (!el || !('IntersectionObserver' in window)) return
    let stop: (() => void) | undefined
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !seen.current) {
        seen.current = true
        stop = play()
        io.disconnect()
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => {
      io.disconnect()
      stop?.()
    }
  }, [play])

  const typedQ = q.slice(0, step.q)
  const answer = words.slice(0, step.a).join(' ')
  const done = step.a >= words.length
  const asking = step.q < q.length

  return (
    <div className="pen-lp2-chatdemo" ref={box}>
      <div className="pen-lp2-chatbar">
        <Icon name="search" size={16} />
        <span>Ask across every recording</span>
        <span className="pen-lp2-chatbar-n">{`${role.sources.length} calls found`}</span>
      </div>
      <div className="pen-lp2-chatbody">
        <p className="pen-lp2-chatq">
          {typedQ.split(/(@[A-Z][a-z]+)/g).map((p, i) =>
            p.startsWith('@') ? <span key={i} className="pen-lp2-tag">{p}</span> : <span key={i}>{p}</span>,
          )}
          {asking && <span className="pen-lp2-caret" />}
        </p>
        <div className="pen-lp2-chata" aria-live="polite">
          {!asking && (
            <p>
              <Cited text={answer} />
            </p>
          )}
        </div>
        <div className="pen-lp2-sources" data-on={done}>
          {role.sources.map((s, i) => (
            <span key={s.title} className="pen-lp2-source" style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="pen-lp2-cite">{i + 1}</span>
              <span className="pen-lp2-source-t">{s.title}</span>
              <span className="pen-lp2-source-d">{s.date}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Segmented control: an inset track with one elevated pill whose position and width are
 * measured from the active segment and animated. Labels are plain text above it, so the
 * control works even if the animation never runs.
 */
function Segmented({ items, active, onChange }: { items: { long: string; short: string }[]; active: number; onChange: (i: number) => void }) {
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
  useLayoutEffect(measure, [measure])
  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', onResize)
  }, [measure])
  return (
    <div className="pen-seg pen-lp2-seg" role="tablist" aria-label="Who it is for" ref={trackRef}>
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
          <span className="pen-seg-long">{it.long}</span>
          <span className="pen-seg-short">{it.short}</span>
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- features */

function FeatureHead({ icon, title, tone }: { icon: IconName; title: string; tone?: 'warn' | 'ink' }) {
  return (
    <div className="pen-lp2-fhead">
      <span className="pen-lp2-ficon" data-tone={tone}><Icon name={icon} size={18} /></span>
      <h3 className="pen-lp2-ftitle">{title}</h3>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">Everything after the meeting, already done.</h2>
        <p className="pen-lp2-sub">
          The note, the people, the to-dos, the email, and an assistant that has read every
          conversation you have ever recorded.
        </p>
      </Reveal>

      <div className="pen-lp2-bento">
        {/* 1. The note */}
        <Reveal delay={0.04} className="pen-lp2-b pen-lp2-b-note">
          <article className="pen-lp2-card">
            <FeatureHead icon="sparkle" title="Written up for you" />
            <p className="pen-lp2-fcopy">Who said what, what was decided, and what happens next.</p>
            <div className="pen-lp2-demo">
              <div className="pen-lp2-demo-label">Summary</div>
              <p className="pen-lp2-demo-text">
                Third viewing with the Hendersons. Sarah led on the renovated kitchen; Tom went
                straight to price and flagged it as above their ceiling. They asked to return at the
                weekend with her mother.
              </p>
              <div className="pen-lp2-demo-label" style={{ marginTop: 16 }}>Next actions</div>
              <ul className="pen-lp2-todos">
                <li><span className="pen-lp2-tick pen-lp2-tick-on" /><s>Send comps for the street</s></li>
                <li><span className="pen-lp2-tick" />Check the HOA on the carport <em>Priority</em></li>
                <li><span className="pen-lp2-tick" />Confirm Saturday with her mother</li>
              </ul>
              <div className="pen-lp2-demo-label" style={{ marginTop: 18 }}>Decided</div>
              <p className="pen-lp2-demo-small">They will make an offer this week if the covered parking checks out.</p>
              <div className="pen-lp2-demo-label" style={{ marginTop: 18 }}>Transcript</div>
              <div className="pen-lp2-turns">
                <p><span className="pen-lp2-who">Sarah</span>We love the kitchen. The parking is the thing.</p>
                <p><span className="pen-lp2-who">You</span>There is a covered spot with the unit, round the back.</p>
                <p><span className="pen-lp2-who">Tom</span>Then we would want to move on it this week.</p>
              </div>
            </div>
          </article>
        </Reveal>

        {/* 2. People */}
        <Reveal delay={0.08} className="pen-lp2-b pen-lp2-b-people">
          <article className="pen-lp2-card">
            <FeatureHead icon="people" title="Knows who was there" />
            <p className="pen-lp2-fcopy">It picks out the people it heard. One click saves them, with what they care about.</p>
            <div className="pen-lp2-demo">
              <div className="pen-lp2-person">
                <span className="pen-lp2-av pen-lp2-av-lg">SH</span>
                <span>
                  <span className="pen-lp2-demo-strong">Sarah Henderson</span>
                  <span className="pen-lp2-demo-meta">Buyer · 3 calls</span>
                </span>
              </div>
              <p className="pen-lp2-demo-small">Wants covered parking and a finished kitchen. Leads on design; defers to Tom on price.</p>
              <div className="pen-lp2-detected">
                <span className="pen-lp2-demo-meta">Detected on this call</span>
                <span className="pen-lp2-pill">+ Tom · husband</span>
                <span className="pen-lp2-pill">+ Maria · lender</span>
              </div>
            </div>
          </article>
        </Reveal>

        {/* 3. Jot and enhance */}
        <Reveal delay={0.12} className="pen-lp2-b pen-lp2-b-ask">
          <article className="pen-lp2-card">
            <FeatureHead icon="pen" title="Jot three words, get the whole story" />
            <p className="pen-lp2-fcopy">Type a quick note during the meeting. Press Enhance and it fills in what was actually said.</p>
            <div className="pen-lp2-demo">
              <p className="pen-lp2-jot">no garage again</p>
              <p className="pen-lp2-enh">
                Third property in a row without one. Sarah raised it in passing, which makes it a filter,
                not a preference.
              </p>
              <span className="pen-lp2-mini-btn pen-lp2-mini-btn-on"><Icon name="sparkle" size={13} />Enhance</span>
            </div>
          </article>
        </Reveal>

        {/* 4. Email */}
        <Reveal delay={0.06} className="pen-lp2-b pen-lp2-b-email">
          <article className="pen-lp2-card">
            <FeatureHead icon="mail" title="The follow-up, already written" />
            <p className="pen-lp2-fcopy">Pick any action and get the email. Open it in Gmail or Outlook, edit, send.</p>
            <div className="pen-lp2-demo">
              <div className="pen-lp2-mail-row"><span>To</span>tom.henderson@gmail.com</div>
              <div className="pen-lp2-mail-row"><span>Subject</span>Carport before Saturday</div>
              <p className="pen-lp2-demo-small" style={{ marginTop: 10 }}>
                Quick one before the second viewing: the HOA does allow the carport to be enclosed, so the
                garage question has an answer.
              </p>
              <div className="pen-lp2-mail-btns">
                <span className="pen-lp2-mini-btn pen-lp2-mini-btn-on">Open in Gmail</span>
                <span className="pen-lp2-mini-btn">Outlook</span>
              </div>
            </div>
          </article>
        </Reveal>

        {/* 5. Nearly missed */}
        <Reveal delay={0.1} className="pen-lp2-b pen-lp2-b-missed">
          <article className="pen-lp2-card">
            <FeatureHead icon="alert" title="What you nearly missed" tone="warn" />
            <p className="pen-lp2-fcopy">The promise made in passing, the number nobody named.</p>
            <ul className="pen-lp2-missed">
              <li>
                <span className="pen-lp2-dot" />
                <span>
                  <span className="pen-lp2-demo-strong">They asked to come back with her mother</span>
                  <span className="pen-lp2-demo-meta">The strongest buying signal, in the last thirty seconds.</span>
                </span>
              </li>
              <li>
                <span className="pen-lp2-dot" />
                <span>
                  <span className="pen-lp2-demo-strong">You promised to check the HOA</span>
                  <span className="pen-lp2-demo-meta">Said aloud, easy to forget by the weekend.</span>
                </span>
              </li>
            </ul>
          </article>
        </Reveal>

        {/* 6. On top of it */}
        <Reveal delay={0.14} className="pen-lp2-b pen-lp2-b-home">
          <article className="pen-lp2-card">
            <FeatureHead icon="checklist" title="On top of everything" />
            <p className="pen-lp2-fcopy">Every open action across every call, in one place.</p>
            <div className="pen-lp2-stats">
              <div><span className="pen-lp2-stat pen-lp2-stat-warn">12</span><span>still to do</span></div>
              <div><span className="pen-lp2-stat">4</span><span>nearly missed</span></div>
              <div><span className="pen-lp2-stat">27</span><span>people</span></div>
            </div>
            <ul className="pen-lp2-todos pen-lp2-todos-sm">
              <li><span className="pen-lp2-tick" />Send Priya the retention numbers</li>
              <li><span className="pen-lp2-tick" />Email office hours by Wednesday</li>
            </ul>
          </article>
        </Reveal>

        {/* 7. WhatsApp */}
        <Reveal delay={0.06} className="pen-lp2-b pen-lp2-b-wa">
          <article className="pen-lp2-card pen-lp2-wa">
            <div className="pen-lp2-wa-copy">
              <FeatureHead icon="chat" title="Or just send it on WhatsApp" />
              <p className="pen-lp2-fcopy">
                Plug the pen into your phone and send the recording to Juno Pen. The briefing comes back in the chat,
                and you can ask about any call from there.
              </p>
            </div>
            <div className="pen-lp2-wa-chat" aria-hidden="true">
              <div className="pen-lp2-bub pen-lp2-bub-me"><Icon name="wave" size={14} />R20260922-213209.WAV</div>
              <div className="pen-lp2-bub">
                <strong>Maple Avenue viewing</strong> (38 min)
                <br />
                Sarah loved the kitchen; Tom balked at the price. Second viewing Saturday.
              </div>
              <div className="pen-lp2-bub pen-lp2-bub-me">What did Tom say about the garage?</div>
            </div>
          </article>
        </Reveal>

        {/* 8. Private */}
        <Reveal delay={0.08} className="pen-lp2-b pen-lp2-b-private">
          <article className="pen-lp2-card pen-lp2-card-ink">
            <FeatureHead icon="lock" title="Private by design" tone="ink" />
            <ul className="pen-lp2-private">
              <li><Icon name="check" size={16} />Encrypted in transit and at rest</li>
              <li><Icon name="check" size={16} />Private to your account</li>
              <li><Icon name="check" size={16} />Delete anything, anytime</li>
              <li><Icon name="check" size={16} />Never sold</li>
            </ul>
          </article>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ how it works */

const STEPS: { h: string; p: string; icon: IconName }[] = [
  { h: 'Record', p: 'Press once and put it in your pocket. In voice mode it skips the silences.', icon: 'mic' },
  { h: 'Plug it in', p: 'USB-C, straight into your laptop or phone. Juno Pen finds the new recordings, or send them on WhatsApp.', icon: 'usb' },
  { h: 'Read the note', p: 'Minutes later: the summary, the people, the actions, and the email to send. In the app or in the chat.', icon: 'sparkle' },
]

function HowItWorks() {
  return (
    <section id="how" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">Three steps. Two of them are plugging in a cable.</h2>
      </Reveal>
      <div className="pen-lp2-how">
        <div className="pen-lp2-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.h} delay={i * 0.07}>
              <div className="pen-lp2-step">
                <span className="pen-lp2-step-n">{i + 1}</span>
                <span className="pen-lp2-ficon"><Icon name={s.icon} size={18} /></span>
                <span>
                  <h3 className="pen-lp2-ftitle">{s.h}</h3>
                  <p className="pen-lp2-fcopy">{s.p}</p>
                </span>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1} className="pen-lp2-seq">
          <div className="pen-seq-wrap">
            <PenSequence />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- the pen */

const SPECS: { icon: IconName; k: string; v: string }[] = [
  { icon: 'mic', k: '360° microphone', v: 'Picks up every side of the table, with noise reduction built in so voices come through clean.' },
  { icon: 'usb', k: 'USB-C built in', v: 'Plugs straight into a laptop, phone or tablet. No cable to lose, nothing to install.' },
  { icon: 'wave', k: 'One touch, voice activated', v: 'Press once to record. Voice mode pauses in the silences, so long meetings stay short to review.' },
  { icon: 'clock', k: 'Timestamped files', v: 'Every recording is named by when it started. Long ones split cleanly and rejoin in Juno Pen.' },
  { icon: 'save', k: 'Never loses a take', v: 'If the battery runs low it saves the recording before it powers down.' },
  { icon: 'pen', k: 'It writes, too', v: 'A real ballpoint, refills in the box. Nobody asks what it is.' },
]

function ThePen() {
  return (
    <section id="pen" className="pen-lp2-pen">
      <div className="pen-lp-wrap">
        <div className="pen-lp2-pen-top">
          <Reveal>
            <h2 className="pen-lp-h2 pen-lp2-h2">A pen that hears the whole room.</h2>
            <p className="pen-lp2-sub">
              Clip it in a shirt pocket or leave it on the table. Clear audio, a battery that lasts the
              week, and room for years of meetings.
            </p>
          </Reveal>
          <Reveal delay={0.08} className="pen-lp2-pen-art">
            <div className="pen-lp2-halo pen-lp2-halo-wide" />
            <PenArt id="spec-pen" className="pen-lp2-spec-pen" />
            <figure className="pen-lp2-open">
              <PenArt id="open-pen" variant="open" className="pen-lp2-open-pen" />
              <figcaption>Open it at the ring and the USB-C plug is right there.</figcaption>
            </figure>
          </Reveal>
        </div>

        <div className="pen-lp2-bignums">
          <Reveal delay={0.04}>
            <div className="pen-lp2-card pen-lp2-bignum">
              <span className="pen-lp2-num">72<small>GB</small></span>
              <span className="pen-lp2-num-k">of storage</span>
              <span className="pen-lp2-num-v">Over 7,000 hours of audio at the lowest bitrate. Years of meetings before it fills.</span>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="pen-lp2-card pen-lp2-bignum">
              <span className="pen-lp2-num">35<small>hrs</small></span>
              <span className="pen-lp2-num-k">of recording per charge</span>
              <span className="pen-lp2-num-v">A full working week of meetings between charges.</span>
            </div>
          </Reveal>
        </div>

        <div className="pen-lp2-specs">
          {SPECS.map((s, i) => (
            <Reveal key={s.k} delay={0.04 + i * 0.04}>
              <div className="pen-lp2-card pen-lp2-spec">
                <span className="pen-lp2-ficon"><Icon name={s.icon} size={18} /></span>
                <h3 className="pen-lp2-ftitle">{s.k}</h3>
                <p className="pen-lp2-fcopy">{s.v}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="pen-lp2-inbox">
            In the box: the pen, a USB-C to USB-A cable, earphones, spare ink refills and a small screwdriver.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- pricing */

// Listed once, under every card, because it IS the same on every plan.
const INCLUDED = [
  'Unlimited recording (fair use: 100 hours a month)',
  'Full transcript with who said what',
  'Summary, decisions and action items',
  'People detected and remembered',
  'Ask across every recording with @',
  'Follow-up emails drafted for you',
  'A briefing in your inbox after each meeting',
  'Notes in the language you spoke',
]

function PlanCta({ href, children, variant }: { href: string; children: React.ReactNode; variant: 'ghost' | 'accent' }) {
  return (
    <Link href={href} className={`pen-lp-btn ${variant === 'accent' ? 'pen-lp-btn-accent' : 'pen-lp-btn-ghost'} mt-auto w-full justify-center`}>
      {children}
    </Link>
  )
}

type PlanCard = {
  name: string
  price: number
  per: string
  line: string
  trade: string
  href: string
  cta: string
  ribbon?: string
  pro?: boolean
}

function PlanCardView({ p, delay }: { p: PlanCard; delay: number }) {
  return (
    <Reveal delay={delay}>
      <article className={`pen-lp-plan${p.pro ? ' pen-lp-plan-pro' : ''}`}>
        {p.ribbon && <span className="pen-lp-ribbon">{p.ribbon}</span>}
        <header>
          <h3 className="pen-mono pen-t-label uppercase tracking-[.14em]" style={{ color: p.pro ? 'var(--accent-line)' : undefined }}>
            <span className={p.pro ? '' : 'pen-od-dim'}>{p.name}</span>
          </h3>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="pen-display pen-od-paper pen-t-price">{`$${p.price}`}</span>
            <span className="pen-mono pen-od-dim pen-t-small">{p.per}</span>
          </div>
          <p className="pen-mono pen-od-mid mt-3 pen-t-small">{p.line}</p>
        </header>
        <p className="pen-lp-plan-trade">{p.trade}</p>
        <PlanCta href={p.href} variant={p.pro ? 'accent' : 'ghost'}>{p.cta}</PlanCta>
      </article>
    </Reveal>
  )
}

const WITH_PEN: PlanCard[] = [
  {
    name: 'Monthly',
    price: PLAN_MONTHLY_USD,
    per: 'a month',
    line: `${TRIAL_DAYS_POSTED} days free · pen $${PEN_USD} once`,
    trade: 'You buy the pen, and you can stop any month you like.',
    href: `${SIGN_UP}?plan=monthly&offer=posted-pen&from=pricing`,
    cta: CTA,
  },
  {
    name: '6 months',
    price: PLAN_HALFYEAR_USD,
    per: 'every 6 months',
    line: `$${PLAN_HALFYEAR_USD / 6} a month · pen included`,
    trade: 'The pen is on us, paid up front for half a year.',
    href: `${SIGN_UP}?plan=halfyear&offer=posted-pen&from=pricing`,
    cta: 'Get 6 months',
    ribbon: 'Pen included',
  },
  {
    name: 'Yearly',
    price: PLAN_ANNUAL_USD,
    per: 'a year',
    line: `$${Math.round(PLAN_ANNUAL_USD / 12)} a month · pen included`,
    trade: 'The pen is on us, and it works out cheapest.',
    href: `${SIGN_UP}?plan=annual&offer=posted-pen&from=pricing`,
    cta: CTA_YEARLY,
    ribbon: 'Best value',
    pro: true,
  },
]

const OWN_RECORDER: PlanCard[] = [
  {
    name: 'Monthly',
    price: SOFTWARE_MONTHLY_USD,
    per: 'a month',
    line: `${TRIAL_DAYS} days free`,
    trade: 'Record on your phone or any recorder and upload the file.',
    href: `${SIGN_UP}?plan=monthly&offer=own-recorder&from=pricing`,
    cta: `Start ${TRIAL_DAYS} days free`,
  },
  {
    name: '6 months',
    price: SOFTWARE_HALFYEAR_USD,
    per: 'every 6 months',
    line: `$${SOFTWARE_HALFYEAR_USD / 6} a month · billed today`,
    trade: 'The same, paid up front for half a year.',
    href: `${SIGN_UP}?plan=halfyear&offer=own-recorder&from=pricing`,
    cta: 'Get 6 months',
  },
]

function Pricing() {
  return (
    <section id="pricing" className="pen-lp-dark pen-lp2-pricing">
      <div className="pen-lp-wrap py-24 sm:py-28">
        <Reveal>
          <h2 className="pen-lp-h2 pen-lp-h2-tight pen-od-paper">Unlimited recording on every plan.</h2>
          <p className="pen-od-soft mt-5 pen-t-lede-sm text-balance">
            With the Juno pen, or with the recorder you already have. Same notes, same search, same everything.
          </p>
        </Reveal>

        <div className="pen-lp-plangroup mt-14">
          <p className="pen-lp-plangroup-h pen-od-paper">With the Juno pen</p>
          <div className="pen-lp-plans pen-lp-plans-3">
            {WITH_PEN.map((p, i) => <PlanCardView key={p.name} p={p} delay={0.06 + i * 0.06} />)}
          </div>
        </div>

        <div className="pen-lp-plangroup mt-12">
          <p className="pen-lp-plangroup-h pen-od-paper">With your own recorder</p>
          <p className="pen-lp-plangroup-sub pen-od-dim">Your phone, WhatsApp voice notes, Plaud, or any recorder that gives you an audio file.</p>
          <div className="pen-lp-plans pen-lp-plans-2">
            {OWN_RECORDER.map((p, i) => <PlanCardView key={p.name} p={p} delay={0.06 + i * 0.06} />)}
          </div>
        </div>

        <Reveal delay={0.24}>
          <div className="pen-lp-both">
            <p className="pen-t-small pen-od-dim">Every plan includes</p>
            <ul className="pen-lp-bothlist">
              {INCLUDED.map((f) => (
                <li key={f}>
                  <svg viewBox="0 0 16 16" aria-hidden>
                    <path d="M3 8.4 L6.2 11.6 L13 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- closing */

function Closing() {
  return (
    <section className="pen-lp-wrap pen-lp2-close">
      <Reveal>
        <div className="pen-lp2-close-card">
          <PenArt id="close-pen" className="pen-lp2-close-pen" />
          <h2 className="pen-lp-h2 pen-lp2-h2">Your next meeting, remembered.</h2>
          <p className="pen-lp2-sub">{`Try it free for ${TRIAL_DAYS_POSTED} days. The pen ships in the post.`}</p>
          <Link href={`${SIGN_UP}?from=closing`} className="pen-lp-btn pen-lp-btn-accent pen-lp2-btn-lg">{CTA}</Link>
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------------ footer */

function Footer() {
  return (
    <footer className="pen-lp-foot">
      <div className="pen-lp-wrap flex flex-wrap items-center justify-between gap-5 py-9">
        <div className="flex items-center gap-3">
          <Image src="/juno_mark.png" alt="Juno" width={24} height={24} className="pen-mark" />
          <span className="pen-mono pen-t-label" style={{ color: 'var(--faint)' }}>&copy; {new Date().getFullYear()} Juno Pen</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a href="#features" className="pen-lp-footlink">What it does</a>
          <a href="#pen" className="pen-lp-footlink">The pen</a>
          <a href="#pricing" className="pen-lp-footlink">Pricing</a>
          <Link href="/privacy" className="pen-lp-footlink">Privacy</Link>
          <Link href="/terms" className="pen-lp-footlink">Terms</Link>
          <Link href={SIGN_IN} className="pen-lp-footlink">Sign in</Link>
        </nav>
      </div>
      <div className="pen-lp-wrap pb-10">
        <p className="pen-mono max-w-[70ch] pen-t-label leading-[1.8]" style={{ color: 'var(--faint)' }}>
          Recording a conversation needs everyone&rsquo;s permission in many places, Florida included.
          Juno Pen asks you to confirm consent before it processes anything.
        </p>
      </div>
    </footer>
  )
}
