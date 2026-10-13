'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import PenArt from './PenArt'
import Icon, { type IconName } from './Icon'
import { TRIAL_DAYS } from '@/lib/pen/plan'
import { COPY, type Market } from './landing-copy'
import { AUD_PARAM, KITS, PLUS } from './landing-audiences'
import { INVITED, SIGN_IN, ownPlans, signup, type PlanCard } from './Landing'
import './landing-pt.css'

// The Portuguese landing page, as a product gallery (agreed Oct 12): edge-to-edge tiles that
// alternate black and light, very large tight headlines, one blue action colour, and the pen as
// the object on the pedestal. The words are the shared ones: COPY.pt (landing-copy.ts) and
// PLUS.pt / KITS.pt (landing-audiences.ts). Prices and links come from Landing.tsx.
//
// The pen is NOT sold in Brazil yet. It is shown as the product and its future, every pen
// section carries "Em breve no Brasil" and the waitlist link, and every primary button starts
// today's own-recorder trial, exactly as the shared Portuguese page does.
//
// Motion: transform and opacity only. Nothing starts hidden on the server: content below the
// fold is armed after mount and rises in when it scrolls into view, so a slow connection or a
// crawler still sees the whole page. prefers-reduced-motion gets the final frame everywhere;
// the scroll scene's reduced layout is pure CSS (landing-pt.css), so server and client agree.

