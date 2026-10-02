'use client'

import Link from 'next/link'
import Image from 'next/image'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { CSSProperties } from 'react'
import PenSequence from './PenSequence'
import PenArt from './PenArt'
import PhoneChat from './PhoneChat'
import PenFilm from './film/PenFilm'
import HowToPlayer from './how-to/HowToPlayer'
import type { HowToKitKey } from './film/HowToScene'
import Icon, { type IconName } from './Icon'
import { PLAN_MONTHLY_USD, PLAN_HALFYEAR_USD, PLAN_ANNUAL_USD, PEN_USD, SOFTWARE_MONTHLY_USD, SOFTWARE_HALFYEAR_USD, TRIAL_DAYS, TRIAL_DAYS_POSTED } from '@/lib/pen/plan'
import { COPY, LOCAL_PRICES, money, type Copy, type Market, type RoleDemo } from './landing-copy'
import { AUD_PARAM, KITS, PLUS, type Kit, type Plus } from './landing-audiences'

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

/** `kit` is the chosen audience's examples; every section that shows an example reads it. */
type Ctx = { t: Copy; p: Plus; kits: Kit[]; kit: Kit; aud: number; setAud: (i: number) => void; market: Market; latam: boolean }
const L = createContext<Ctx>({ t: COPY.en, p: PLUS.en, kits: KITS.en, kit: KITS.en[0], aud: 0, setAud: () => {}, market: { lang: 'en', currency: 'usd' }, latam: false })
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

const INVITED = {
  en: (n: string) => [`${n} invited you to Juno Pen.`, 'Sign up through this page and your first month is free.'],
  es: (n: string) => [`${n} te invitó a Juno Pen.`, 'Regístrate desde esta página y tu primer mes es gratis.'],
  pt: (n: string) => [`${n} convidou você para o Juno Pen.`, 'Cadastre-se por esta página e seu primeiro mês é grátis.'],
} as const

