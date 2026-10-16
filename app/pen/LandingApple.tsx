'use client'

import Link from 'next/link'
import Image from 'next/image'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import PenArt from './PenArt'
import Icon, { type IconName } from './Icon'
import HowToPlayer from './how-to/HowToPlayer'
import type { HowToKitKey } from './film/HowToScene'
import { PRICES, fmtUsd } from '@/lib/pen/prices'
import { COPY, type Copy, type Market } from './landing-copy'
import { AUD_PARAM, KITS, PLUS, PRO, type Kit, type ProLine } from './landing-audiences'
import { INVITED, SIGN_IN, ownPlans, penPlans, signup, type PlanCard } from './Landing'
import './landing-apple.css'

/** The "J" of "Juno" in Lora italic (.lpa-j), wherever a heading or eyebrow says the name. */
function jj(text: React.ReactNode): React.ReactNode {
  if (typeof text !== 'string' || !text.includes('Juno')) return text
  return text.split(/(Juno)/).map((part, i) =>
    part === 'Juno' ? <span key={i}><span className="lpa-j">J</span>uno</span> : part,
  )
}

// The landing page as a product gallery, in all three languages (Portuguese agreed Oct 12,
// English and Spanish moved onto it Oct 13): edge-to-edge tiles that alternate black and light,
// very large tight headlines, one blue action colour, and the pen as the object on the pedestal.
// The words are the shared ones: COPY (landing-copy.ts) and PLUS / KITS (landing-audiences.ts).
// Prices and links come from Landing.tsx (the previous layout, kept so a revert is one line in
// page.tsx).
//
// Market rules, as the previous page had them:
// - English (US): the pen IS sold, as a one-time add-on to either plan (no trial since 15 Oct).
//   Pricing has both tabs (software + pen / software only), and the English-only pieces stay: the
//   Notion badge and section, the how-to video, and the "No pen?" line into the own-recorder tab.
// - Spanish and Portuguese: the pen is NOT sold in Latin America yet. It is shown as the product
//   and its future, every pen section carries "coming soon" and the waitlist link, and every
//   primary button starts the software-only monthly plan.
//
// Motion: transform and opacity only. Nothing starts hidden on the server: content below the
// fold is armed after mount and rises in when it scrolls into view, so a slow connection or a
// crawler still sees the whole page. prefers-reduced-motion gets the final frame everywhere;
// the scroll scene's reduced layout is pure CSS (landing-apple.css), so server and client agree.

/**
 * The few labels this layout needs that the shared copy doesn't have. Keep this list short.
 * `notion` is the English-only Notion section, word for word as the previous page had it.
 */
const EXTRA = {
  en: {
    skip: 'Skip to content',
    how: 'How it works',
    hours: 'hrs',
    gb: 'GB',
    film: 'The how-to',
  },
  es: {
    skip: 'Saltar al contenido',
    how: 'Cómo funciona',
    hours: 'h',
    gb: 'GB',
    film: 'Cómo se usa',
  },
  pt: {
    skip: 'Pular para o conteúdo',
    how: 'Como funciona',
    hours: 'h',
    gb: 'GB',
    film: 'Como usar',
  },
} as const

const NOTION_EN = {
  badgeTag: 'New',
  badge: 'Juno now writes your meetings into Notion',
  kicker: 'New · Works with Notion',
  h2: 'Every meeting, straight into your Notion.',
  sub: 'Connect Notion once. Each recording’s notes land in your own “Juno Pen notes” table the moment they’re ready. Nothing to copy, nothing to paste.',
  points: [
    'Summary, to-dos as checkboxes and who was there, on every page',
    'Already record with Notion AI Meeting Notes? Import them, and Juno writes the to-dos and the follow-up email',
    'Included in every plan',
  ],
  crumb: 'Meetings / Juno Pen notes',
  table: 'Juno Pen notes',
  cols: ['Name', 'Date', 'People', 'To-dos'],
  today: 'Today',
  yesterday: 'Yesterday',
  weekly: ['Weekly check-in', 'Mon', 'Team'],
  summary: 'Summary',
  todos: 'To-dos',
  open: 'Open the full note in Juno →',
} as const

const LANGS: { code: 'en' | 'es' | 'pt'; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
]

const EASE = [0.16, 1, 0.3, 1] as const
const SPEC_ICONS: IconName[] = ['mic', 'usb', 'wave', 'clock', 'save', 'pen']

/* ----------------------------------------------------------------- motion helpers */

/**
 * Fade and rise into view. Anything already on screen at mount is left alone (no flash);
 * anything below the fold is hidden after mount and revealed as it arrives.
 */
function Reveal({ children, delay = 0, className, as = 'div' }: { children: React.ReactNode; delay?: number; className?: string; as?: 'div' | 'li' }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [armed, setArmed] = useState(false)
  const inView = useInView(ref, { once: true, margin: '0px 0px -8% 0px' })
  useEffect(() => {
    if (reduce) return
    const r = ref.current?.getBoundingClientRect()
    if (r && r.top > window.innerHeight) setArmed(true)
  }, [reduce])
  const hidden = armed && !inView
  const M = as === 'li' ? motion.li : motion.div
  return (
    <M
      ref={ref as never}
      className={className}
      initial={false}
      animate={hidden ? { opacity: 0, y: 32 } : { opacity: 1, y: 0 }}
      transition={hidden ? { duration: 0 } : { duration: 1, delay, ease: EASE }}
    >
      {children}
    </M>
  )
}

/**
 * How far the page has scrolled through a section, 0 to 1, as a motion value.
 * 'pin': from the section's top reaching the viewport top to its bottom reaching the viewport
 * bottom (a sticky scene). 'leave': from its top at the viewport top until it has scrolled away.
 * Measured by hand rather than with motion's scroll hook bound to a target: that hands opacity
 * to the browser's ScrollTimeline, which in Chrome tracked the whole page instead of the
 * section and left the fades out of step with the transforms.
 */
