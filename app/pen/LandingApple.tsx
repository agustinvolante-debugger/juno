'use client'

import Link from 'next/link'
import Image from 'next/image'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import PenArt from './PenArt'
import Icon, { type IconName } from './Icon'
import HowToPlayer from './how-to/HowToPlayer'
import type { HowToKitKey } from './film/HowToScene'
import { PRICES, fmtUsd } from '@/lib/pen/prices'
import { money } from '@/lib/pen/currency'
import { BrandMark, type MarkKey } from './brand-marks'
import { COPY, type Copy, type Market } from './landing-copy'
import { AUD_PARAM, KITS, PLUS, PRO, type Kit } from './landing-audiences'
import { INVITED, SIGN_IN, ownPlans, penPlans, signup, type PlanCard } from './Landing'
import './landing-apple.css'
import { DOCS_URL as DOCS } from '@/lib/docs-url'

// The help center (Mintlify) and the blog, linked from the nav and the footer. English only for now.

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
// - Spanish (Chile, CLP) and Portuguese (Brazil, BRL): since 15 Oct the pen is sold there too, the
//   same way: an optional one-time add-on, shipped to the address given at checkout, priced in
//   the local currency (PRICES.local). The Notion section and the how-to video stay English-only.
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
  en: { skip: 'Skip to content' },
  es: { skip: 'Saltar al contenido' },
  pt: { skip: 'Pular para o conteúdo' },
} as const

/**
 * The 16 Oct restructure (critique 2026-10-16): the hero badge, the price line under the hero, the
 * "Get started" label, the merged WhatsApp section, the short pen section, the how-to link, the
 * privacy strip under pricing and the "vs Plaud or Pocket" answer.
 */
const V2 = {
  en: {
    badgeTag: 'New',
    badge: 'Now on WhatsApp and iMessage',
    start: 'Get started',
    perMonth: '/mo',
    priceLine: (m: string, pen: string) => `${m}/mo · pen ${pen} once · works on your phone today`,
    waH2: 'Lives in your WhatsApp. Speaks up first.',
    asksTitle: 'One message does it',
    keySpecs: [['72 GB', 'Years of meetings'], ['35 hrs', 'A week per charge'], ['360°', 'Hears the whole table'], ['USB-C', 'Built into the pen']],
    allSpecs: 'All the specs',
    watch: 'Watch the 60-sec how-to',
    close: 'Close',
    privLine: 'It asks before it listens: nothing is processed until you confirm everyone agreed. Encrypted, private to you, never sold.',
    vsQ: 'How is this different from Plaud or Pocket?',
    vsA: 'Plaud and Pocket are recorders that give you notes. Juno is the assistant that was in the room: it texts you after on WhatsApp or iMessage, offers to add the meeting someone mentioned, reminds you of what you promised, briefs you before the next one, and does tasks when you ask in the chat. It works with your Plaud and Pocket recordings too.',
  },
  es: {
    badgeTag: 'Nuevo',
    badge: 'Ahora en WhatsApp e iMessage',
    start: 'Empezar',
    perMonth: '/mes',
    priceLine: (m: string, pen: string) => `${m}/mes · lápiz ${pen} una vez · funciona hoy en tu celular`,
    waH2: 'Vive en tu WhatsApp. Y habla primero.',
    asksTitle: 'Basta un mensaje',
    keySpecs: [['72 GB', 'Años de reuniones'], ['35 h', 'Una semana por carga'], ['360°', 'Escucha toda la mesa'], ['USB-C', 'Integrado en el lápiz']],
    allSpecs: 'Todas las especificaciones',
    watch: 'Mira cómo se usa en 60 segundos',
    close: 'Cerrar',
    privLine: 'Pregunta antes de escuchar: nada se procesa hasta que confirmas que todos aceptaron. Cifrado, privado para ti, nunca se vende.',
    vsQ: '¿En qué se diferencia de Plaud o Pocket?',
    vsA: 'Plaud y Pocket son grabadoras que te dan notas. Juno es el asistente que estuvo en la reunión: te escribe después por WhatsApp o iMessage, ofrece agendar la reunión que alguien mencionó, te recuerda lo que prometiste, te prepara antes de la siguiente y hace tareas cuando se las pides por chat. También funciona con tus grabaciones de Plaud y Pocket.',
  },
  pt: {
    badgeTag: 'Novo',
    badge: 'Agora no WhatsApp e no iMessage',
    start: 'Começar',
    perMonth: '/mês',
    priceLine: (m: string, pen: string) => `${m}/mês · caneta ${pen} uma vez · funciona hoje no seu celular`,
    waH2: 'Mora no seu WhatsApp. E fala primeiro.',
    asksTitle: 'Uma mensagem resolve',
    keySpecs: [['72 GB', 'Anos de reuniões'], ['35 h', 'Uma semana por carga'], ['360°', 'Ouve a mesa toda'], ['USB-C', 'Embutido na caneta']],
    allSpecs: 'Todas as especificações',
    watch: 'Veja como usar em 60 segundos',
    close: 'Fechar',
    privLine: 'Pergunta antes de ouvir: nada é processado até você confirmar que todos concordaram. Criptografado, privado para você, nunca vendido.',
    vsQ: 'Qual a diferença para o Plaud ou o Pocket?',
    vsA: 'Plaud e Pocket são gravadores que te dão notas. O Juno é o assistente que estava na reunião: te manda mensagem depois no WhatsApp ou no iMessage, oferece agendar a reunião que alguém mencionou, lembra o que você prometeu, te prepara antes da próxima e faz tarefas quando você pede no chat. Também funciona com as suas gravações do Plaud e do Pocket.',
  },
} as const