/** The few labels this layout needs that the shared copy doesn't have. Keep this list short. */
const PT_EXTRA = {
  skip: 'Pular para o conteúdo',
  how: 'Como funciona',
  hours: 'h',
  gb: 'GB',
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

/** The "coming soon" line every pen section carries. */
function SoonLine({ dark = false }: { dark?: boolean }) {
  const t = COPY.pt
  return (
    <p className={`lpa-soonline${dark ? ' lpa-soonline-dark' : ''}`}>
      <span className="lpa-chip">{t.pen.soon}</span>
      <span>{t.pen.soonBody}</span>
    </p>
  )
}

/* ------------------------------------------------------------------------- page */

export default function LandingPt({ market, audience = null, invitedBy = null }: { market: Market; audience?: string | null; invitedBy?: string | null }) {
  const t = COPY.pt
  const p = PLUS.pt
  const kits = KITS.pt
  const [aud, setAudState] = useState(() => {
    const key = AUD_PARAM[(audience ?? '').toLowerCase()]
    return Math.max(0, key ? kits.findIndex((k) => k.key === key) : 0)
  })
  const kit = kits[aud]
  useEffect(() => {
    document.documentElement.lang = 'pt-BR'
  }, [])
  const setAud = useCallback(
    (i: number) => {
      setAudState(i)
      const u = new URL(window.location.href)
      u.searchParams.set('for', kits[i].key)
      window.history.replaceState(null, '', u.toString())
    },
    [kits],
  )

  const ctaLabel = t.cta.trialOwn(TRIAL_DAYS)
  const cta = (from: string) => signup(`plan=monthly&offer=own-recorder&from=${from}`, market)
  const waitlist = (from: string) => signup(`offer=posted-pen&waitlist=pen&from=${from}`, market)

  return (
    <div className="lpa">
      <a href="#lpa-main" className="lpa-skip">{PT_EXTRA.skip}</a>
      {invitedBy && (
        <div className="lpa-invited" role="status">
          <strong>{INVITED.pt(invitedBy)[0]}</strong> <span>{INVITED.pt(invitedBy)[1]}</span>
        </div>
      )}

      {/* ---------------------------------------------------------------- nav */}
      <header className="lpa-nav">
        <div className="lpa-wrap lpa-nav-in">
          <Link href="/" className="lpa-brand" aria-label={t.nav.home}>
            <Image src="/juno_mark.png" alt="" width={26} height={26} className="lpa-mark" priority />
            <span>Juno Pen</span>
          </Link>
          <nav className="lpa-nav-links" aria-label="Juno Pen">
            <a href="#pen" className="lpa-navlink lpa-hide-sm">{t.nav.pen}</a>
            <a href="#features" className="lpa-navlink lpa-hide-sm">{t.nav.features}</a>
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
              <span className="lpa-eyebrow">{PT_EXTRA.how}</span>
              <h2 className="lpa-h2">{p.how.h2}</h2>
            </Reveal>
            <ol className="lpa-steps">
              {p.how.steps.map((st, i) => (
                <Reveal key={st.h} as="li" delay={i * 0.1} className="lpa-step">
                  <span className="lpa-step-n" aria-hidden>{i + 1}</span>
                  <h3 className="lpa-h4">{st.h}</h3>
                  <p>{st.p}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <WhatsApp kitIndex={aud} ctaLabel={ctaLabel} ctaHref={cta('whatsapp')} />

        {/* ---------------------------------------------------------- features */}
        <section id="features" className="lpa-tile lpa-tile-white">
          <div className="lpa-wrap">
            <Reveal className="lpa-center">
              <span className="lpa-eyebrow">{t.nav.features}</span>
              <h2 className="lpa-h2">{p.feat.noteTitle}.</h2>
              <p className="lpa-lead">{p.feat.noteCopy}</p>
            </Reveal>
            <div className="lpa-cards" key={kit.key}>
              <Reveal className="lpa-card">
                <span className="lpa-card-ic"><Icon name="sparkle" size={20} /></span>
                <h3 className="lpa-h4">{kit.note.title}</h3>
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
                <h3 className="lpa-h4">{p.feat.emailTitle}</h3>
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

        {/* ----------------------------------------------------------- privacy */}
        <section className="lpa-tile lpa-tile-parch">
          <div className="lpa-wrap lpa-priv">
            <Reveal>
              <span className="lpa-eyebrow">{t.footer.privacy}</span>
              <h2 className="lpa-h2">{p.priv.h2}</h2>
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
            <Reveal className="lpa-center"><h2 className="lpa-h2">{p.faq.h2}</h2></Reveal>
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
              <h2 className="lpa-display">{t.closing.h2}</h2>
              <p className="lpa-lead lpa-on-dark-soft">{t.closing.sub(TRIAL_DAYS)}</p>
              <div className="lpa-ctas lpa-ctas-center">
                <Link href={cta('closing')} className="lpa-btn lpa-btn-lg">{ctaLabel}</Link>
              </div>
            </Reveal>
            <Reveal delay={0.15} className="lpa-close-pen">
              <div className="lpa-float"><PenArt id="close-pen" className="lpa-pen-svg" shadow={false} /></div>
            </Reveal>
            <Reveal delay={0.2} className="lpa-close-soon">
              <SoonLine dark />
            </Reveal>
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
              <Link href="/privacy?lang=pt">{t.footer.privacy}</Link>
              <Link href="/terms?lang=pt">{t.footer.terms}</Link>
              <Link href={SIGN_IN}>{t.nav.signIn}</Link>
            </nav>
            <nav className="lpa-langs" aria-label={t.switcher}>
              {LANGS.map((l) => (
                <a key={l.code} href={`?m=${l.code}`} className="lpa-lang" data-on={market.lang === l.code} aria-current={market.lang === l.code ? 'true' : undefined}>
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
          <p className="lpa-copy">&copy; {new Date().getFullYear()} Juno Pen</p>
        </div>
      </footer>

      <StickyCta href={cta('sticky')} label={ctaLabel} />
    </div>
  )
}

/* ------------------------------------------------------------------------- hero */

function Hero({ ctaLabel, ctaHref, waitlistHref }: { ctaLabel: string; ctaHref: string; waitlistHref: string }) {
  const p = PLUS.pt
  const t = COPY.pt
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
        <p className="lpa-eyebrow lpa-eyebrow-dark lpa-in">Juno Pen</p>
        <h1 className="lpa-hero-h1">
          <span className="lpa-in" style={{ animationDelay: '.08s' }}>{p.hero.h1a}</span>{' '}
          <span className="lpa-hero-h1b lpa-in" style={{ animationDelay: '.22s' }}>{p.hero.h1b}</span>
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
        <p className="lpa-hero-soon">
          <span className="lpa-chip">{t.pen.soon}</span>
          <Link href={waitlistHref} className="lpa-link-dark">{t.pricing.soonCta}<Icon name="chevron" size={14} /></Link>
        </p>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- the pen opens (scroll) */

function PenOpens({ waitlistHref }: { waitlistHref: string }) {
  const t = COPY.pt
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
              <span className="lpa-chip">{t.pen.soon}</span>
              <h2 className="lpa-h2 lpa-on-dark">{t.pen.h2}</h2>
              <p className="lpa-lead lpa-on-dark-soft">{t.pen.sub}</p>
            </motion.div>
            <motion.div className="lpa-scene-cap lpa-scene-cap2" style={{ opacity: cap2, y: cap2y }}>
              <span className="lpa-eyebrow lpa-eyebrow-dark">USB-C</span>
              <h2 className="lpa-h2 lpa-on-dark">{t.pen.open}</h2>
              <p className="lpa-lead lpa-on-dark-soft">{t.pen.specs[1].v}</p>
              <Link href={waitlistHref} className="lpa-link-dark">{t.pricing.soonCta}<Icon name="chevron" size={14} /></Link>
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
  const t = COPY.pt
  const p = PLUS.pt
  return (
    <section className="lpa-tile lpa-tile-parch">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <span className="lpa-eyebrow">{t.nav.pen}</span>
          <h2 className="lpa-h2">{p.pen.allSpecs}.</h2>
        </Reveal>
        <div className="lpa-stats">
          <Reveal className="lpa-stat lpa-stat-dark">
            <span className="lpa-stat-n"><CountUp to={72} /><small>{PT_EXTRA.gb}</small></span>
            <span className="lpa-stat-k">{t.pen.storageK}</span>
            <span className="lpa-stat-v">{t.pen.storageV}</span>
          </Reveal>
          <Reveal className="lpa-stat" delay={0.1}>
            <span className="lpa-stat-n"><CountUp to={35} /><small>{PT_EXTRA.hours}</small></span>
            <span className="lpa-stat-k">{t.pen.batteryK}</span>
            <span className="lpa-stat-v">{t.pen.batteryV}</span>
          </Reveal>
        </div>
        <ul className="lpa-specs" aria-label={p.pen.allSpecs}>
          {t.pen.specs.map((sp, i) => (
            <Reveal key={sp.k} as="li" delay={(i % 3) * 0.08} className="lpa-spec">
              <span className="lpa-card-ic"><Icon name={SPEC_ICONS[i]} size={20} /></span>
              <h3 className="lpa-h5">{sp.k}</h3>
              <p>{sp.v}</p>
            </Reveal>
          ))}
        </ul>
        <Reveal className="lpa-box">
          <p>{t.pen.inBox}</p>
        </Reveal>
        <Reveal className="lpa-center lpa-specs-soon">
          <SoonLine />
          <Link href={waitlistHref} className="lpa-link">{t.pricing.soonCta}<Icon name="chevron" size={14} /></Link>
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
  const t = COPY.pt
  const p = PLUS.pt
  const kits = KITS.pt
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
          <h2 className="lpa-h2">{p.feat.h2}</h2>
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
            <motion.h3 className="lpa-h4" {...item(3)}>{kit.seq.title}</motion.h3>
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
  const p = PLUS.pt
  const kit = KITS.pt[kitIndex]
  const msgs = kit.wa.msgs.slice(0, 7)
  return (
    <section id="whatsapp" className="lpa-tile lpa-tile-black">
      <div className="lpa-wrap lpa-wa">
        <Reveal>
          <span className="lpa-eyebrow lpa-eyebrow-dark">WhatsApp</span>
          <h2 className="lpa-h2 lpa-on-dark">{p.wa.h2}</h2>
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

/* ---------------------------------------------------------------------- pricing */

function Pricing({ market, waitlistHref }: { market: Market; waitlistHref: string }) {
  const t = COPY.pt
  const plans = ownPlans(t, market)
  return (
    <section id="pricing" className="lpa-tile lpa-tile-white">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <span className="lpa-eyebrow">{t.nav.pricing}</span>
          <h2 className="lpa-h2">{t.pricing.h2}</h2>
          <p className="lpa-lead">{t.pricing.sub}</p>
          <p className="lpa-own-sub">{t.pricing.ownSub}</p>
        </Reveal>
        <div className="lpa-plans">
          {plans.map((pl, i) => <PlanView key={pl.name} plan={pl} delay={i * 0.1} />)}
        </div>
        <Reveal className="lpa-included">
          <h3 className="lpa-h5">{t.pricing.includedTitle}</h3>
          <ul className="lpa-checks lpa-checks-3">
            {t.pricing.included.map((it) => <li key={it}><Icon name="check" size={16} />{it}</li>)}
          </ul>
        </Reveal>
        <Reveal className="lpa-pensoon">
          <div className="lpa-pensoon-art" aria-hidden><PenArt id="soon-pen" className="lpa-pen-svg" /></div>
          <div className="lpa-pensoon-copy">
            <span className="lpa-chip lpa-chip-light">{t.pen.soon}</span>
            <h3 className="lpa-h4">{t.pricing.soonTitle}</h3>
            <p>{t.pricing.soonBody}</p>
            <Link href={waitlistHref} className="lpa-link">{t.pricing.soonCta}<Icon name="chevron" size={14} /></Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function PlanView({ plan, delay }: { plan: PlanCard; delay: number }) {
  return (
    <Reveal delay={delay} className={plan.pro ? 'lpa-plan lpa-plan-pro' : 'lpa-plan'}>
      {plan.ribbon && <span className="lpa-chip lpa-chip-light">{plan.ribbon}</span>}
      <h3 className="lpa-plan-name">{plan.name}</h3>
      <p className="lpa-price">{plan.price}<span>{plan.per}</span></p>
      <p className="lpa-plan-line">{plan.line}</p>
      <p className="lpa-plan-trade">{plan.trade}</p>
      <Link href={plan.href} className={`lpa-btn lpa-btn-lg lpa-plan-cta${plan.pro ? '' : ' lpa-btn-ghost'}`}>{plan.cta}</Link>
    </Reveal>
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