export default function Landing({ market = { lang: 'en', currency: 'usd' }, audience = null, invitedBy = null }: { market?: Market; audience?: string | null; invitedBy?: string | null }) {
  const t = COPY[market.lang]
  const p = PLUS[market.lang]
  const kits = KITS[market.lang]
  const latam = market.lang !== 'en'
  // Chosen on the server from ?for=, so the first paint already shows the right examples.
  const [aud, setAudState] = useState(() => {
    const key = AUD_PARAM[(audience ?? '').toLowerCase()]
    return Math.max(0, key ? kits.findIndex((k) => k.key === key) : 0)
  })
  // The root layout says lang="en" for the whole site; the page it actually shows may not be.
  useEffect(() => {
    document.documentElement.lang = market.lang === 'pt' ? 'pt-BR' : market.lang
  }, [market.lang])
  // Picking a tab puts it in the URL, so a shared link opens on the same examples.
  const setAud = useCallback(
    (i: number) => {
      setAudState(i)
      const u = new URL(window.location.href)
      u.searchParams.set('for', kits[i].key)
      window.history.replaceState(null, '', u.toString())
    },
    [kits],
  )
  return (
    <L.Provider value={{ t, p, kits, kit: kits[aud], aud, setAud, market, latam }}>
      <div className="pen-lp pen-lp2">
        {invitedBy && (
          <div className="pen-invited" role="status">
            <strong>{INVITED[market.lang](invitedBy)[0]}</strong> <span>{INVITED[market.lang](invitedBy)[1]}</span>
          </div>
        )}
        <Nav />
        {latam ? <HeroChat /> : <Hero />}
        <Film />
        <Audience />
        <HowItWorks />
        <WhatsAppDemo />
        <TodayDemo />
        <Features />
        <Privacy />
        <ThePen />
        <Pricing />
        <Faq />
        <Closing />
        <Footer />
        <StickyCta />
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

/** Headline, lede and buttons: the same in every market; the stage beside it differs. */
function HeroCopy() {
  const { p } = useL()
  const cta = useMainCta()
  return (
    <div className="pen-lp2-hero-copy">
      <Reveal>
        <h1 className="pen-lp-h1 pen-lp2-h1">
          {p.hero.h1a} <span className="pen-lp-em">{p.hero.h1b}</span>
        </h1>
      </Reveal>
      <Reveal delay={0.08}>
        <p className="pen-lp2-lede">{p.hero.lede}</p>
      </Reveal>
      <Reveal delay={0.14}>
        <div className="pen-lp2-ctas">
          <Link href={cta.href('hero')} className="pen-lp-btn pen-lp-btn-accent pen-lp2-btn-lg">{cta.label}</Link>
          <a href="#whatsapp" className="pen-lp-btn pen-lp2-btn-lg">{p.hero.seeWa}</a>
        </div>
      </Reveal>
      <Reveal delay={0.2}>
        <NoPenLine />
      </Reveal>
    </div>
  )
}

function Hero() {
  const { kit, p } = useL()
  const h = kit.hero
  return (
    <section className="pen-lp-wrap pen-lp2-hero" data-hero>
      <HeroCopy />
      <Reveal delay={0.1} className="pen-lp2-stage">
        <div className="pen-lp2-stage-inner" aria-hidden>
          <div className="pen-lp2-halo" />
          <PenArt id="hero-pen" className="pen-lp2-hero-pen" />

          {/* What comes out of it, for the chosen audience: who was there, a to-do, a draft. */}
          <div className="pen-lp2-float pen-lp2-float-a" key={`a-${kit.key}`}>
            <span className="pen-lp2-float-label">{p.feat.people}</span>
            <span className="pen-lp2-chip"><span className="pen-lp2-av">{h.initials}</span>{h.who} <em>{h.role}</em></span>
          </div>
          <div className="pen-lp2-float pen-lp2-float-b" key={`b-${kit.key}`}>
            <span className="pen-lp2-tick" />
            <span>
              <span className="pen-lp2-float-strong">{h.todo}</span>
              <span className="pen-lp2-float-meta">{h.due}</span>
            </span>
          </div>
          <div className="pen-lp2-float pen-lp2-float-c" key={`c-${kit.key}`}>
            <span className="pen-lp2-float-label"><Icon name="mail" size={13} /> {p.hero.draft}</span>
            <span className="pen-lp2-float-strong">{h.draftTitle}</span>
            <span className="pen-lp2-mini-btn">{p.feat.sendBtn}</span>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/** The Latin American hero: WhatsApp on a phone, the pen beside it. */
function HeroChat() {
  const { market } = useL()
  return (
    <section className="pen-lp-wrap pen-lp2-hero" data-hero>
      <HeroCopy />
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

/* ------------------------------------------------------------------ film */

/** The film. In English, the how-to (film/HowToScene.tsx) for the chosen audience: the pen
 *  plugged in through to WhatsApp, under a minute; picking another audience starts its story
 *  from the top. Spanish and Portuguese keep the fifteen-second film (film/PenFilmScene.tsx). */
function Film() {
  const { p, kit, market } = useL()
  return (
    <section id="film" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{p.film.h2}</h2>
        <p className="pen-lp2-sub">{p.film.sub}</p>
      </Reveal>
      <Reveal delay={0.08}>
        {market.lang === 'en' ? (
          <HowToPlayer autoplay="visible" loop kit={kit.key as HowToKitKey} key={kit.key} />
        ) : (
          <PenFilm kit={kit} plus={p} labels={{ pause: p.film.pause, play: p.film.play }} />
        )}
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------- audience */

function Audience() {
  const { t, p, kits, kit, aud, setAud } = useL()
  return (
    <section id="who" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{p.aud.h2}</h2>
        <p className="pen-lp2-sub">{p.aud.sub}</p>
      </Reveal>
      <Reveal delay={0.08}>
        <Segmented items={kits.map((k) => ({ long: k.tab, short: k.short }))} active={aud} onChange={setAud} label={t.audience.aria} />
        <p className="pen-lp2-promise" aria-live="polite">{kit.promise}</p>
      </Reveal>
      <Reveal delay={0.14}>
        <ChatDemo role={kit.demo} />
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
  const { p, kit } = useL()
  const f = p.feat
  return (
    <section id="features" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{f.h2}</h2>
        <p className="pen-lp2-sub">{f.sub}</p>
      </Reveal>

      <div className="pen-lp2-trio">
        {/* 1. The note, with who was there */}
        <Reveal delay={0.04} className="pen-lp2-trio-note">
          <article className="pen-lp2-card" key={kit.key}>
            <FeatureHead icon="sparkle" title={f.noteTitle} />
            <p className="pen-lp2-fcopy">{f.noteCopy}</p>
            <div className="pen-lp2-demo">
              <p className="pen-lp2-demo-strong">{kit.note.title}</p>
              <div className="pen-lp2-demo-label" style={{ marginTop: 12 }}>{f.summary}</div>
              <p className="pen-lp2-demo-text">{kit.note.summary}</p>
              <div className="pen-lp2-demo-label" style={{ marginTop: 16 }}>{f.actions}</div>
              <ul className="pen-lp2-todos">
                <li><span className="pen-lp2-tick pen-lp2-tick-on" /><s>{kit.note.actions[0]}</s></li>
                <li><span className="pen-lp2-tick" />{kit.note.actions[1]}</li>
                <li><span className="pen-lp2-tick" />{kit.note.actions[2]}</li>
              </ul>
              <div className="pen-lp2-demo-label" style={{ marginTop: 16 }}>{f.people}</div>
              <div className="pen-lp2-detected">
                {kit.note.people.map(([name, role]) => (
                  <span key={name} className="pen-lp2-pill">{name} · {role}</span>
                ))}
              </div>
            </div>
          </article>
        </Reveal>

        {/* 2. Nearly missed */}
        <Reveal delay={0.08} className="pen-lp2-trio-missed">
          <article className="pen-lp2-card" key={kit.key}>
            <FeatureHead icon="alert" title={f.missedTitle} tone="warn" />
            <p className="pen-lp2-fcopy">{f.missedCopy}</p>
            <ul className="pen-lp2-missed">
              {kit.missed.map(([strong, meta]) => (
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

        {/* 3. The follow-up */}
        <Reveal delay={0.12} className="pen-lp2-trio-email">
          <article className="pen-lp2-card" key={kit.key}>
            <FeatureHead icon="mail" title={f.emailTitle} />
            <p className="pen-lp2-fcopy">{f.emailCopy}</p>
            <div className="pen-lp2-demo">
              <div className="pen-lp2-mail-row"><span>{f.to}</span>{kit.email.to}</div>
              <div className="pen-lp2-mail-row"><span>{f.subject}</span>{kit.email.subject}</div>
              <p className="pen-lp2-demo-small" style={{ marginTop: 10 }}>{kit.email.body}</p>
              <div className="pen-lp2-mail-btns">
                <span className="pen-lp2-mini-btn pen-lp2-mini-btn-on">{f.sendBtn}</span>
                <span className="pen-lp2-mini-btn">{f.ownBtn}</span>
              </div>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ how it works */

const STEP_ICONS: IconName[] = ['mic', 'chat', 'sparkle']

function HowItWorks() {
  const { p, kit } = useL()
  return (
    <section id="how" className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{p.how.h2}</h2>
      </Reveal>
      <div className="pen-lp2-how">
        <div className="pen-lp2-steps">
          {p.how.steps.map((st, i) => (
            <Reveal key={st.h} delay={i * 0.07}>
              <div className="pen-lp2-step">
                <span className="pen-lp2-step-n">{i + 1}</span>
                <span className="pen-lp2-ficon"><Icon name={STEP_ICONS[i]} size={18} /></span>
                <span>
                  <h3 className="pen-lp2-ftitle">{st.h}</h3>
                  <p className="pen-lp2-fcopy">{st.p}</p>
                </span>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1} className="pen-lp2-seq">
          <div className="pen-seq-wrap">
            {/* Keyed by audience, so switching replays the recording turning into a note. */}
            <PenSequence key={kit.key} script={{ ...kit.seq, labels: p.how.labels }} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- whatsapp */

/** WhatsApp's *bold* and line breaks, as the real chat renders them. */
function WaText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} className="pen-ph-line">
          {line.split(/(\*[^*]+\*)/g).map((part, j) =>
            /^\*[^*]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : <span key={j}>{part}</span>,
          )}
          {line === '' ? ' ' : null}
        </span>
      ))}
    </>
  )
}

/**
 * The assistant, doing things: a recording in, the briefing back, then a question, a draft,
 * "send it" and a reminder. Messages appear one by one when the phone scrolls into view, and
 * the chat is bottom-anchored so older ones scroll off the top like the real thing. Everything
 * is drawn from the start for anyone without JS or with reduced motion.
 */
function WhatsAppDemo() {
  const { p, kit } = useL()
  const total = kit.wa.msgs.length + 1
  const [shown, setShown] = useState(total)
  const box = useRef<HTMLDivElement>(null)
  const seen = useRef(false)

  const play = useCallback(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let n = 1
    setShown(1)
    const tm = window.setInterval(() => {
      n += 1
      setShown(n)
      if (n >= total) window.clearInterval(tm)
    }, 900)
    return () => window.clearInterval(tm)
  }, [total])

  // Replays when the audience changes, once it has been seen.
  useEffect(() => {
    if (!seen.current) return
    return play()
  }, [kit.key, play])

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
    }, { threshold: 0.35 })
    io.observe(el)
    return () => {
      io.disconnect()
      stop?.()
    }
  }, [play])

  return (
    <section id="whatsapp" className="pen-lp-wrap pen-lp2-sec pen-lp2-wasec">
      <div className="pen-lp2-wasec-copy">
        <Reveal>
          <span className="pen-lp2-kicker"><Icon name="chat" size={15} /> WhatsApp</span>
          <h2 className="pen-lp-h2 pen-lp2-h2">{p.wa.h2}</h2>
          <p className="pen-lp2-sub">{p.wa.sub}</p>
        </Reveal>
      </div>
      <Reveal delay={0.08} className="pen-lp2-wasec-phone">
        <div className="pen-ph pen-ph-tall" ref={box} role="img" aria-label={p.wa.h2}>
          <div className="pen-ph-screen">
            <div className="pen-ph-island" />
            <div className="pen-ph-head">
              <span className="pen-ph-back">‹</span>
              <span className="pen-ph-av">j</span>
              <span className="pen-ph-who">
                <strong>Juno Pen</strong>
                <em>{p.wa.status}</em>
              </span>
            </div>
            <div className="pen-ph-chat pen-ph-chat-live">
              <div className="pen-ph-msg pen-ph-me pen-ph-pop">
                <span className="pen-ph-file">
                  <span className="pen-ph-fileicon">♪</span>
                  <span>
                    <strong>{kit.wa.file}</strong>
                    <em>{kit.wa.fileMeta}</em>
                  </span>
                </span>
              </div>
              {kit.wa.msgs.slice(0, Math.max(0, shown - 1)).map(([who, text], i) => (
                <div key={`${kit.key}-${i}`} className={`pen-ph-msg ${who === 'me' ? 'pen-ph-me' : 'pen-ph-them'} pen-ph-pop`}>
                  <WaText text={text} />
                </div>
              ))}
            </div>
            <div className="pen-ph-input">
              <span className="pen-ph-field" />
              <span className="pen-ph-mic">●</span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------------ today */

/** "Laura, daughter" → "L"; "Dr. Patel" → "DP": the name before any comma, two letters at most. */
function initials(who: string): string {
  return who.split(',')[0].split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

/** The top of the app's Home, for the chosen audience: what is due, and who is waiting. */
function TodayDemo() {
  const { p, kit } = useL()
  const T = p.today
  return (
    <section className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{T.h2}</h2>
        <p className="pen-lp2-sub">{T.sub}</p>
      </Reveal>
      <Reveal delay={0.08}>
        <div className="pen-lp2-today" key={kit.key}>
          <header className="pen-lp2-today-head">
            <span className="pen-lp2-ficon"><Icon name="calendar" size={18} /></span>
            <h3 className="pen-lp2-ftitle">{T.title}</h3>
            <span className="pen-lp2-today-mine">{T.mine}</span>
            <span className="pen-lp2-today-date">{T.date}</span>
          </header>
          <div className="pen-lp2-today-cols">
            <div>
              <div className="pen-lp2-demo-label">{T.due}</div>
              <ul className="pen-lp2-todos">
                {kit.today.due.map(([what, when]) => (
                  <li key={what}>
                    <span className="pen-lp2-tick" />
                    <span>
                      <span className="pen-lp2-demo-strong">{what}</span>
                      <span className="pen-lp2-demo-meta" data-late={/overdue|atrasad/i.test(when)}>{when}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="pen-lp2-demo-label">{T.waiting}</div>
              <ul className="pen-lp2-todos">
                {kit.today.waiting.map(([what, who]) => (
                  <li key={what}>
                    <span className="pen-lp2-av">{initials(who)}</span>
                    <span>
                      <span className="pen-lp2-demo-strong">{what}</span>
                      <span className="pen-lp2-demo-meta">{who}</span>
                    </span>
                    <Icon name="mail" size={15} className="pen-lp2-today-mail" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ---------------------------------------------------------------- privacy */

function Privacy() {
  const { p } = useL()
  const P = p.priv
  return (
    <section className="pen-lp-wrap pen-lp2-sec">
      <Reveal>
        <div className="pen-lp2-card pen-lp2-card-ink pen-lp2-privsec">
          <div>
            <FeatureHead icon="lock" title={P.h2} tone="ink" />
            <p className="pen-lp2-privsec-sub">{P.sub}</p>
            <ul className="pen-lp2-private">
              {P.items.map((it) => (
                <li key={it}><Icon name="check" size={16} />{it}</li>
              ))}
            </ul>
          </div>
          {/* The real consent step, as WhatsApp shows it: one button, and no tap means no. */}
          <div className="pen-lp2-consent" aria-hidden>
            <p>{P.question}</p>
            <span className="pen-lp2-consent-btn">{P.agree}</span>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ---------------------------------------------------------------- the pen */

const SPEC_ICONS: IconName[] = ['mic', 'usb', 'wave', 'pen']

function ThePen() {
  const { t, p, latam } = useL()
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

        {/* Four specs in a line; the rest one tap away. Six spec cards read as a datasheet. */}
        <Reveal delay={0.08}>
          <ul className="pen-lp2-specline">
            {p.pen.specs.map((k, i) => (
              <li key={k}><Icon name={SPEC_ICONS[i]} size={16} />{k}</li>
            ))}
          </ul>
          <details className="pen-lp2-allspecs">
            <summary>{p.pen.allSpecs}</summary>
            <dl>
              {t.pen.specs.map((sp) => (
                <div key={sp.k}>
                  <dt>{sp.k}</dt>
                  <dd>{sp.v}</dd>
                </div>
              ))}
            </dl>
            <p className="pen-lp2-inbox">{t.pen.inBox}</p>
          </details>
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
      <div className="pen-lp-wrap py-16 sm:py-20">
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

/* -------------------------------------------------------------------- faq */

function Faq() {
  const { p } = useL()
  return (
    <section id="faq" className="pen-lp-wrap pen-lp2-sec pen-lp2-faq">
      <Reveal>
        <h2 className="pen-lp-h2 pen-lp2-h2">{p.faq.h2}</h2>
      </Reveal>
      <Reveal delay={0.06}>
        <div className="pen-lp2-faq-list">
          {p.faq.items.map(([q, a]) => (
            <details key={q} className="pen-lp2-faq-item">
              <summary>{q}<Icon name="plus" size={16} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

/**
 * Phones only: the trial button stays in reach once the hero has scrolled away. Pricing sits
 * about 10,000px down on a phone, which is a long way to carry the decision.
 */
function StickyCta() {
  const cta = useMainCta()
  const [on, setOn] = useState(false)
  useEffect(() => {
    const hero = document.querySelector('[data-hero]')
    const pricing = document.getElementById('pricing')
    if (!hero || !('IntersectionObserver' in window)) return
    let heroGone = false
    let atPricing = false
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroGone = !e.isIntersecting && e.boundingClientRect.top < 0
        if (e.target === pricing) atPricing = e.isIntersecting
      }
      setOn(heroGone && !atPricing)
    })
    io.observe(hero)
    if (pricing) io.observe(pricing)
    return () => io.disconnect()
  }, [])
  return (
    <div className="pen-lp2-sticky" data-on={on} aria-hidden={!on}>
      <Link href={cta.href('sticky')} className="pen-lp-btn pen-lp-btn-accent" tabIndex={on ? 0 : -1}>{cta.label}</Link>
    </div>
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
          <Link href={`/privacy${market.lang === 'en' ? '' : `?lang=${market.lang}`}`} className="pen-lp-footlink">{t.footer.privacy}</Link>
          <Link href={`/terms${market.lang === 'en' ? '' : `?lang=${market.lang}`}`} className="pen-lp-footlink">{t.footer.terms}</Link>
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