/** Which of the "Ask, and it's done" lines the WhatsApp section shows (same order in every language). */
const ASK_PICK = [4, 2, 5, 0]

/**
 * The Connectors section (15 Oct): four groups that tell the whole story of where a meeting goes
 * after the pen hears it. Every claim is something the product does today. A mark is a Simple
 * Icons brand mark (brand-marks.tsx), a plain name badge where no usable logo exists, or our own
 * icon for "any audio".
 */
type ConnMark = { mark: MarkKey; label: string } | { badge: string } | { icon: IconName; label: string } | { img: string; label: string }
type ConnGroup = { key: 'cal' | 'docs' | 'tasks' | 'ai'; title: string; line: string; marks: ConnMark[]; said: string; did: string; fine: string }
const CONN_MARKS: Record<ConnGroup['key'], ConnMark[]> = {
  cal: [{ mark: 'googlecalendar', label: 'Google Calendar' }, { mark: 'apple', label: 'Apple Calendar' }, { img: '/brands/outlook.png', label: 'Outlook' }],
  docs: [{ mark: 'googledocs', label: 'Google Docs' }, { mark: 'googlesheets', label: 'Google Sheets' }, { mark: 'notion', label: 'Notion' }],
  tasks: [{ mark: 'whatsapp', label: 'WhatsApp' }, { mark: 'googlesheets', label: 'Google Sheets' }, { mark: 'gmail', label: 'Gmail' }],
  ai: [{ mark: 'whatsapp', label: 'WhatsApp' }, { mark: 'imessage', label: 'iMessage' }, { img: '/brands/granola.png', label: 'Granola' }, { img: '/brands/plaud.png', label: 'Plaud' }, { img: '/brands/pocket.png', label: 'Pocket' }, { icon: 'wave', label: 'Audio' }],
}
const CONNECT = {
  en: {
    nav: 'Connectors',
    h2: 'Said in the room. Done in your apps.',
    sub: 'The pen hears the meeting. Juno puts what was said where it belongs.',
    hubLine: 'Hears the room. Texts you after.',
    hubBot: 'Tom said Tuesday at 2. Add it to your calendar?',
    hubMe: 'Yes',
    groups: [
      { key: 'cal', title: 'Calendar', line: 'Dates said out loud land on your calendar.', said: '“Tuesday at 2 works, Tom.”', did: 'On your calendar, Tom invited.', fine: 'Google Calendar: adds, moves and deletes events, with Meet links and invites. Apple Calendar and Outlook: one tap to add.' },
      { key: 'docs', title: 'Documents', line: 'The documents you would have written anyway.', said: 'The pricing call', did: 'A Doc and a price Sheet in your Drive.', fine: 'Google Docs and Sheets in your own Drive. Notion pages with the summary, to-dos as checkboxes and who was there.' },
      { key: 'tasks', title: 'Tasks', line: 'Every promise made in the room, kept track of.', said: '“I’ll send Chris the deck by Friday.”', did: 'Reminder Thursday, 9 AM.', fine: 'To-dos with due dates and who is waiting. Reminders on WhatsApp, “Juno is waiting on you”, export to Sheets. Follow-up emails drafted for you.' },
      { key: 'ai', title: 'An assistant that was in the room', line: 'Ask anything about any meeting on WhatsApp or iMessage.', said: '“What did the CTO say about pricing?”', did: 'The answer, and the moment she said it.', fine: 'It speaks up first and does tasks by chat. Imports add to its memory: Granola, Plaud, Pocket, Notion AI meeting notes, any audio or transcript.' },
    ],
  },
  es: {
    nav: 'Conexiones',
    h2: 'Se dijo en la reunión. Listo en tus apps.',
    sub: 'El lápiz escucha la reunión. Juno deja lo que se dijo donde corresponde.',
    hubLine: 'Escucha la reunión. Te escribe después.',
    hubBot: 'Tomás dijo martes a las 2. ¿Lo agrego a tu calendario?',
    hubMe: 'Sí',
    groups: [
      { key: 'cal', title: 'Calendario', line: 'Las fechas que se dicen en voz alta llegan a tu calendario.', said: '“El martes a las 2 me sirve, Tomás.”', did: 'En tu calendario, con Tomás invitado.', fine: 'Google Calendar: crea, mueve y borra eventos, con enlace de Meet e invitaciones. Apple Calendar y Outlook: agregar con un toque.' },
      { key: 'docs', title: 'Documentos', line: 'Los documentos que igual ibas a escribir.', said: 'La llamada de precios', did: 'Un Doc y una planilla de precios en tu Drive.', fine: 'Google Docs y Sheets en tu propio Drive. Páginas de Notion con el resumen, las tareas como casillas y quién estuvo.' },
      { key: 'tasks', title: 'Tareas', line: 'Cada compromiso de la reunión, con seguimiento.', said: '“Le mando la presentación a Cristián el viernes.”', did: 'Recordatorio el jueves a las 9.', fine: 'Tareas con fecha y quién está esperando. Recordatorios por WhatsApp, “Juno te está esperando”, exportar a Sheets. Correos de seguimiento redactados.' },
      { key: 'ai', title: 'Un asistente que estuvo en la reunión', line: 'Pregunta lo que quieras de cualquier reunión por WhatsApp o iMessage.', said: '“¿Qué dijo la CTO sobre los precios?”', did: 'La respuesta, y el momento en que lo dijo.', fine: 'Habla primero y hace tareas por chat. Lo que importas suma a su memoria: Granola, Plaud, Pocket, notas de Notion AI, cualquier audio o transcripción.' },
    ],
  },
  pt: {
    nav: 'Conexões',
    h2: 'Dito na reunião. Feito nos seus apps.',
    sub: 'A caneta ouve a reunião. O Juno coloca o que foi dito no lugar certo.',
    hubLine: 'Ouve a reunião. Depois, te manda mensagem.',
    hubBot: 'O Tomás disse terça às 14h. Coloco na sua agenda?',
    hubMe: 'Sim',
    groups: [
      { key: 'cal', title: 'Agenda', line: 'Datas ditas em voz alta vão para a sua agenda.', said: '“Terça às 14h funciona, Tomás.”', did: 'Na sua agenda, com o Tomás convidado.', fine: 'Google Calendar: cria, move e apaga eventos, com link do Meet e convites. Apple Calendar e Outlook: adicionar com um toque.' },
      { key: 'docs', title: 'Documentos', line: 'Os documentos que você escreveria de qualquer jeito.', said: 'A call de preços', did: 'Um Doc e uma planilha de preços no seu Drive.', fine: 'Google Docs e Sheets no seu próprio Drive. Páginas do Notion com o resumo, as tarefas como caixas de seleção e quem estava lá.' },
      { key: 'tasks', title: 'Tarefas', line: 'Cada compromisso da reunião, acompanhado.', said: '“Mando a apresentação para o Cristiano até sexta.”', did: 'Lembrete na quinta, às 9h.', fine: 'Tarefas com prazo e quem está esperando. Lembretes no WhatsApp, “O Juno está esperando você”, exportar para o Sheets. E-mails de acompanhamento redigidos.' },
      { key: 'ai', title: 'Um assistente que estava na reunião', line: 'Pergunte qualquer coisa sobre qualquer reunião no WhatsApp ou no iMessage.', said: '“O que a CTO disse sobre preços?”', did: 'A resposta, e o momento em que ela disse.', fine: 'Ele fala primeiro e faz tarefas pelo chat. As importações alimentam a memória dele: Granola, Plaud, Pocket, notas do Notion AI, qualquer áudio ou transcrição.' },
    ],
  },
} as const satisfies Record<'en' | 'es' | 'pt', { nav: string; h2: string; sub: string; hubLine: string; hubBot: string; hubMe: string; groups: readonly Omit<ConnGroup, 'marks'>[] }>

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