function useSectionProgress(ref: React.RefObject<HTMLElement | null>, mode: 'pin' | 'leave'): MotionValue<number> {
  const v = useMotionValue(0)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const span = mode === 'pin' ? r.height - window.innerHeight : r.height
      const p = span > 0 ? -r.top / span : 0
      v.set(Math.min(1, Math.max(0, p)))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref, mode, v])
  return v
}

/** A number that counts up once it is seen. The server renders the final value. */
function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' })
  useEffect(() => {
    if (!inView || reduce || !ref.current) return
    const el = ref.current
    const c = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (v) => { el.textContent = String(Math.round(v)) } })
    return () => c.stop()
  }, [inView, reduce, to])
  return <span ref={ref}>{to}</span>
}

/* ------------------------------------------------------------------ the market */

/**
 * What the page needs to know about where the visitor is. `sold` is whether the pen can be
 * bought there (the US only, for now); everything market-dependent below reads this.
 */
type Lpa = {
  market: Market
  t: Copy
  p: (typeof PLUS)['en']
  kits: Kit[]
  x: (typeof EXTRA)['en' | 'es' | 'pt']
  sold: boolean
  /** The one "get it" label and where it goes: signup's own choice in the US, software-only monthly elsewhere. */
  ctaLabel: string
  cta: (from: string) => string
  waitlist: (from: string) => string
}

function lpaFor(market: Market): Lpa {
  const lang = market.lang
  const t = COPY[lang]
  const sold = lang === 'en'
  return {
    market,
    t,
    p: PLUS[lang],
    kits: KITS[lang],
    x: EXTRA[lang],
    sold,
    ctaLabel: t.cta.start,
    cta: sold
      ? (from) => signup(`from=${from}`, market)
      : (from) => signup(`plan=monthly&offer=own-recorder&from=${from}`, market),
    waitlist: (from) => signup(`offer=posted-pen&waitlist=pen&from=${from}`, market),
  }
}

const LpaCtx = createContext<Lpa>(lpaFor({ lang: 'pt', currency: 'brl' }))
const useLpa = () => useContext(LpaCtx)

/** The "coming soon" line every pen section carries where the pen isn't sold. */
function SoonLine({ dark = false }: { dark?: boolean }) {
  const { t } = useLpa()
  return (
    <p className={`lpa-soonline${dark ? ' lpa-soonline-dark' : ''}`}>
      <span className="lpa-chip">{t.pen.soon}</span>
      <span>{t.pen.soonBody}</span>
    </p>
  )
}

/* ------------------------------------------------------------------------- page */

