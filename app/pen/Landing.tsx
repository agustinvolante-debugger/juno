'use client'

import Link from 'next/link'
import Image from 'next/image'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { CSSProperties } from 'react'
import PenSequence from './PenSequence'
import PenArt from './PenArt'
import PhoneChat from './PhoneChat'
import Icon, { type IconName } from './Icon'
import { PLAN_MONTHLY_USD, PLAN_HALFYEAR_USD, PLAN_ANNUAL_USD, PEN_USD, SOFTWARE_MONTHLY_USD, SOFTWARE_HALFYEAR_USD, TRIAL_DAYS, TRIAL_DAYS_POSTED } from '@/lib/pen/plan'
import { COPY, LOCAL_PRICES, money, type Copy, type Market, type RoleDemo } from './landing-copy'

// The signed-out face of tryjunoapp.com, in three versions.
//
// Same typography and palette as the app (Instrument Serif, Literata, IBM Plex Mono, warm
// paper, one emerald accent): a landing page that looks nothing like the product it sells is
// a promise the product then breaks.
//
// One layout for every market; the words live in landing-copy.ts. The US page leads with the
// pen and search. The Spanish and Portuguese pages lead with WhatsApp and the phone, because
// that is how Latin America already talks and because the pen cannot be shipped there yet:
// it appears as "coming soon", and every button starts the own-recorder trial instead.
//
// Copy rules kept from the previous page: one label per call to action, no em dashes in
// anything a reader sees, and no claim the product cannot stand behind. The security card
// says only what is true today: encrypted in transit and at rest, private to the account,
// deletable, never sold. It does not say end-to-end, because the AI has to read the audio.

const SIGN_IN = '/auth/signin?callbackUrl=/pen'
// Everything that means "I want to try this" goes here.
const SIGN_UP = '/pen/signup'

type Ctx = { t: Copy; market: Market; latam: boolean }
const L = createContext<Ctx>({ t: COPY.en, market: { lang: 'en', currency: 'usd' }, latam: false })
const useL = () => useContext(L)

/** A signup link that carries the page's language and currency through to checkout. */
function signup(params: string, market: Market): string {
  const extra = market.lang === 'en' ? '' : `&lang=${market.lang}&cur=${market.currency}`
  return `${SIGN_UP}?${params}${extra}`
}

/** What a software-only plan costs where the visitor is. */
function ownPrice(market: Market, plan: 'monthly' | 'halfyear'): string {
  if (market.currency === 'usd') return money(plan === 'monthly' ? SOFTWARE_MONTHLY_USD : SOFTWARE_HALFYEAR_USD, 'usd')
  return money(LOCAL_PRICES[market.currency][plan], market.currency)
}

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

export default function Landing({ market = { lang: 'en', currency: 'usd' } }: { market?: Market }) {
  const t = COPY[market.lang]
  const latam = market.lang !== 'en'
  // The root layout says lang="en" for the whole site; the page it actually shows may not be.
  useEffect(() => {
    document.documentElement.lang = market.lang === 'pt' ? 'pt-BR' : market.lang
  }, [market.lang])
  return (
    <L.Provider value={{ t, market, latam }}>
      <div className="pen-lp pen-lp2">
        <Nav />
        {latam ? <HeroChat /> : <Hero />}
        <Audience />
        <Features />
        <HowItWorks />
        <ThePen />
        <Pricing />
        <Closing />
        <Footer />
      </div>
    </L.Provider>
  )
}

/* ------------------------------------------------------------------- nav */

/** The one "try it" label: the pen trial in the US, the own-recorder trial everywhere else. */
function useMainCta(): { label: string; href: (from: string) => string } {
  const { t, market, latam } = useL()
  return latam
    ? { label: t.cta.trialOwn(TRIAL_DAYS), href: (from) => signup(`plan=monthly&offer=own-recorder&from=${from}`, market) }
    : { label: t.cta.trialPen(TRIAL_DAYS_POSTED), href: (from) => signup(`from=${from}`, market) }
}