/* ------------------------------------------------------------------ the market */

/**
 * What the page needs to know about where the visitor is. `en` gates the English-only pieces
 * (the how-to film); the pen is sold in every market (US, Chile, Brazil since 15 Oct).
 */
type Lpa = {
  market: Market
  t: Copy
  p: (typeof PLUS)['en']
  kits: Kit[]
  x: (typeof EXTRA)['en' | 'es' | 'pt']
  en: boolean
  /** The pen's one-time price in the visitor's currency: "$65", "$59.990", "R$ 360". */
  pen: string
  /** The software's monthly price in the visitor's currency: "$9.99", "$9.990", "R$ 59,90". */
  monthly: string
  v: (typeof V2)['en' | 'es' | 'pt']
  /** The one "get it" label and where it goes: signup's own choice, in every market. */
  ctaLabel: string
  cta: (from: string) => string
}

/** The pen's price where the visitor is: PRICES.pen in dollars, or PRICES.local in CLP/BRL. */
export function penPrice(market: Market): string {
  return market.currency === 'usd' ? fmtUsd(PRICES.pen) : money(PRICES.local[market.currency].pen, market.currency)
}

function lpaFor(market: Market): Lpa {
  const lang = market.lang
  const t = COPY[lang]
  return {
    market,
    t,
    p: PLUS[lang],
    kits: KITS[lang],
    x: EXTRA[lang],
    en: lang === 'en',
    pen: penPrice(market),
    monthly: market.currency === 'usd' ? fmtUsd(PRICES.monthly) : money(PRICES.local[market.currency].monthly, market.currency),
    v: V2[lang],
    ctaLabel: t.cta.start,
    cta: (from) => signup(`from=${from}`, market),
  }
}