export default function LandingApple({ market, audience = null, invitedBy = null }: { market: Market; audience?: string | null; invitedBy?: string | null }) {
  const lpa = lpaFor(market)
  const { t, p, kits, x, sold, ctaLabel, cta, waitlist } = lpa
  const lang = market.lang
  const [aud, setAudState] = useState(() => {
    const key = AUD_PARAM[(audience ?? '').toLowerCase()]
    return Math.max(0, key ? kits.findIndex((k) => k.key === key) : 0)
  })
  const kit = kits[aud]
  // The root layout says lang="en" for the whole site; the page it actually shows may not be.
  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang
  }, [lang])
  const setAud = useCallback(
    (i: number) => {
      setAudState(i)
      const u = new URL(window.location.href)
      u.searchParams.set('for', kits[i].key)
      window.history.replaceState(null, '', u.toString())
    },
    [kits],
  )
  const legal = lang === 'en' ? '' : `?lang=${lang}`

  return (
    <LpaCtx.Provider value={lpa}>
    <div className="lpa">
      <a href="#lpa-main" className="lpa-skip">{x.skip}</a>
      {invitedBy && (
        <div className="lpa-invited" role="status">
          <strong>{INVITED[lang](invitedBy)[0]}</strong> <span>{INVITED[lang](invitedBy)[1]}</span>
        </div>
      )}

      {/* ---------------------------------------------------------------- nav */}
      <header className="lpa-nav">
        <div className="lpa-wrap lpa-nav-in">
          <Link href="/" className="lpa-brand" aria-label={t.nav.home}>
            <Image src="/juno_mark.png" alt="" width={26} height={26} className="lpa-mark" priority />
            <span><span className="lpa-j">J</span>uno Pen</span>
          </Link>
          <nav className="lpa-nav-links" aria-label="Juno Pen">
            <a href="#pen" className="lpa-navlink lpa-hide-sm">{t.nav.pen}</a>
            <a href="#features" className="lpa-navlink lpa-hide-sm">{t.nav.features}</a>
            {sold && <a href="#notion" className="lpa-navlink lpa-hide-md">Notion</a>}
            <a href="#pricing" className="lpa-navlink lpa-hide-sm">{t.nav.pricing}</a>
            <Link href={SIGN_IN} className="lpa-navlink">{t.nav.signIn}</Link>
            <Link href={cta('nav')} className="lpa-btn lpa-btn-sm">{ctaLabel}</Link>
          </nav>
        </div>
      </header>

      <main id="lpa-main">
        <Hero ctaLabel={ctaLabel} ctaHref={cta('hero')} waitlistHref={waitlist('hero')} />
        <PenOpens waitlistHref={waitlist('pen')} />
        <Specs waitlistHref={waitlist('specs')} />
        <SoundToNotes kitIndex={aud} setAud={setAud} />

        {/* ------------------------------------------------------ how it works */}
        <section className="lpa-tile lpa-tile-parch">
          <div className="lpa-wrap">
            <Reveal>
              <span className="lpa-eyebrow">{jj(x.how)}</span>
              <h2 className="lpa-h2">{jj(p.how.h2)}</h2>
            </Reveal>
            <ol className="lpa-steps">
              {p.how.steps.map((st, i) => (
                <Reveal key={st.h} as="li" delay={i * 0.1} className="lpa-step">
                  <span className="lpa-step-n" aria-hidden>{i + 1}</span>
                  <h3 className="lpa-h4">{jj(st.h)}</h3>
                  <p>{st.p}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {sold && <Film kit={kit} />}

        <WhatsApp kitIndex={aud} ctaLabel={ctaLabel} ctaHref={cta('whatsapp')} />
        <Assistant kitKey={kit.key} />
        <ByChat />

        {/* ---------------------------------------------------------- features */}
        <section id="features" className="lpa-tile lpa-tile-white">
          <div className="lpa-wrap">
            <Reveal className="lpa-center">
              <span className="lpa-eyebrow">{jj(t.nav.features)}</span>
              <h2 className="lpa-h2">{jj(p.feat.noteTitle)}.</h2>
              <p className="lpa-lead">{p.feat.noteCopy}</p>
            </Reveal>
            <div className="lpa-cards" key={kit.key}>
              <Reveal className="lpa-card">
                <span className="lpa-card-ic"><Icon name="sparkle" size={20} /></span>
                <h3 className="lpa-h4">{jj(kit.note.title)}</h3>
                <span className="lpa-label">{p.feat.summary}</span>
                <p className="lpa-card-p">{kit.note.summary}</p>
                <span className="lpa-label">{p.feat.actions}</span>
                <ul className="lpa-todos">
                  {kit.note.actions.map((a, i) => (
                    <li key={a} data-done={i === 0}><span className="lpa-tick"><Icon name="check" size={12} /></span><span>{a}</span></li>
                  ))}
                </ul>
                <span className="lpa-label">{p.feat.people}</span>
                <div className="lpa-people">
                  {kit.note.people.map(([name, role]) => <span key={name}>{name} · {role}</span>)}
                </div>
              </Reveal>
              <Reveal className="lpa-card" delay={0.12}>
                <span className="lpa-card-ic"><Icon name="mail" size={20} /></span>
                <h3 className="lpa-h4">{jj(p.feat.emailTitle)}</h3>
                <p className="lpa-card-p">{p.feat.emailCopy}</p>
                <div className="lpa-mail">
                  <div className="lpa-mail-row"><span>{p.feat.to}</span>{kit.email.to}</div>
                  <div className="lpa-mail-row"><span>{p.feat.subject}</span>{kit.email.subject}</div>
                  <p>{kit.email.body}</p>
                  <div className="lpa-mail-btns" aria-hidden>
                    <span className="lpa-mini lpa-mini-on">{p.feat.sendBtn}</span>
                    <span className="lpa-mini">{p.feat.ownBtn}</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {sold && <NotionSec kit={kit} ctaLabel={ctaLabel} ctaHref={cta('notion')} />}

        {/* ----------------------------------------------------------- privacy */}
        <section className="lpa-tile lpa-tile-parch">
          <div className="lpa-wrap lpa-priv">
            <Reveal>
              <span className="lpa-eyebrow">{jj(t.footer.privacy)}</span>
              <h2 className="lpa-h2">{jj(p.priv.h2)}</h2>
              <p className="lpa-lead">{p.priv.sub}</p>
              <ul className="lpa-checks">
                {p.priv.items.map((it) => <li key={it}><Icon name="check" size={16} />{it}</li>)}
              </ul>
            </Reveal>
            <Reveal delay={0.12} className="lpa-consent">
              <span className="lpa-card-ic"><Icon name="lock" size={20} /></span>
              <p>{p.priv.question}</p>
              <span className="lpa-consent-btn" aria-hidden>{p.priv.agree}</span>
            </Reveal>
          </div>
        </section>

        <Pricing market={market} waitlistHref={waitlist('pricing')} />

        {/* --------------------------------------------------------------- faq */}
        <section id="faq" className="lpa-tile lpa-tile-parch">
          <div className="lpa-wrap lpa-narrow">
            <Reveal className="lpa-center"><h2 className="lpa-h2">{jj(p.faq.h2)}</h2></Reveal>
            <Reveal delay={0.08} className="lpa-faq">
              {p.faq.items.map(([q, a]) => (
                <details key={q} className="lpa-faq-item">
                  <summary><span>{q}</span><span className="lpa-faq-ic" aria-hidden><Icon name="plus" size={18} /></span></summary>
                  <p>{a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- closing */}
        <section className="lpa-tile lpa-tile-black lpa-close">
          <div className="lpa-wrap lpa-center">
            <Reveal>
              <h2 className="lpa-display">{jj(t.closing.h2)}</h2>
              <p className="lpa-lead lpa-on-dark-soft">{t.closing.sub}</p>
              <div className="lpa-ctas lpa-ctas-center">
                <Link href={cta('closing')} className="lpa-btn lpa-btn-lg">{ctaLabel}</Link>
              </div>
            </Reveal>
            <Reveal delay={0.15} className="lpa-close-pen">
              <div className="lpa-float"><PenArt id="close-pen" className="lpa-pen-svg" shadow={false} /></div>
            </Reveal>
            {!sold && (
              <Reveal delay={0.2} className="lpa-close-soon">
                <SoonLine dark />
              </Reveal>
            )}
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------- footer */}
      <footer className="lpa-foot">
        <div className="lpa-wrap">
          <div className="lpa-foot-fine">
            <p>{t.footer.consent}</p>
            <p>{t.footer.trademarks}</p>
          </div>
          <div className="lpa-foot-row">
            <nav className="lpa-foot-links" aria-label="Juno Pen">
              <a href="#pen">{t.nav.pen}</a>
              <a href="#features">{t.nav.features}</a>
              <a href="#pricing">{t.nav.pricing}</a>
              <Link href={`/privacy${legal}`}>{t.footer.privacy}</Link>
              <Link href={`/terms${legal}`}>{t.footer.terms}</Link>
              <Link href={SIGN_IN}>{t.nav.signIn}</Link>
            </nav>
            {/* Anyone can switch: a Chilean in San Francisco, or a visitor on a VPN. The choice
                is remembered by the site (see proxy.ts). */}
            <nav className="lpa-langs" aria-label={t.switcher}>
              {LANGS.map((l) => (
                <a key={l.code} href={`?m=${l.code}`} className="lpa-lang" data-on={market.lang === l.code} aria-current={market.lang === l.code ? 'true' : undefined}>
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
          <p className="lpa-copy">&copy; {new Date().getFullYear()} <span className="lpa-j">J</span>uno Pen</p>
        </div>
      </footer>

      <StickyCta href={cta('sticky')} label={ctaLabel} />
    </div>
    </LpaCtx.Provider>
  )
}

/* ------------------------------------------------------------------------- hero */

function Hero({ ctaLabel, ctaHref, waitlistHref }: { ctaLabel: string; ctaHref: string; waitlistHref: string }) {
  const { t, p, sold } = useLpa()
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  // As the hero scrolls away the words lift and fade, and the pen drifts up and grows a touch.
  const scrollYProgress = useSectionProgress(ref, 'leave')
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80])
  const copyO = useTransform(scrollYProgress, [0, 0.6], [1, reduce ? 1 : 0])
  const penY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60])
  const penS = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.12])
  return (
    <section ref={ref} className="lpa-tile lpa-tile-black lpa-hero" data-hero>
      <motion.div className="lpa-wrap lpa-center lpa-hero-copy" style={{ y: copyY, opacity: copyO }}>
        {sold ? (
          <a href="#notion" className="lpa-newbadge lpa-in">
            <span className="lpa-newbadge-tag">{NOTION_EN.badgeTag}</span>
            <span>{NOTION_EN.badge}</span>
            <Icon name="chevron" size={14} />
          </a>
        ) : (
          <p className="lpa-eyebrow lpa-eyebrow-dark lpa-in"><span className="lpa-j">J</span>uno Pen</p>
        )}
        <h1 className="lpa-hero-h1">
          <span className="lpa-in" style={{ animationDelay: '.08s' }}>{jj(p.hero.h1a)}</span>{' '}
          <span className="lpa-hero-h1b lpa-in" style={{ animationDelay: '.22s' }}>{jj(p.hero.h1b)}</span>
        </h1>
        <p className="lpa-hero-lede lpa-in" style={{ animationDelay: '.36s' }}>{p.hero.lede}</p>
        <div className="lpa-ctas lpa-ctas-center lpa-in" style={{ animationDelay: '.46s' }}>
          <Link href={ctaHref} className="lpa-btn lpa-btn-lg">{ctaLabel}</Link>
          <a href="#whatsapp" className="lpa-btn lpa-btn-lg lpa-btn-ghost-dark">{p.hero.seeWa}</a>
        </div>
      </motion.div>

      <motion.div className="lpa-hero-stage" style={{ y: penY, scale: penS }}>
        <div className="lpa-spot" aria-hidden />
        <div className="lpa-hero-pen lpa-in-pen">
          <div className="lpa-float">
            <PenArt id="hero-pen" className="lpa-pen-svg" shadow={false} />
          </div>
        </div>
      </motion.div>

      <div className="lpa-wrap lpa-center">
        {sold ? (
          <NoPenLine />
        ) : (
          <p className="lpa-hero-soon">
            <span className="lpa-chip">{t.pen.soon}</span>
            <Link href={waitlistHref} className="lpa-link-dark">{t.pricing.soonCta}<Icon name="chevron" size={14} /></Link>
          </p>
        )}
      </div>
    </section>
  )
}

/** English only: "No pen?" links on to the own-recorder plans (and opens that tab). */
function NoPenLine() {
  const { t } = useLpa()
  // The question part ("No pen?") is set in bold; the rest links on to the plans.
  const m = /^(.*?\?)\s+(.*)$/.exec(t.hero.noPen)
  return (
    <a href="#plans-own" className="lpa-nopen">
      <Icon name="wave" size={17} />
      <span>{m ? <><strong>{m[1]}</strong> {m[2]}</> : t.hero.noPen}</span>
      <Icon name="chevron" size={14} />
    </a>
  )
}

/** Where the pen is sold: what it costs and the button, in place of the waitlist. */
function PenBuy({ dark = false }: { dark?: boolean }) {
  const { t, ctaLabel, cta } = useLpa()
  return (
    <>
      <p className={`lpa-soonline${dark ? ' lpa-soonline-dark' : ''}`}>{t.pricing.penLine(fmtUsd(PRICES.pen))}</p>
      <Link href={cta(dark ? 'pen' : 'specs')} className={dark ? 'lpa-link-dark' : 'lpa-link'}>{ctaLabel}<Icon name="chevron" size={14} /></Link>
    </>
  )
}

/* ---------------------------------------------------------- the pen opens (scroll) */

function PenOpens({ waitlistHref }: { waitlistHref: string }) {
  const { t, sold } = useLpa()
  const ref = useRef<HTMLElement>(null)
  const scrollYProgress = useSectionProgress(ref, 'pin')
  // Phase 1 (0 to .4): the pen swings level and comes forward. Phase 2 (.45 to .65): it opens
  // at the ring. Phase 3: the caption about the plug holds.
  const rotate = useTransform(scrollYProgress, [0, 0.4], [-14, 0])
  const scale = useTransform(scrollYProgress, [0, 0.4, 1], [0.78, 1, 1.04])
  const closedO = useTransform(scrollYProgress, [0.5, 0.55], [1, 0])
  const openO = useTransform(scrollYProgress, [0.5, 0.55], [0, 1])
  // The closed drawing is 716 wide against the open one's 800, drawn to the same scale and
  // left-aligned, so the upper halves coincide. The pair is nudged right by half the gap while
  // closed (centred), and settles as it opens, so the lower half appears to slide away.
  const shift = useTransform(scrollYProgress, [0.5, 0.6], ['5.25%', '0%'])
  const cap1 = useTransform(scrollYProgress, [0.02, 0.12, 0.42, 0.5], [0, 1, 1, 0])
  const cap1y = useTransform(scrollYProgress, [0.02, 0.12], [24, 0])
  const cap2 = useTransform(scrollYProgress, [0.55, 0.66], [0, 1])
  const cap2y = useTransform(scrollYProgress, [0.55, 0.66], [24, 0])
  const glow = useTransform(scrollYProgress, [0.4, 0.7], [0.5, 1])
  return (
    <section ref={ref} id="pen" className="lpa-tile-black lpa-scene">
      <div className="lpa-scene-sticky">
        <div className="lpa-wrap lpa-scene-in">
          <div className="lpa-scene-caps">
            <motion.div className="lpa-scene-cap lpa-scene-cap1" style={{ opacity: cap1, y: cap1y }}>
              {sold ? <span className="lpa-eyebrow lpa-eyebrow-dark">{jj(t.nav.pen)}</span> : <span className="lpa-chip">{jj(t.pen.soon)}</span>}
              <h2 className="lpa-h2 lpa-on-dark">{jj(t.pen.h2)}</h2>
              <p className="lpa-lead lpa-on-dark-soft">{t.pen.sub}</p>
            </motion.div>
            <motion.div className="lpa-scene-cap lpa-scene-cap2" style={{ opacity: cap2, y: cap2y }}>
              <span className="lpa-eyebrow lpa-eyebrow-dark">USB-C</span>
              <h2 className="lpa-h2 lpa-on-dark">{jj(t.pen.open)}</h2>
              <p className="lpa-lead lpa-on-dark-soft">{t.pen.specs[1].v}</p>
              {sold ? <PenBuy dark /> : <Link href={waitlistHref} className="lpa-link-dark">{t.pricing.soonCta}<Icon name="chevron" size={14} /></Link>}
            </motion.div>
          </div>
          <motion.div className="lpa-scene-stage" style={{ rotate, scale }}>
            <motion.div className="lpa-spot lpa-spot-scene" style={{ opacity: glow }} aria-hidden />
            <motion.div className="lpa-scene-pens" style={{ x: shift }}>
              <motion.div className="lpa-scene-closed" style={{ opacity: closedO }}>
                <PenArt id="scene-closed" className="lpa-pen-svg" shadow={false} />
              </motion.div>
              <motion.div className="lpa-scene-open" style={{ opacity: openO }}>
                <PenArt id="scene-open" variant="open" className="lpa-pen-svg" shadow={false} />
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------------ specs */

function Specs({ waitlistHref }: { waitlistHref: string }) {
  const { t, p, x, sold } = useLpa()
  return (
    <section className="lpa-tile lpa-tile-parch">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <span className="lpa-eyebrow">{jj(t.nav.pen)}</span>
          <h2 className="lpa-h2">{jj(p.pen.allSpecs)}.</h2>
        </Reveal>
        <div className="lpa-stats">
          <Reveal className="lpa-stat lpa-stat-dark">
            <span className="lpa-stat-n"><CountUp to={72} /><small>{x.gb}</small></span>
            <span className="lpa-stat-k">{t.pen.storageK}</span>
            <span className="lpa-stat-v">{t.pen.storageV}</span>
          </Reveal>
          <Reveal className="lpa-stat" delay={0.1}>
            <span className="lpa-stat-n"><CountUp to={35} /><small>{x.hours}</small></span>
            <span className="lpa-stat-k">{t.pen.batteryK}</span>
            <span className="lpa-stat-v">{t.pen.batteryV}</span>
          </Reveal>
        </div>
        <ul className="lpa-specs" aria-label={p.pen.allSpecs}>
          {t.pen.specs.map((sp, i) => (
            <Reveal key={sp.k} as="li" delay={(i % 3) * 0.08} className="lpa-spec">
              <span className="lpa-card-ic"><Icon name={SPEC_ICONS[i]} size={20} /></span>
              <h3 className="lpa-h5">{jj(sp.k)}</h3>
              <p>{sp.v}</p>
            </Reveal>
          ))}
        </ul>
        <Reveal className="lpa-box">
          <p>{t.pen.inBox}</p>
        </Reveal>
        <Reveal className="lpa-center lpa-specs-soon">
          {sold ? (
            <PenBuy />
          ) : (
            <>
              <SoonLine />
              <Link href={waitlistHref} className="lpa-link">{t.pricing.soonCta}<Icon name="chevron" size={14} /></Link>
            </>
          )}
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- sound to notes */

/** Deterministic bars, so server and client draw the same waveform. */
const WAVE = (() => {
  const out: number[] = []
  let seed = 8_675_309
  for (let i = 0; i < 48; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const base = 0.25 + (seed / 0x7fffffff) * 0.75
    const swell = 0.55 + 0.45 * Math.sin((i / 48) * Math.PI * 2.2)
    out.push(Math.max(0.14, Math.min(1, base * swell)))
  }
  return out
})()

function SoundToNotes({ kitIndex, setAud }: { kitIndex: number; setAud: (i: number) => void }) {
  const { t, p, kits } = useLpa()
  const kit = kits[kitIndex]
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '0px 0px -20% 0px' })
  const reduce = useReducedMotion()
  const L = p.how.labels
  // The words arrive one turn at a time once the scene is seen; replayed on audience change.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (reduce) return
    const r = ref.current?.getBoundingClientRect()
    if (r && r.top > window.innerHeight) setArmed(true)
  }, [reduce])
  const show = !armed || inView
  const item = (i: number) => ({
    initial: false as const,
    animate: show ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 },
    transition: show ? { duration: 0.7, delay: 0.5 + i * 0.35, ease: EASE } : { duration: 0 },
  })
  return (
    <section className="lpa-tile lpa-tile-white">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <h2 className="lpa-h2">{jj(p.feat.h2)}</h2>
          <p className="lpa-lead">{p.feat.sub}</p>
        </Reveal>
        <Reveal className="lpa-chips-row">
          <div className="lpa-chips" role="tablist" aria-label={t.audience.aria}>
            {kits.map((k, i) => (
              <button key={k.key} type="button" role="tab" aria-selected={i === kitIndex} className="lpa-opt" data-on={i === kitIndex} onClick={() => setAud(i)}>
                {k.tab}
              </button>
            ))}
          </div>
          <p className="lpa-promise" aria-live="polite">{kit.promise}</p>
        </Reveal>

        <div className="lpa-s2n" ref={ref} key={kit.key}>
          <div className="lpa-s2n-sound" data-live={inView && !reduce}>
            <span className="lpa-rec"><span className="lpa-rec-dot" />{L.recording}</span>
            <div className="lpa-wave" aria-hidden>
              {WAVE.map((h, i) => (
                <span key={i} style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${(i % 12) * 0.09}s` }} />
              ))}
            </div>
            <div className="lpa-turns">
              {kit.seq.turns.map(([who, line], i) => (
                <motion.p key={i} {...item(i)}><strong>{who}</strong> {line}</motion.p>
              ))}
            </div>
          </div>
          <div className="lpa-s2n-arrow" aria-hidden><Icon name="chevron" size={22} /></div>
          <div className="lpa-s2n-note">
            <motion.h3 className="lpa-h4" {...item(3)}>{jj(kit.seq.title)}</motion.h3>
            <motion.div className="lpa-note-row" {...item(4)}>
              <span className="lpa-label">{L.decided}</span>
              <p>{kit.seq.decided}</p>
            </motion.div>
            <motion.div className="lpa-note-row lpa-note-warn" {...item(5)}>
              <span className="lpa-label"><Icon name="alert" size={13} />{L.missed}</span>
              <p>{kit.seq.missed}</p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------------- whatsapp */

function WaText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} className="lpa-wa-line">
          {line.split(/(\*[^*]+\*)/g).map((part, j) =>
            /^\*[^*]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : <span key={j}>{part}</span>,
          )}
          {line === '' ? ' ' : null}
        </span>
      ))}
    </>
  )
}

function WhatsApp({ kitIndex, ctaLabel, ctaHref }: { kitIndex: number; ctaLabel: string; ctaHref: string }) {
  const { p, kits } = useLpa()
  const kit = kits[kitIndex]
  const msgs = kit.wa.msgs.slice(0, 7)
  return (
    <section id="whatsapp" className="lpa-tile lpa-tile-black">
      <div className="lpa-wrap lpa-wa">
        <Reveal>
          <span className="lpa-eyebrow lpa-eyebrow-dark">WhatsApp</span>
          <h2 className="lpa-h2 lpa-on-dark">{jj(p.wa.h2)}</h2>
          <p className="lpa-lead lpa-on-dark-soft">{p.wa.sub}</p>
          <div className="lpa-ctas">
            <Link href={ctaHref} className="lpa-btn lpa-btn-lg">{ctaLabel}</Link>
          </div>
        </Reveal>
        <div className="lpa-chat" key={kit.key} role="img" aria-label={p.wa.h2}>
          <div className="lpa-chat-head" aria-hidden>
            <Image src="/juno_mark.png" alt="" width={36} height={36} className="lpa-mark lpa-chat-av" />
            <span><strong>Juno Pen</strong><em>{p.wa.status}</em></span>
          </div>
          <div className="lpa-chat-body" aria-hidden>
            <Reveal className="lpa-bub lpa-bub-me lpa-bub-file">
              <Icon name="wave" size={16} />
              <span><strong>{kit.wa.file}</strong><em>{kit.wa.fileMeta}</em></span>
            </Reveal>
            {msgs.map(([who, text], i) => (
              <Reveal key={i} delay={0.12 + i * 0.12} className={`lpa-bub ${who === 'me' ? 'lpa-bub-me' : 'lpa-bub-bot'}`}>
                <WaText text={text} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- assistant */

/** Juno speaking first: the offer after a meeting, then the brief before the next one. */
function Assistant({ kitKey }: { kitKey: Kit['key'] }) {
  const { p, market } = useLpa()
  const A = p.asst
  const lines: ProLine[] = PRO[market.lang][kitKey]
  return (
    <section id="assistant" className="lpa-tile lpa-tile-parch">
      <div className="lpa-wrap lpa-wa lpa-wa-flip">
        <div className="lpa-chat lpa-chat-pro" key={kitKey} role="img" aria-label={A.h2}>
          <div className="lpa-chat-head" aria-hidden>
            <Image src="/juno_mark.png" alt="" width={36} height={36} className="lpa-mark lpa-chat-av" />
            <span><strong>Juno Pen</strong><em>{p.wa.status}</em></span>
          </div>
          <div className="lpa-chat-body" aria-hidden>
            {lines.map(([who, text], i) =>
              who === 'when' ? (
                <Reveal key={i} delay={0.12 + i * 0.12} className="lpa-chat-when">{text}</Reveal>
              ) : (
                <Reveal key={i} delay={0.12 + i * 0.12} className={`lpa-bub ${who === 'me' ? 'lpa-bub-me' : 'lpa-bub-bot'}`}>
                  <WaText text={text} />
                </Reveal>
              ),
            )}
          </div>
        </div>
        <Reveal>
          <h2 className="lpa-h2">{jj(A.h2)}</h2>
          <p className="lpa-lead">{A.sub}</p>
          <ul className="lpa-checks lpa-checks-1">
            {A.points.map((it) => <li key={it}><Icon name="check" size={16} />{it}</li>)}
          </ul>
          <p className="lpa-stopline">{A.stop}</p>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- by chat */

/** What you can ask for in one message, and what Juno connects to. Same in every audience. */
function ByChat() {
  const { p } = useLpa()
  const D = p.does
  return (
    <section id="by-chat" className="lpa-tile lpa-tile-black">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <h2 className="lpa-h2 lpa-on-dark">{jj(D.h2)}</h2>
          <p className="lpa-lead lpa-on-dark-soft">{D.sub}</p>
        </Reveal>
        <div className="lpa-bc">
          <Reveal className="lpa-bc-asks">
            {D.asks.map((a) => <p key={a} className="lpa-bub lpa-bub-me">{a}</p>)}
          </Reveal>
          <Reveal delay={0.12} className="lpa-bc-side">
            <h3 className="lpa-h5 lpa-on-dark">{D.connectsTitle}</h3>
            <dl className="lpa-bc-list">
              {D.connects.map((c) => (
                <div key={c.name}>
                  <dt>{c.name}</dt>
                  <dd>{c.what}</dd>
                </div>
              ))}
            </dl>
            <div className="lpa-bc-home">
              <span className="lpa-bc-dot" aria-hidden />
              <div>
                <p className="lpa-bc-home-h">{jj(D.home.h)}</p>
                <p className="lpa-bc-home-p">{D.home.p}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- pricing */

function Pricing({ market, waitlistHref }: { market: Market; waitlistHref: string }) {
  const { t, sold } = useLpa()
  const P = t.pricing
  // Where the pen is sold there are two groups, one at a time: software + pen (leads) and
  // software only, two cards each (monthly, yearly). Elsewhere: the software plans and the
  // coming-soon pen card.
  const [group, setGroup] = useState<'pen' | 'own'>(sold ? 'pen' : 'own')
  // "No pen?" in the hero links to #plans-own: open that tab (the browser scrolls to it).
  useEffect(() => {
    if (!sold) return
    const open = () => {
      if (window.location.hash === '#plans-own') setGroup('own')
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [sold])
  const plans = group === 'pen' ? penPlans(t, market) : ownPlans(t, market)
  const ribbons = plans.some((pl) => pl.ribbon)
  const grid = (
    <div className={plans.length === 1 ? 'lpa-plans lpa-plans-1' : 'lpa-plans'} key={group}>
      {plans.map((pl, i) => <PlanView key={pl.name} plan={pl} delay={i * 0.1} pad={ribbons} />)}
    </div>
  )
  return (
    <section id="pricing" className="lpa-tile lpa-tile-white lpa-pricing">
      {/* A slow colour field behind the glass, so the cards' blur has something to refract. */}
      <div className="lpa-pfield" aria-hidden><span /><span /><span /></div>
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <span className="lpa-eyebrow">{jj(t.nav.pricing)}</span>
          <h2 className="lpa-h2">{jj(P.h2)}</h2>
          <p className="lpa-lead">{P.sub}</p>
          {!sold && <p className="lpa-own-sub">{P.ownSub}</p>}
        </Reveal>
        {sold ? (
          <>
            <div id="plans-own" className="lpa-center lpa-tabs-row">
              <div className="lpa-tabs" role="tablist" aria-label={P.tabAria}>
                {(['pen', 'own'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    id={`lpa-plans-tab-${g}`}
                    aria-controls="lpa-plans-panel"
                    aria-selected={group === g}
                    data-plans-tab={g}
                    data-on={group === g}
                    className="lpa-tab"
                    onClick={() => setGroup(g)}
                  >
                    {g === 'pen' ? P.tabPen : P.tabOwn}
                  </button>
                ))}
              </div>
              {group === 'own' && <p className="lpa-own-sub">{P.ownSub}</p>}
            </div>
            <div id="lpa-plans-panel" role="tabpanel" aria-labelledby={`lpa-plans-tab-${group}`}>
              {grid}
            </div>
          </>
        ) : (
          grid
        )}
        <Reveal className="lpa-glass-slot lpa-included-slot">
          <GlassCard className="lpa-included">
            <h3 className="lpa-h5">{jj(P.includedTitle)}</h3>
            <ul className="lpa-checks lpa-checks-3">
              {P.included.map((it) => <li key={it}><Icon name="check" size={16} />{it}</li>)}
            </ul>
          </GlassCard>
        </Reveal>
        {!sold && (
          <Reveal className="lpa-glass-slot lpa-pensoon-slot">
            <GlassCard className="lpa-pensoon">
              <div className="lpa-pensoon-art" aria-hidden><PenArt id="soon-pen" className="lpa-pen-svg" /></div>
              <div className="lpa-pensoon-copy">
                <span className="lpa-chip lpa-chip-light">{t.pen.soon}</span>
                <h3 className="lpa-h4">{jj(P.soonTitle)}</h3>
                <p>{P.soonBody}</p>
                <Link href={waitlistHref} className="lpa-link">{P.soonCta}<Icon name="chevron" size={14} /></Link>
              </div>
            </GlassCard>
          </Reveal>
        )}
      </div>
    </section>
  )
}

/** `pad`: another card in the row has a ribbon, so this one keeps the space and the names line up. */
function PlanView({ plan, delay, pad = false }: { plan: PlanCard; delay: number; pad?: boolean }) {
  return (
    // The Reveal moves the slot in; the card inside tilts. Two elements, so neither transform
    // overwrites the other.
    <Reveal delay={delay} className="lpa-glass-slot lpa-plan-slot">
      <GlassCard tilt className={plan.pro ? 'lpa-plan lpa-plan-pro' : 'lpa-plan'}>
        {plan.pro && <span className="lpa-ring" aria-hidden><span className="lpa-ring-spin" /></span>}
        {plan.ribbon ? <span className="lpa-chip lpa-chip-light">{plan.ribbon}</span> : pad && <span className="lpa-chip lpa-chip-pad" aria-hidden>&nbsp;</span>}
        <h3 className="lpa-plan-name">{plan.name}</h3>
        <p className="lpa-price">{plan.price}<span>{plan.per}</span></p>
        <p className="lpa-plan-line">{plan.line}</p>
        <p className="lpa-plan-trade">{plan.trade}</p>
        <Link href={plan.href} className={`lpa-btn lpa-btn-lg lpa-plan-cta${plan.pro ? '' : ' lpa-btn-ghost'}`}>{plan.cta}</Link>
      </GlassCard>
    </Reveal>
  )
}

/**
 * A pricing card in glass that answers the pointer: a soft light follows the cursor across it
 * and, with `tilt`, it leans a few degrees toward it. Set as CSS variables straight on the
 * element, at most once a frame, so a pointer move never re-renders React. Mouse only: on touch
 * there is no follow or tilt (CSS gives a tap highlight instead), and prefers-reduced-motion
 * switches all of it off in landing-apple.css.
 */
function GlassCard({ className, tilt = false, children }: { className: string; tilt?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const pos = useRef({ x: 0, y: 0 })
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    pos.current = { x: e.clientX, y: e.clientY }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const px = Math.min(1, Math.max(0, (pos.current.x - r.left) / r.width))
      const py = Math.min(1, Math.max(0, (pos.current.y - r.top) / r.height))
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
      if (tilt) {
        el.style.setProperty('--ry', `${((px - 0.5) * 10).toFixed(2)}deg`)
        el.style.setProperty('--rx', `${((0.5 - py) * 8).toFixed(2)}deg`)
      }
      el.dataset.hot = 'true'
    })
  }
  const onLeave = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    delete el.dataset.hot
  }
  return (
    <div ref={ref} className={`lpa-glass ${className}`} data-tilt={tilt || undefined} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------------- film */

/** English only: the how-to for the chosen audience (film/HowToScene.tsx), from the pen plugged
 *  in through to WhatsApp, playing while it is on screen; another audience restarts its story. */
function Film({ kit }: { kit: Kit }) {
  const { p, x } = useLpa()
  return (
    <section id="film" className="lpa-tile lpa-tile-white">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <span className="lpa-eyebrow">{jj(x.film)}</span>
          <h2 className="lpa-h2">{jj(p.film.h2)}</h2>
          <p className="lpa-lead">{p.film.sub}</p>
        </Reveal>
        <Reveal className="lpa-film">
          <HowToPlayer autoplay="visible" loop kit={kit.key as HowToKitKey} key={kit.key} />
        </Reveal>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------------- notion */

/**
 * English only: what the customer sees in their Notion, the "Juno Pen notes" table
 * (lib/pen/notion.ts makes it) and one of its pages, for the chosen audience. Drawn in the
 * page's own type: no Notion screenshot or logo.
 */
function NotionSec({ kit, ctaLabel, ctaHref }: { kit: Kit; ctaLabel: string; ctaHref: string }) {
  const N = NOTION_EN
  const n = kit.note
  const names = n.people.map(([name]) => name.split(' ')[0]).slice(0, 2).join(', ')
  const rows: [string, string, string, number][] = [
    [n.title, N.today, names, 3],
    [kit.seq.title, N.yesterday, kit.hero.who.split(' ')[0], 1],
    [N.weekly[0], N.weekly[1], N.weekly[2], 0],
  ]
  return (
    <section id="notion" className="lpa-tile lpa-tile-black">
      <div className="lpa-wrap lpa-nt">
        <Reveal>
          <span className="lpa-eyebrow lpa-eyebrow-dark">{jj(N.kicker)}</span>
          <h2 className="lpa-h2 lpa-on-dark">{jj(N.h2)}</h2>
          <p className="lpa-lead lpa-on-dark-soft">{N.sub}</p>
          <ul className="lpa-checks lpa-checks-1 lpa-checks-dark">
            {N.points.map((it) => <li key={it}><Icon name="check" size={16} />{it}</li>)}
          </ul>
          <div className="lpa-ctas">
            <Link href={ctaHref} className="lpa-btn lpa-btn-lg">{ctaLabel}</Link>
          </div>
        </Reveal>
        <Reveal delay={0.12} className="lpa-nt-stage">
          <div className="lpa-nt-win" aria-hidden>
            <div className="lpa-nt-bar"><span className="lpa-nt-dots"><i /><i /><i /></span><span>{N.crumb}</span></div>
            <div className="lpa-nt-body">
              <p className="lpa-nt-title">{N.table}</p>
              <div className="lpa-nt-table">
                <div className="lpa-nt-row lpa-nt-head">{N.cols.map((c) => <span key={c}>{c}</span>)}</div>
                {rows.map(([title, date, who, open], i) => (
                  // Keyed by position: a meeting's note and its recording can share a title
                  // (Students, Family), and a duplicate key here blanked the page on switch.
                  <div key={i} className="lpa-nt-row" data-new={i === 0 ? 'true' : undefined}>
                    <span className="lpa-nt-name">{title}</span><span>{date}</span><span>{who}</span><span className="lpa-nt-num">{open}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lpa-nt-page" key={kit.key} aria-hidden>
            <p className="lpa-nt-page-title">{n.title}</p>
            <span className="lpa-label">{N.summary}</span>
            <p className="lpa-nt-p">{n.summary}</p>
            <span className="lpa-label">{N.todos}</span>
            <ul className="lpa-todos">
              {n.actions.map((a, i) => (
                <li key={a} data-done={i === 0}><span className="lpa-tick"><Icon name="check" size={12} /></span><span>{a}</span></li>
              ))}
            </ul>
            <p className="lpa-nt-link">{N.open}</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ sticky cta */

function StickyCta({ href, label }: { href: string; label: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const hero = document.querySelector('.lpa [data-hero]')
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
    <div className="lpa-sticky" data-on={on} aria-hidden={!on}>
      <Link href={href} className="lpa-btn lpa-btn-lg" tabIndex={on ? 0 : -1}>{label}</Link>
    </div>
  )
}