function Nav() {
  const { t } = useL()
  const cta = useMainCta()
  return (
    <header className="pen-lp-nav">
      <div className="pen-lp-wrap flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center" aria-label={t.nav.home}>
          <Image src="/juno_mark.png" alt="" width={32} height={32} className="pen-mark" priority />
          <span className="pen-display pen-lp-wordmark">Juno Pen</span>
        </Link>
        <nav className="flex items-center gap-1">
          <a href="#features" className="pen-lp-navlink pen-lp2-hide-sm">{t.nav.features}</a>
          <a href="#pen" className="pen-lp-navlink pen-lp2-hide-sm">{t.nav.pen}</a>
          <a href="#pricing" className="pen-lp-navlink pen-lp2-hide-sm">{t.nav.pricing}</a>
          <Link href={SIGN_IN} className="pen-lp-navlink">{t.nav.signIn}</Link>
          <Link href={cta.href('nav')} className="pen-lp-btn pen-lp-btn-sm pen-lp-btn-primary">{cta.label}</Link>
        </nav>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ hero */

/** The line under the buttons, with prices filled in for the visitor's currency. */
function offerLine(t: Copy, market: Market): string {
  return t.hero.offer.replace('{yearly}', money(PLAN_ANNUAL_USD, 'usd')).replace('{own}', ownPrice(market, 'monthly'))
}

/** "No pen?" — a link that opens the own-recorder pricing tab. */
function NoPenLine() {
  const { t } = useL()
  // The question part ("No pen?") is set in bold; the rest links on to the plans.
  const m = /^(.*?\?)\s+(.*)$/.exec(t.hero.noPen)
  return (
    <a href="#plans-own" className="pen-lp2-nopen">
      <Icon name="wave" size={17} />
      <span>
        {m ? <><strong>{m[1]}</strong> {m[2]}</> : t.hero.noPen}
      </span>
      <Icon name="chevron" size={15} className="pen-lp2-nopen-go" />
    </a>
  )
}

function Hero() {
  const { t, market } = useL()
  const cta = useMainCta()
  return (
    <section className="pen-lp-wrap pen-lp2-hero">
      <div className="pen-lp2-hero-copy">
        <Reveal>
          <h1 className="pen-lp-h1 pen-lp2-h1">
            {t.hero.h1a} <span className="pen-lp-em">{t.hero.h1b}</span>
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="pen-lp2-lede">{t.hero.lede}</p>
        </Reveal>
        <Reveal delay={0.14}>
          <div className="pen-lp2-ctas">
            <Link href={cta.href('hero')} className="pen-lp-btn pen-lp-btn-accent pen-lp2-btn-lg">{cta.label}</Link>
            <a href="#features" className="pen-lp-btn pen-lp2-btn-lg">{t.cta.seeWhat}</a>
          </div>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="pen-lp2-offer">{offerLine(t, market)}</p>
          <NoPenLine />
        </Reveal>
      </div>

      <Reveal delay={0.1} className="pen-lp2-stage">
        <div className="pen-lp2-stage-inner" aria-hidden>
          <div className="pen-lp2-halo" />
          <PenArt id="hero-pen" className="pen-lp2-hero-pen" />

          {/* What comes out of it, as the app draws it. Three small cards, each one feature. */}
          <div className="pen-lp2-float pen-lp2-float-a">
            <span className="pen-lp2-float-label">{t.hero.float.detected}</span>
            <span className="pen-lp2-chip"><span className="pen-lp2-av">CD</span>Chris Dyas <em>{t.hero.float.buyer}</em></span>
          </div>
          <div className="pen-lp2-float pen-lp2-float-b">
            <span className="pen-lp2-tick" />
            <span>
              <span className="pen-lp2-float-strong">{t.hero.float.todo}</span>
              <span className="pen-lp2-float-meta">{t.hero.float.due}</span>
            </span>
          </div>
          <div className="pen-lp2-float pen-lp2-float-c">
            <span className="pen-lp2-float-label"><Icon name="mail" size={13} /> {t.hero.float.draft}</span>
            <span className="pen-lp2-float-strong">{t.hero.float.draftTitle}</span>
            <span className="pen-lp2-mini-btn">{t.hero.float.openGmail}</span>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/** The Latin American hero: WhatsApp on a phone, the pen beside it. */
function HeroChat() {
  const { t, market } = useL()
  const cta = useMainCta()
  return (
    <section className="pen-lp-wrap pen-lp2-hero">
      <div className="pen-lp2-hero-copy">
        <Reveal>
          <h1 className="pen-lp-h1 pen-lp2-h1">
            {t.hero.h1a} <span className="pen-lp-em">{t.hero.h1b}</span>
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="pen-lp2-lede">{t.hero.lede}</p>
        </Reveal>
        <Reveal delay={0.14}>
          <div className="pen-lp2-ctas">
            <Link href={cta.href('hero')} className="pen-lp-btn pen-lp-btn-accent pen-lp2-btn-lg">{cta.label}</Link>
            <a href="#features" className="pen-lp-btn pen-lp2-btn-lg">{t.cta.seeWhat}</a>
          </div>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="pen-lp2-offer">{offerLine(t, market)}</p>
          <NoPenLine />
        </Reveal>
      </div>

      <Reveal delay={0.1} className="pen-lp2-stage pen-lp2-stage-chat">
        <div className="pen-lp2-chatstage" aria-hidden>
          <div className="pen-lp2-halo" />
          <PhoneChat lang={market.lang} />
          <PenArt id="hero-pen-chat" className="pen-lp2-chat-pen" />
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------- audience */

function Audience() {
  const { t } = useL()
  const [active, setActive] = useState(0)
  const roles = t.audience.roles
  return (
    <section className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{t.audience.h2}</h2>
        <p className="pen-lp2-sub">{t.audience.sub}</p>
      </Reveal>
      <Reveal delay={0.08}>
        <Segmented items={roles.map((r) => ({ long: r.tab, short: r.short }))} active={active} onChange={setActive} label={t.audience.aria} />
      </Reveal>
      <Reveal delay={0.14}>
        <ChatDemo role={roles[active]} />
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
function ChatDemo({ role }: { role: RoleDemo }) {
  const { t } = useL()
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
    const tm = window.setInterval(() => {
      if (qi < q.length) {
        qi = Math.min(q.length, qi + 2)
        setStep({ q: qi, a: 0 })
      } else if (ai < words.length) {
        ai += 1
        setStep({ q: q.length, a: ai })
      } else window.clearInterval(tm)
    }, 34)
    return () => window.clearInterval(tm)
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
        <span>{t.audience.ask}</span>
        <span className="pen-lp2-chatbar-n">{t.audience.found(role.sources.length)}</span>
      </div>
      <div className="pen-lp2-chatbody">
        <p className="pen-lp2-chatq">
          {typedQ.split(/(@[\p{Lu}][\p{Ll}]+)/gu).map((p, i) =>
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
function Segmented({ items, active, onChange, label }: { items: { long: string; short: string }[]; active: number; onChange: (i: number) => void; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const measure = useCallback(() => {
    const track = trackRef.current
    const btn = btnRefs.current[active]
    if (!track || !btn) return
    const tr = track.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    setPill({ x: b.left - tr.left, w: b.width })
  }, [active])
  useLayoutEffect(measure, [measure])
  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', onResize)
  }, [measure])
  return (
    <div className="pen-seg pen-lp2-seg" role="tablist" aria-label={label} ref={trackRef}>
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
  const { t, latam } = useL()
  const f = t.features
  return (
    <section id="features" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{f.h2}</h2>
        <p className="pen-lp2-sub">{f.sub}</p>
      </Reveal>

      <div className="pen-lp2-bento">
        {/* 1. The note */}
        <Reveal delay={0.04} className="pen-lp2-b pen-lp2-b-note">
          <article className="pen-lp2-card">
            <FeatureHead icon="sparkle" title={f.note.title} />
            <p className="pen-lp2-fcopy">{f.note.copy}</p>
            <div className="pen-lp2-demo">
              <div className="pen-lp2-demo-label">{f.note.summaryLabel}</div>
              <p className="pen-lp2-demo-text">{f.note.summary}</p>
              <div className="pen-lp2-demo-label" style={{ marginTop: 16 }}>{f.note.actionsLabel}</div>
              <ul className="pen-lp2-todos">
                <li><span className="pen-lp2-tick pen-lp2-tick-on" /><s>{f.note.actions[0]}</s></li>
                <li><span className="pen-lp2-tick" />{f.note.actions[1]} <em>{f.note.priority}</em></li>
                <li><span className="pen-lp2-tick" />{f.note.actions[2]}</li>
              </ul>
              <div className="pen-lp2-demo-label" style={{ marginTop: 18 }}>{f.note.decidedLabel}</div>
              <p className="pen-lp2-demo-small">{f.note.decided}</p>
              <div className="pen-lp2-demo-label" style={{ marginTop: 18 }}>{f.note.transcriptLabel}</div>
              <div className="pen-lp2-turns">
                {f.note.turns.map(([who, said]) => (
                  <p key={who + said}><span className="pen-lp2-who">{who}</span>{said}</p>
                ))}
              </div>
            </div>
          </article>
        </Reveal>

        {/* 2. People */}
        <Reveal delay={0.08} className="pen-lp2-b pen-lp2-b-people">
          <article className="pen-lp2-card">
            <FeatureHead icon="people" title={f.people.title} />
            <p className="pen-lp2-fcopy">{f.people.copy}</p>
            <div className="pen-lp2-demo">
              <div className="pen-lp2-person">
                <span className="pen-lp2-av pen-lp2-av-lg">{f.people.name.split(' ').map((w) => w[0]).join('')}</span>
                <span>
                  <span className="pen-lp2-demo-strong">{f.people.name}</span>
                  <span className="pen-lp2-demo-meta">{f.people.meta}</span>
                </span>
              </div>
              <p className="pen-lp2-demo-small">{f.people.about}</p>
              <div className="pen-lp2-detected">
                <span className="pen-lp2-demo-meta">{f.people.detected}</span>
                <span className="pen-lp2-pill">{f.people.pills[0]}</span>
                <span className="pen-lp2-pill">{f.people.pills[1]}</span>
              </div>
            </div>
          </article>
        </Reveal>

        {/* 3. Jot and enhance */}
        <Reveal delay={0.12} className="pen-lp2-b pen-lp2-b-ask">
          <article className="pen-lp2-card">
            <FeatureHead icon="pen" title={f.jot.title} />
            <p className="pen-lp2-fcopy">{f.jot.copy}</p>
            <div className="pen-lp2-demo">
              <p className="pen-lp2-jot">{f.jot.jot}</p>
              <p className="pen-lp2-enh">{f.jot.enh}</p>
              <span className="pen-lp2-mini-btn pen-lp2-mini-btn-on"><Icon name="sparkle" size={13} />{f.jot.button}</span>
            </div>
          </article>
        </Reveal>

        {/* 4. Email */}
        <Reveal delay={0.06} className="pen-lp2-b pen-lp2-b-email">
          <article className="pen-lp2-card">
            <FeatureHead icon="mail" title={f.email.title} />
            <p className="pen-lp2-fcopy">{f.email.copy}</p>
            <div className="pen-lp2-demo">
              <div className="pen-lp2-mail-row"><span>{f.email.to}</span>tom.henderson@gmail.com</div>
              <div className="pen-lp2-mail-row"><span>{f.email.subjectLabel}</span>{f.email.subject}</div>
              <p className="pen-lp2-demo-small" style={{ marginTop: 10 }}>{f.email.body}</p>
              <div className="pen-lp2-mail-btns">
                <span className="pen-lp2-mini-btn pen-lp2-mini-btn-on">{f.email.gmail}</span>
                <span className="pen-lp2-mini-btn">{f.email.outlook}</span>
              </div>
            </div>
          </article>
        </Reveal>

        {/* 5. Nearly missed */}
        <Reveal delay={0.1} className="pen-lp2-b pen-lp2-b-missed">
          <article className="pen-lp2-card">
            <FeatureHead icon="alert" title={f.missed.title} tone="warn" />
            <p className="pen-lp2-fcopy">{f.missed.copy}</p>
            <ul className="pen-lp2-missed">
              {f.missed.items.map(([strong, meta]) => (
                <li key={strong}>
                  <span className="pen-lp2-dot" />
                  <span>
                    <span className="pen-lp2-demo-strong">{strong}</span>
                    <span className="pen-lp2-demo-meta">{meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </Reveal>

        {/* 6. On top of it */}
        <Reveal delay={0.14} className="pen-lp2-b pen-lp2-b-home">
          <article className="pen-lp2-card">
            <FeatureHead icon="checklist" title={f.home.title} />
            <p className="pen-lp2-fcopy">{f.home.copy}</p>
            <div className="pen-lp2-stats">
              <div><span className="pen-lp2-stat pen-lp2-stat-warn">12</span><span>{f.home.stats[0]}</span></div>
              <div><span className="pen-lp2-stat">4</span><span>{f.home.stats[1]}</span></div>
              <div><span className="pen-lp2-stat">27</span><span>{f.home.stats[2]}</span></div>
            </div>
            <ul className="pen-lp2-todos pen-lp2-todos-sm">
              <li><span className="pen-lp2-tick" />{f.home.todos[0]}</li>
              <li><span className="pen-lp2-tick" />{f.home.todos[1]}</li>
            </ul>
          </article>
        </Reveal>

        {/* 7. WhatsApp. The Latin American hero already is this card, so it only appears here
            on the US page. */}
        {!latam && (
          <Reveal delay={0.06} className="pen-lp2-b pen-lp2-b-wa">
            <article className="pen-lp2-card pen-lp2-wa">
              <div className="pen-lp2-wa-copy">
                <FeatureHead icon="chat" title={t.wa.title} />
                <p className="pen-lp2-fcopy">{t.wa.body}</p>
              </div>
              <div className="pen-lp2-wa-chat" aria-hidden="true">
                <div className="pen-lp2-bub pen-lp2-bub-me"><Icon name="wave" size={14} />{t.wa.me1}</div>
                <div className="pen-lp2-bub">
                  <strong>{t.wa.replyTitle}</strong> (38 min)
                  <br />
                  {t.wa.reply}
                </div>
                <div className="pen-lp2-bub pen-lp2-bub-me">{t.wa.me2}</div>
              </div>
            </article>
          </Reveal>
        )}

        {/* 8. Private */}
        <Reveal delay={0.08} className="pen-lp2-b pen-lp2-b-private">
          <article className="pen-lp2-card pen-lp2-card-ink">
            <FeatureHead icon="lock" title={f.privateTitle} tone="ink" />
            <ul className="pen-lp2-private">
              {f.privateItems.map((it) => (
                <li key={it}><Icon name="check" size={16} />{it}</li>
              ))}
            </ul>
          </article>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ how it works */

const STEP_ICONS: IconName[] = ['mic', 'usb', 'sparkle']
const STEP_ICONS_CHAT: IconName[] = ['mic', 'chat', 'sparkle']

function HowItWorks() {
  const { t, latam } = useL()
  const icons = latam ? STEP_ICONS_CHAT : STEP_ICONS
  return (
    <section id="how" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{t.how.h2}</h2>
      </Reveal>
      <div className="pen-lp2-how">
        <div className="pen-lp2-steps">
          {t.how.steps.map((s, i) => (
            <Reveal key={s.h} delay={i * 0.07}>
              <div className="pen-lp2-step">
                <span className="pen-lp2-step-n">{i + 1}</span>
                <span className="pen-lp2-ficon"><Icon name={icons[i]} size={18} /></span>
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

const SPEC_ICONS: IconName[] = ['mic', 'usb', 'wave', 'clock', 'save', 'pen']

function ThePen() {
  const { t, latam } = useL()
  return (
    <section id="pen" className="pen-lp2-pen">
      <div className="pen-lp-wrap">
        <div className="pen-lp2-pen-top">
          <Reveal>
            {latam && <span className="pen-lp2-soon">{t.pen.soon}</span>}
            <h2 className="pen-lp-h2 pen-lp2-h2">{t.pen.h2}</h2>
            <p className="pen-lp2-sub">{t.pen.sub}</p>
            {latam && <p className="pen-lp2-sub pen-lp2-soon-body">{t.pen.soonBody}</p>}
          </Reveal>
          <Reveal delay={0.08} className="pen-lp2-pen-art">
            <div className="pen-lp2-halo pen-lp2-halo-wide" />
            <PenArt id="spec-pen" className="pen-lp2-spec-pen" />
            <figure className="pen-lp2-open">
              <PenArt id="open-pen" variant="open" className="pen-lp2-open-pen" />
              <figcaption>{t.pen.open}</figcaption>
            </figure>
          </Reveal>
        </div>

        <div className="pen-lp2-bignums">
          <Reveal delay={0.04}>
            <div className="pen-lp2-card pen-lp2-bignum">
              <span className="pen-lp2-num">72<small>GB</small></span>
              <span className="pen-lp2-num-k">{t.pen.storageK}</span>
              <span className="pen-lp2-num-v">{t.pen.storageV}</span>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="pen-lp2-card pen-lp2-bignum">
              <span className="pen-lp2-num">35<small>hrs</small></span>
              <span className="pen-lp2-num-k">{t.pen.batteryK}</span>
              <span className="pen-lp2-num-v">{t.pen.batteryV}</span>
            </div>
          </Reveal>
        </div>

        <div className="pen-lp2-specs">
          {t.pen.specs.map((s, i) => (
            <Reveal key={s.k} delay={0.04 + i * 0.04}>
              <div className="pen-lp2-card pen-lp2-spec">
                <span className="pen-lp2-ficon"><Icon name={SPEC_ICONS[i]} size={18} /></span>
                <h3 className="pen-lp2-ftitle">{s.k}</h3>
                <p className="pen-lp2-fcopy">{s.v}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="pen-lp2-inbox">{t.pen.inBox}</p>
        </Reveal>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- pricing */

function PlanCta({ href, children, variant }: { href: string; children: React.ReactNode; variant: 'ghost' | 'accent' }) {
  return (
    <Link href={href} className={`pen-lp-btn ${variant === 'accent' ? 'pen-lp-btn-accent' : 'pen-lp-btn-ghost'} mt-auto w-full justify-center`}>
      {children}
    </Link>
  )
}

type PlanCard = {
  name: string
  price: string
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
            <span className="pen-display pen-od-paper pen-t-price">{p.price}</span>
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

function penPlans(t: Copy, market: Market): PlanCard[] {
  const P = t.pricing
  return [
    {
      name: P.monthly,
      price: money(PLAN_MONTHLY_USD, 'usd'),
      per: P.perMonth,
      line: P.penLineMonthly(TRIAL_DAYS_POSTED, money(PEN_USD, 'usd')),
      trade: P.tradeMonthlyPen,
      href: signup('plan=monthly&offer=posted-pen&from=pricing', market),
      cta: t.cta.trialPen(TRIAL_DAYS_POSTED),
    },
    {
      name: P.halfyear,
      price: money(PLAN_HALFYEAR_USD, 'usd'),
      per: P.perHalf,
      line: P.penLineIncluded(money(PLAN_HALFYEAR_USD / 6, 'usd')),
      trade: P.tradeHalfPen,
      href: signup('plan=halfyear&offer=posted-pen&from=pricing', market),
      cta: t.cta.halfyear,
      ribbon: P.ribbonPen,
    },
    {
      name: P.yearly,
      price: money(PLAN_ANNUAL_USD, 'usd'),
      per: P.perYear,
      line: P.penLineIncluded(money(Math.round(PLAN_ANNUAL_USD / 12), 'usd')),
      trade: P.tradeYearPen,
      href: signup('plan=annual&offer=posted-pen&from=pricing', market),
      cta: t.cta.yearly,
      ribbon: P.ribbonBest,
      pro: true,
    },
  ]
}

function ownPlans(t: Copy, market: Market): PlanCard[] {
  const P = t.pricing
  const half = market.currency === 'usd' ? SOFTWARE_HALFYEAR_USD : LOCAL_PRICES[market.currency].halfyear
  return [
    {
      name: P.monthly,
      price: ownPrice(market, 'monthly'),
      per: P.perMonth,
      line: P.ownLineMonthly(TRIAL_DAYS),
      trade: P.tradeOwnMonthly,
      href: signup('plan=monthly&offer=own-recorder&from=pricing', market),
      cta: t.cta.trialOwn(TRIAL_DAYS),
      pro: market.lang !== 'en',
    },
    {
      name: P.halfyear,
      price: ownPrice(market, 'halfyear'),
      per: P.perHalf,
      line: P.ownLineHalf(money(market.currency === 'clp' ? Math.round(half / 6 / 10) * 10 : Math.round((half / 6) * 100) / 100, market.currency)),
      trade: P.tradeOwnHalf,
      href: signup('plan=halfyear&offer=own-recorder&from=pricing', market),
      cta: t.cta.halfyear,
    },
  ]
}

/** Latin America: the pen tab is a single "coming soon" card with a notify-me. */
function PenSoon() {
  const { t, market } = useL()
  return (
    <Reveal>
      <article className="pen-lp-plan pen-lp-plan-soon">
        <header>
          <h3 className="pen-mono pen-t-label uppercase tracking-[.14em] pen-od-dim">{t.pen.soon}</h3>
          <p className="pen-display pen-od-paper pen-lp-soon-h">{t.pricing.soonTitle}</p>
        </header>
        <p className="pen-lp-plan-trade">{t.pricing.soonBody}</p>
        <PlanCta href={signup('offer=posted-pen&waitlist=pen&from=pricing', market)} variant="ghost">{t.pricing.soonCta}</PlanCta>
      </article>
    </Reveal>
  )
}

function Pricing() {
  const { t, market, latam } = useL()
  // The US leads with the pen; Latin America with the phone, because the pen can't ship yet.
  const [group, setGroup] = useState<'pen' | 'own'>(latam ? 'own' : 'pen')
  // "No pen?" in the hero links to #plans-own: open that tab and scroll to it.
  useEffect(() => {
    const open = () => {
      if (window.location.hash === '#plans-own') setGroup('own')
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  const P = t.pricing
  return (
    <section id="pricing" className="pen-lp-dark pen-lp2-pricing">
      <div className="pen-lp-wrap py-24 sm:py-28">
        <Reveal>
          <h2 className="pen-lp-h2 pen-lp-h2-tight pen-od-paper">{P.h2}</h2>
          <p className="pen-od-soft mt-5 pen-t-lede-sm text-balance">{P.sub}</p>
        </Reveal>

        {/* One group at a time: five cards at once read as a menu. */}
        <div id="plans-own" className="pen-lp-tabs" role="tablist" aria-label={P.tabAria}>
          {(latam ? (['own', 'pen'] as const) : (['pen', 'own'] as const)).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              id={`plans-tab-${g}`}
              aria-controls="plans-panel"
              aria-selected={group === g}
              className="pen-lp-tab"
              data-on={group === g}
              onClick={() => setGroup(g)}
            >
              {g === 'pen' ? P.tabPen : P.tabOwn}
            </button>
          ))}
        </div>

        <div id="plans-panel" role="tabpanel" aria-labelledby={`plans-tab-${group}`} className="pen-lp-plangroup mt-8">
          {group === 'own' && <p className="pen-lp-plangroup-sub pen-od-dim">{P.ownSub}</p>}
          {group === 'pen' && latam ? (
            <div className="pen-lp-plans pen-lp-plans-1">
              <PenSoon />
            </div>
          ) : (
            <div className={`pen-lp-plans ${group === 'pen' ? 'pen-lp-plans-3' : 'pen-lp-plans-2'}`}>
              {(group === 'pen' ? penPlans(t, market) : ownPlans(t, market)).map((p, i) => (
                <PlanCardView key={`${group}-${p.name}`} p={p} delay={i * 0.05} />
              ))}
            </div>
          )}
        </div>

        <Reveal delay={0.24}>
          <div className="pen-lp-both">
            <p className="pen-t-small pen-od-dim">{P.includedTitle}</p>
            <ul className="pen-lp-bothlist">
              {P.included.map((it) => (
                <li key={it}>
                  <svg viewBox="0 0 16 16" aria-hidden>
                    <path d="M3 8.4 L6.2 11.6 L13 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{it}</span>
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
  const { t, latam } = useL()
  const cta = useMainCta()
  return (
    <section className="pen-lp-wrap pen-lp2-close">
      <Reveal>
        <div className="pen-lp2-close-card">
          <PenArt id="close-pen" className="pen-lp2-close-pen" />
          <h2 className="pen-lp-h2 pen-lp2-h2">{t.closing.h2}</h2>
          <p className="pen-lp2-sub">{t.closing.sub(latam ? TRIAL_DAYS : TRIAL_DAYS_POSTED)}</p>
          <Link href={cta.href('closing')} className="pen-lp-btn pen-lp-btn-accent pen-lp2-btn-lg">{cta.label}</Link>
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------------ footer */

const LANGS: { code: 'en' | 'es' | 'pt'; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
]

function Footer() {
  const { t, market } = useL()
  return (
    <footer className="pen-lp-foot">
      <div className="pen-lp-wrap flex flex-wrap items-center justify-between gap-5 py-9">
        <div className="flex items-center gap-3">
          <Image src="/juno_mark.png" alt="Juno" width={24} height={24} className="pen-mark" />
          <span className="pen-mono pen-t-label" style={{ color: 'var(--faint)' }}>&copy; {new Date().getFullYear()} Juno Pen</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a href="#features" className="pen-lp-footlink">{t.nav.features}</a>
          <a href="#pen" className="pen-lp-footlink">{t.nav.pen}</a>
          <a href="#pricing" className="pen-lp-footlink">{t.nav.pricing}</a>
          <Link href="/privacy" className="pen-lp-footlink">{t.footer.privacy}</Link>
          <Link href="/terms" className="pen-lp-footlink">{t.footer.terms}</Link>
          <Link href={SIGN_IN} className="pen-lp-footlink">{t.nav.signIn}</Link>
        </nav>
      </div>
      <div className="pen-lp-wrap flex flex-wrap items-end justify-between gap-6 pb-10">
        <div className="grid gap-2">
          <p className="pen-mono max-w-[70ch] pen-t-label leading-[1.8]" style={{ color: 'var(--faint)' }}>{t.footer.consent}</p>
          <p className="pen-mono max-w-[70ch] pen-t-label leading-[1.8]" style={{ color: 'var(--faint)' }}>{t.footer.trademarks}</p>
        </div>
        {/* Anyone can switch: a Chilean in San Francisco, or a visitor on a VPN. The choice is
            remembered by the site (see proxy.ts). */}
        <nav className="pen-lp-langs" aria-label={t.switcher}>
          {LANGS.map((l) => (
            <a key={l.code} href={`?m=${l.code}`} className="pen-lp-lang" data-on={market.lang === l.code} aria-current={market.lang === l.code ? 'true' : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