const LpaCtx = createContext<Lpa>(lpaFor({ lang: 'pt', currency: 'brl' }))
const useLpa = () => useContext(LpaCtx)

/* ------------------------------------------------------------------------- page */

export default function LandingApple({ market, audience = null, invitedBy = null }: { market: Market; audience?: string | null; invitedBy?: string | null }) {
  const lpa = lpaFor(market)
  const { t, p, kits, x, ctaLabel, cta } = lpa
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
            <a href="#features" className="lpa-navlink lpa-hide-sm">{t.nav.features}</a>
            <a href="#whatsapp" className="lpa-navlink lpa-hide-md">WhatsApp</a>
            <a href="#connectors" className="lpa-navlink lpa-hide-md">{CONNECT[lang].nav}</a>
            <a href="#pen" className="lpa-navlink lpa-hide-sm">{t.nav.pen}</a>
            <a href="#pricing" className="lpa-navlink lpa-hide-sm">{t.nav.pricing}</a>
            <a href={DOCS} className="lpa-navlink lpa-hide-md">Docs</a>
            <Link href="/blog" className="lpa-navlink lpa-hide-md">Blog</Link>
            <Link href={SIGN_IN} className="lpa-navlink">{t.nav.signIn}</Link>
            <Link href={cta('nav')} className="lpa-btn lpa-btn-sm">{ctaLabel}</Link>
          </nav>
        </div>
      </header>

      <main id="lpa-main">
        <Hero ctaLabel={lpa.v.start} ctaHref={cta('hero')} />
        <SoundToNotes kitIndex={aud} setAud={setAud} />
        <WhatsApp kitIndex={aud} />
        <Connectors />
        <ThePen />
        <Steps kitKey={kit.key} />
        <Pricing market={market} />

        {/* --------------------------------------------------------------- faq */}
        <section id="faq" className="lpa-tile lpa-tile-parch">
          <div className="lpa-wrap lpa-narrow">
            <Reveal className="lpa-center"><h2 className="lpa-h2">{jj(p.faq.h2)}</h2></Reveal>
            <Reveal delay={0.08} className="lpa-faq">
              {faqItems(p.faq.items, lpa.v).map(([q, a]) => (
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
              <a href="#features">{t.nav.features}</a>
              <a href="#whatsapp">WhatsApp</a>
              <a href="#connectors">{CONNECT[lang].nav}</a>
              <a href="#pen">{t.nav.pen}</a>
              <a href="#pricing">{t.nav.pricing}</a>
              <a href={DOCS}>Docs</a>
              <Link href="/blog">Blog</Link>
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

      <StickyCta href={cta('sticky')} label={`${lpa.v.start} · ${lpa.monthly}${lpa.v.perMonth}`} />
    </div>
    </LpaCtx.Provider>
  )
}

/* ------------------------------------------------------------------------- hero */

function Hero({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  const { p, v, monthly, pen } = useLpa()
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
        <a href="#whatsapp" className="lpa-newbadge lpa-in">
          <span className="lpa-newbadge-tag">{v.badgeTag}</span>
          <span>{v.badge}</span>
          <Icon name="chevron" size={14} />
        </a>
        <h1 className="lpa-hero-h1">
          <span className="lpa-in" style={{ animationDelay: '.08s' }}>{jj(p.hero.h1a)}</span>{' '}
          <span className="lpa-hero-h1b lpa-in" style={{ animationDelay: '.22s' }}>{jj(p.hero.h1b)}</span>
        </h1>
        <p className="lpa-hero-lede lpa-in" style={{ animationDelay: '.36s' }}>{p.hero.lede}</p>
        <div className="lpa-ctas lpa-ctas-center lpa-in" style={{ animationDelay: '.46s' }}>
          <Link href={ctaHref} className="lpa-btn lpa-btn-lg">{ctaLabel}</Link>
          <a href="#whatsapp" className="lpa-btn lpa-btn-lg lpa-btn-ghost-dark">{p.hero.seeWa}</a>
        </div>
        <p className="lpa-hero-price lpa-in" style={{ animationDelay: '.54s' }}>{v.priceLine(monthly, pen)}</p>
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
        <NoPenLine />
      </div>
    </section>
  )
}

/** "No pen?" links on to the own-recorder plans (and opens that tab). */
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

/** What the pen costs where the visitor is, and the button. */
function PenBuy() {
  const { t, pen, ctaLabel, cta } = useLpa()
  return (
    <>
      <p className="lpa-soonline">{t.pricing.penLine(pen)}</p>
      <Link href={cta('pen')} className="lpa-link">{ctaLabel}<Icon name="chevron" size={14} /></Link>
    </>
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
  // Hidden start only once armed, so a remount on audience change replays the entrance.
  const item = (i: number) => ({
    initial: armed ? { opacity: 0, y: 14 } : (false as const),
    animate: show ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 },
    transition: show ? { duration: 0.7, delay: 0.5 + i * 0.35, ease: EASE } : { duration: 0 },
  })
  return (
    <section id="features" className="lpa-tile lpa-tile-white">
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

        {/* The in-view watcher sits on a wrapper that stays mounted: on the keyed scene it kept
            watching the removed node after an audience change, and the new cards stayed hidden. */}
        <div ref={ref}>
        <div className="lpa-s2n" key={kit.key}>
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

/**
 * WhatsApp, merged with "It speaks up first" (16 Oct): the recap and the question after a
 * recording, then the offer Juno makes on its own, in one thread; beside it, four things one
 * message does. The thread follows the chosen audience.
 */
function WhatsApp({ kitIndex }: { kitIndex: number }) {
  const { p, kits, v, market } = useLpa()
  const kit = kits[kitIndex]
  const recap = kit.wa.msgs.slice(0, 3)
  const offer = PRO[market.lang][kit.key].filter(([who]) => who !== 'when').slice(0, 3)
  return (
    <section id="whatsapp" className="lpa-tile lpa-tile-parch">
      <div className="lpa-wrap lpa-wa lpa-wa-flip">
        <div className="lpa-chat lpa-chat-pro" key={kit.key} role="img" aria-label={v.waH2}>
          <div className="lpa-chat-head" aria-hidden>
            <Image src="/juno_mark.png" alt="" width={36} height={36} className="lpa-mark lpa-chat-av" />
            <span><strong>Juno Pen</strong><em>{p.wa.status}</em></span>
          </div>
          <div className="lpa-chat-body" aria-hidden>
            <Reveal className="lpa-bub lpa-bub-me lpa-bub-file">
              <Icon name="wave" size={16} />
              <span><strong>{kit.wa.file}</strong><em>{kit.wa.fileMeta}</em></span>
            </Reveal>
            {[...recap, ...offer].map(([who, text], i) => (
              <Reveal key={i} delay={0.12 + i * 0.12} className={`lpa-bub ${who === 'me' ? 'lpa-bub-me' : 'lpa-bub-bot'}`}>
                <WaText text={text} />
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal>
          <h2 className="lpa-h2">{jj(v.waH2)}</h2>
          <p className="lpa-lead">{p.wa.sub}</p>
          <h3 className="lpa-wa-asks-h">{v.asksTitle}</h3>
          <ul className="lpa-wa-asks">
            {ASK_PICK.map((i) => <li key={i} className="lpa-bub lpa-bub-me">{p.does.asks[i]}</li>)}
          </ul>
          <p className="lpa-stopline">{p.asst.stop}</p>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- pricing */

function Pricing({ market }: { market: Market }) {
  const { t, v } = useLpa()
  const P = t.pricing
  // Two groups, one at a time: software + pen (leads) and software only, two cards each
  // (monthly, yearly). Every market, priced in its own currency.
  const [group, setGroup] = useState<'pen' | 'own'>('pen')
  // "No pen?" in the hero links to #plans-own: open that tab (the browser scrolls to it).
  useEffect(() => {
    const open = () => {
      if (window.location.hash === '#plans-own') setGroup('own')
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
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
          <h2 className="lpa-h2">{jj(P.h2)}</h2>
          <p className="lpa-lead">{P.sub}</p>
        </Reveal>
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
        <Reveal className="lpa-glass-slot lpa-included-slot">
          <GlassCard className="lpa-included">
            <h3 className="lpa-h5">{jj(P.includedTitle)}</h3>
            <ul className="lpa-checks lpa-checks-3">
              {P.included.map((it) => <li key={it}><Icon name="check" size={16} />{it}</li>)}
            </ul>
          </GlassCard>
        </Reveal>
        <p className="lpa-privline"><Icon name="lock" size={16} /><span>{v.privLine}</span></p>
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

/* ----------------------------------------------------------------------- notion */

/**
 * Connectors: where a meeting goes after the pen hears it. The hub (the pen, with the WhatsApp
 * message Juno sends afterwards) sits in the middle; the four groups sit around it, each joined
 * to it by a dashed curve. The curves are measured from the laid-out grid (offset boxes, which
 * ignore the tiles' reveal transforms) and redrawn on resize, so they hold at any width. They
 * draw in once when the section arrives: the section's one authored motion. Each tile keeps its
 * marks, one benefit line, and a live example: what was said, then what Juno did with it.
 */
type HubPath = { d: string; x: number; y: number }
function useHubLines(hubRef: React.RefObject<HTMLUListElement | null>) {
  const [box, setBox] = useState<{ w: number; h: number; paths: HubPath[] } | null>(null)
  useEffect(() => {
    const hub = hubRef.current
    if (!hub) return
    const measure = () => {
      const stage = hub.querySelector<HTMLElement>('[data-hub-stage]')
      // The tile's own <li> (positioned, so its offsets are relative to the hub and ignore the
      // reveal transform); the data attribute sits on its inner box.
      const tiles = Array.from(hub.querySelectorAll<HTMLElement>('[data-hub-tile]')).map((t) => t.parentElement as HTMLElement)
      // Stacked (phone): no curves; the CSS draws one short line under the hub instead.
      if (!stage || tiles.length !== 4 || getComputedStyle(hub).display !== 'grid' || tiles[0].offsetLeft === tiles[2].offsetLeft) { setBox(null); return }
      // The pen's drawing box and the chat card, in hub coordinates.
      const art = stage.querySelector<HTMLElement>('.lpa-conn-stage')!
      const chat = stage.querySelector<HTMLElement>('.lpa-conn-chat')!
      const ax = stage.offsetLeft + art.offsetLeft, ay = stage.offsetTop + art.offsetTop, w = art.offsetWidth
      // A point on the pen, t = 0 at the clicker to 1 at the tip, read from .lpa-conn-pen's own
      // left/top (its centre), unrotated width (its length) and its 112deg turn.
      const pen = stage.querySelector<HTMLElement>('.lpa-conn-pen')!
      const cs = getComputedStyle(pen)
      const cx = ax + parseFloat(cs.left), cy = ay + parseFloat(cs.top), half = pen.offsetWidth / 2
      const onPen = (t: number) => ({ x: cx + half * (1 - 2 * t) * 0.375, y: cy - half * (1 - 2 * t) * 0.927 })
      const gap = w * 0.1
      const ends: Record<string, { x: number; y: number }> = {
        'l-top': { x: onPen(0.32).x - gap, y: onPen(0.32).y },
        'r-top': { x: onPen(0.18).x + gap, y: onPen(0.18).y },
        'l-bot': { x: onPen(0.72).x - gap, y: onPen(0.72).y },
        'r-bot': { x: ax + chat.offsetLeft + chat.offsetWidth + 6, y: ay + chat.offsetTop + chat.offsetHeight * 0.45 },
      }
      const paths = tiles.map((t) => {
        const place = t.firstElementChild!.getAttribute('data-hub-tile')!
        const left = place.startsWith('l')
        // Start: the tile's inner edge, level with its title. End: just short of the hub.
        const x1 = left ? t.offsetLeft + t.offsetWidth : t.offsetLeft
        const y1 = t.offsetTop + Math.min(96, t.offsetHeight * 0.3)
        const { x: x2, y: y2 } = ends[place]
        const dx = (x2 - x1) * 0.55
        return { d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx * 0.5} ${y2} ${x2} ${y2}`, x: x1, y: y1 }
      })
      setBox({ w: hub.offsetWidth, h: hub.offsetHeight, paths })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(hub)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [hubRef])
  return box
}

function Connectors() {
  const { market } = useLpa()
  const C = CONNECT[market.lang]
  const hubRef = useRef<HTMLUListElement>(null)
  const lines = useHubLines(hubRef)
  const reduce = useReducedMotion()
  const inView = useInView(hubRef, { once: true, amount: 0.25 })
  const drawn = reduce || inView
  // Calendar and Documents on the left, Tasks and the assistant on the right.
  const place: Record<ConnGroup['key'], string> = { cal: 'l-top', docs: 'l-bot', tasks: 'r-top', ai: 'r-bot' }
  return (
    <section id="connectors" className="lpa-tile lpa-tile-black">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <h2 className="lpa-h2 lpa-on-dark">{jj(C.h2)}</h2>
          <p className="lpa-lead lpa-on-dark-soft">{C.sub}</p>
        </Reveal>
        <ul ref={hubRef} className={`lpa-conn${drawn ? ' is-drawn' : ''}`}>
          {lines && (
            <li className="lpa-conn-lines" aria-hidden>
              <svg width={lines.w} height={lines.h} viewBox={`0 0 ${lines.w} ${lines.h}`}>
                <defs>
                  <mask id="lpa-conn-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={lines.w} height={lines.h}>
                    {lines.paths.map((p, i) => (
                      <path key={i} d={p.d} pathLength={1} className="lpa-conn-draw" style={{ transitionDelay: `${0.15 + i * 0.12}s` }} />
                    ))}
                  </mask>
                </defs>
                <g mask="url(#lpa-conn-mask)">
                  {lines.paths.map((p, i) => <path key={i} d={p.d} className="lpa-conn-path" />)}
                </g>
                {lines.paths.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} className="lpa-conn-dot" />)}
              </svg>
            </li>
          )}
          <li className="lpa-conn-hub" data-hub-stage>
            <div className="lpa-conn-stage">
              <div className="lpa-spot lpa-conn-spot" aria-hidden />
              <div className="lpa-conn-pen">
                <PenArt id="conn-pen" className="lpa-pen-svg" shadow={false} />
              </div>
              <div className="lpa-conn-chat" aria-hidden>
                <p className="lpa-conn-chathead">
                  <Image src="/juno_mark.png" alt="" width={18} height={18} className="lpa-mark lpa-chat-av" />
                  <span>WhatsApp</span>
                </p>
                <p className="lpa-bub lpa-bub-bot">{C.hubBot}</p>
                <p className="lpa-bub lpa-bub-me">{C.hubMe}</p>
              </div>
            </div>
            <p className="lpa-conn-name">{jj('Juno Pen')}</p>
            <p className="lpa-conn-hubline">{C.hubLine}</p>
          </li>
          {C.groups.map((g, i) => (
            <Reveal key={g.key} as="li" delay={(i % 2) * 0.1} className={`lpa-conn-tile lpa-conn-${place[g.key]}`}>
              <div data-hub-tile={place[g.key]} className="lpa-conn-tile-in">
                <div className="lpa-conn-marks">
                  {CONN_MARKS[g.key].map((m) =>
                    'img' in m ? (
                      <span key={m.label} className="lpa-conn-mark" title={m.label}><img src={m.img} alt={m.label} width={20} height={20} className="lpa-conn-img" /></span>
                    ) : 'badge' in m ? (
                      <span key={m.badge} className="lpa-conn-mark lpa-conn-badge">{m.badge}</span>
                    ) : 'mark' in m ? (
                      <span key={m.mark} className="lpa-conn-mark" title={m.label}><BrandMark name={m.mark} /></span>
                    ) : (
                      <span key={m.icon} className="lpa-conn-mark lpa-conn-ic" title={m.label}><Icon name={m.icon} size={18} /></span>
                    ),
                  )}
                </div>
                <h3 className="lpa-h4 lpa-on-dark">{jj(g.title)}</h3>
                <p className="lpa-conn-line">{g.line}</p>
                <div className="lpa-conn-ex">
                  <p className="lpa-conn-said">{g.said}</p>
                  <Reveal delay={0.45 + (i % 2) * 0.1} className="lpa-conn-did">
                    <span className="lpa-conn-tick" aria-hidden><Icon name="check" size={12} /></span>
                    <span>{g.did}</span>
                  </Reveal>
                </div>
                <p className="lpa-conn-fine">{g.fine}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- the pen */

/** The pen in one screen (16 Oct, replacing the scroll scene and the specs tile): the open pen,
 *  four numbers, and the full list behind "All the specs". */
function ThePen() {
  const { t, v } = useLpa()
  const all = [...t.pen.specs.map((sp, i) => ({ k: sp.k, v: sp.v, ic: SPEC_ICONS[i] })), { k: `72 GB ${t.pen.storageK}`, v: t.pen.storageV, ic: 'folder' as IconName }, { k: `35 h ${t.pen.batteryK}`, v: t.pen.batteryV, ic: 'battery' as IconName }]
  return (
    <section id="pen" className="lpa-tile lpa-tile-white lpa-pen2">
      <div className="lpa-wrap">
        <Reveal className="lpa-center">
          <h2 className="lpa-h2">{jj(t.pen.h2)}</h2>
          <p className="lpa-lead">{t.pen.sub}</p>
        </Reveal>
        <Reveal className="lpa-pen2-stage">
          <PenArt id="pen2" variant="open" className="lpa-pen-svg" shadow={false} />
          <p className="lpa-pen2-cap">{t.pen.open}</p>
        </Reveal>
        <ul className="lpa-pen2-specs">
          {v.keySpecs.map(([n, k]) => (
            <li key={n}><span className="lpa-pen2-n">{n}</span><span className="lpa-pen2-k">{k}</span></li>
          ))}
        </ul>
        <details className="lpa-pen2-all">
          <summary><span>{v.allSpecs}</span><span className="lpa-faq-ic" aria-hidden><Icon name="plus" size={18} /></span></summary>
          <ul className="lpa-pen2-list">
            {all.map((sp) => (
              <li key={sp.k}>
                <span className="lpa-card-ic"><Icon name={sp.ic} size={18} /></span>
                <div><h3 className="lpa-h5">{jj(sp.k)}</h3><p>{sp.v}</p></div>
              </li>
            ))}
          </ul>
          <p className="lpa-pen2-box">{t.pen.inBox}</p>
        </details>
        <div className="lpa-center lpa-pen2-buy"><PenBuy /></div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- three steps */

/** Three steps, and in English the 60-second how-to (film/HowToScene.tsx) in a dialog; it only
 *  mounts while open, so the page does not run the film in the background. */
function Steps({ kitKey }: { kitKey: Kit['key'] }) {
  const { p, en, v } = useLpa()
  const dlg = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <section id="how" className="lpa-tile lpa-tile-parch">
      <div className="lpa-wrap">
        <Reveal>
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
        {en && (
          <>
            <button type="button" className="lpa-watch" onClick={() => { setOpen(true); dlg.current?.showModal() }}>
              <span className="lpa-watch-ic" aria-hidden><Icon name="play" size={14} /></span>
              {v.watch}
            </button>
            <dialog
              ref={dlg}
              className="lpa-film-dlg"
              aria-label={v.watch}
              onClose={() => setOpen(false)}
              onClick={(e) => { if (e.target === dlg.current) dlg.current?.close() }}
            >
              <button type="button" className="lpa-film-x" onClick={() => dlg.current?.close()} aria-label={v.close}>
                <Icon name="plus" size={20} />
              </button>
              {open && <HowToPlayer autoplay="always" kit={kitKey as HowToKitKey} />}
            </dialog>
          </>
        )}
      </div>
    </section>
  )
}

/** The FAQ order (16 Oct): "Is it legal to record?" first, then how Juno differs from Plaud or
 *  Pocket, then the rest as written. */
function faqItems(items: readonly (readonly [string, string])[], v: (typeof V2)['en' | 'es' | 'pt']): [string, string][] {
  const legal = items.findIndex(([q]) => /legal/i.test(q))
  const list = items.map(([q, a]) => [q, a] as [string, string])
  const first = legal >= 0 ? list.splice(legal, 1) : []
  return [...first, [v.vsQ, v.vsA], ...list]
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

