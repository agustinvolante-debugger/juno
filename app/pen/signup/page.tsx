'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ROLES } from '@/lib/pen/signup-fields'
import { postJson, errMessage } from '@/lib/pen/http'
import { PRICES, fmtUsd } from '@/lib/pen/prices'
import { LOCAL_PRICES, money } from '@/lib/pen/currency'
import '../pen-theme.css'

type State = 'idle' | 'sending' | 'done'
type SuLang = 'en' | 'es' | 'pt'

// The form in the language the landing page was in (carried as ?lang=). Role VALUES stay in
// English (they are stored and read by the owners); only their labels are translated.
const M = fmtUsd(PRICES.monthly)
const Y = fmtUsd(PRICES.yearly)
const G = { today: fmtUsd(PRICES.givenPen.today), then: fmtUsd(PRICES.givenPen.then), months: PRICES.givenPen.months }

const SU = {
  en: {
    eyebrow: 'Get started', h1: 'Record the meeting. Read the write-up.',
    lede: 'Pick a plan, and add the pen if you want one. Takes a minute.',
    ledeWait: 'Leave your details and we’ll tell you the moment the pen arrives.',
    plan: 'Your plan', monthly: 'Monthly', monthlyP: (p: string) => `${p} a month`, yearly: 'Yearly', yearlyP: (p: string) => `${p} a year, paid upfront`,
    pen: 'The Juno pen', penYes: 'Add the pen', penYesP: (p: string) => `${p} once. We post it to you`, penNo: 'No pen', penNoP: 'Use your phone or your own recorder',
    penShip: 'You’ll give the address to post it to at checkout.',
    today: (t: string, then: string) => `Today ${t}, then ${then}. Cancel anytime.`,
    perMonth: (p: string) => `${p} a month`, perYear: (p: string) => `${p} a year`,
    name: 'Your name', email: 'Email', phone: 'WhatsApp number', phoneHint: 'With the country code. You can send recordings and get your notes on WhatsApp.', optional: 'optional', role: 'What do you do', choose: 'Choose one',
    roles: ['Real estate agent', 'Healthcare', 'Sales', 'Consulting', 'Founder / exec', 'Legal', 'Student or researcher', 'Something else'],
    ship: 'Where to send the pen', line1: 'Street address', line2: 'Apartment, suite', city: 'City', state: 'State', postcode: 'ZIP / postcode', country: 'Country',
    note: 'Anything we should know', notePh: 'What you’d want it for, or what you’ve tried before.',
    submit: 'Continue to payment', sending: 'Sending…',
    fine: 'We use this to set up your account and reach you on WhatsApp. Nothing else.', finePen: 'We use this to set up your account, reach you on WhatsApp and post your pen. Nothing else.',
    agree: ['By continuing you agree to the ', 'Terms', ' and ', 'Privacy Policy', '.'],
    doneH: 'You’re on the list.', doneWait: 'We’ll email you as soon as the pen is available where you are.',
    doneBody: 'There’s a confirmation in your inbox. We’ll be in touch with a link to finish signing up.',
    back: 'Back to the site', err: 'Something went wrong. Try again.', home: 'Back to Juno Pen',
    need: { name: 'Please give us your name.', email: 'That email address doesn’t look right.', phone: 'We need your WhatsApp number, with the country code.' },
    free: {
      eyebrow: 'Your free Juno pen', h1: 'Your Juno pen is on us.',
      lede: 'Tell us where to send it. The pen is free, and so are your first 30 days of Juno. We save a card for after the trial: nothing is charged today.',
      terms: ['$0 today', 'Pen free', '30 days free', `Then ${M}/month`, '3-month minimum'],
      submit: 'Claim my free pen', fine: `Your card is saved for after the trial. The free pen comes with a 3-month minimum (the free month plus two paid months at ${M}); if your plan ends sooner, the pen is charged at $50. We email you before the trial ends. Manage or cancel in Settings, Billing.`,
      gone: 'All the free pens for this offer have been claimed.',
    },
    given: {
      eyebrow: 'Your Juno pen', h1: 'Your Juno pen is ready.',
      lede: `You already have the pen. Open your account here: ${G.today} today covers your first ${G.months} months of Juno, then it’s ${G.then} a month.`,
      terms: [`${G.today} today`, 'The pen is yours', `${G.months} months included`, `Then ${G.then}/month`, 'Cancel anytime'],
      submit: `Start for ${G.today}`, fine: `Your card is charged ${G.today} today and saved for the monthly plan, which starts after ${G.months} months unless you cancel. We email you before the first ${G.then} charge. Cancel anytime in Settings, Billing; the pen stays yours.`,
      gone: '',
    },
    ph: { name: 'Mark Ellis', email: 'you@company.com', phone: '+1 305 555 0142', line1: '1200 Brickell Ave', city: 'Miami', state: 'FL', postcode: '33131', country: 'United States' },
  },
  es: {
    eyebrow: 'Empieza', h1: 'Graba la reunión. Lee el resumen.',
    lede: 'Elige un plan y agrega el lápiz si lo quieres. Toma un minuto.',
    ledeWait: 'Déjanos tus datos y te avisamos apenas llegue el lápiz.',
    plan: 'Tu plan', monthly: 'Mensual', monthlyP: (p: string) => `${p} al mes`, yearly: 'Anual', yearlyP: (p: string) => `${p} al año, pago adelantado`,
    pen: 'El lápiz Juno', penYes: 'Agregar el lápiz', penYesP: (p: string) => `${p} una vez. Te lo enviamos`, penNo: 'Sin lápiz', penNoP: 'Usa tu celular o tu propia grabadora',
    penShip: 'La dirección de envío te la pedimos al pagar.',
    today: (t: string, then: string) => `Hoy ${t}, luego ${then}. Cancela cuando quieras.`,
    perMonth: (p: string) => `${p} al mes`, perYear: (p: string) => `${p} al año`,
    name: 'Tu nombre', email: 'Correo', phone: 'Número de WhatsApp', phoneHint: 'Con el código de país. Puedes mandar grabaciones y recibir tus notas por WhatsApp.', optional: 'opcional', role: 'A qué te dedicas', choose: 'Elige una opción',
    roles: ['Corredor de propiedades', 'Salud', 'Ventas', 'Consultoría', 'Fundador / ejecutivo', 'Legal', 'Estudiante o investigador', 'Otra cosa'],
    ship: 'Dónde enviar el lápiz', line1: 'Dirección', line2: 'Depto., oficina', city: 'Ciudad', state: 'Región', postcode: 'Código postal', country: 'País',
    note: 'Algo que debamos saber', notePh: 'Para qué lo usarías, o qué has probado antes.',
    submit: 'Continuar al pago', sending: 'Enviando…',
    fine: 'Usamos esto para crear tu cuenta y escribirte por WhatsApp. Nada más.', finePen: 'Usamos esto para crear tu cuenta, escribirte por WhatsApp y enviarte el lápiz. Nada más.',
    agree: ['Al continuar aceptas los ', 'Términos', ' y la ', 'Política de privacidad', '.'],
    doneH: 'Estás en la lista.', doneWait: 'Te escribimos apenas el lápiz esté disponible donde estás.',
    doneBody: 'Te llegó una confirmación al correo. Te escribiremos con un enlace para terminar de registrarte.',
    back: 'Volver al sitio', err: 'Algo salió mal. Inténtalo de nuevo.', home: 'Volver a Juno Pen',
    need: { name: 'Necesitamos tu nombre.', email: 'Ese correo no parece correcto.', phone: 'Necesitamos tu número de WhatsApp, con el código de país.' },
    free: {
      eyebrow: 'Tu lápiz Juno gratis', h1: 'Tu lápiz Juno va por nuestra cuenta.',
      lede: 'Dinos dónde enviarlo. El lápiz es gratis, y también tus primeros 30 días de Juno. Guardamos una tarjeta para después de la prueba: hoy no se cobra nada.',
      terms: ['$0 hoy', 'Lápiz gratis', '30 días gratis', `Luego US${M}/mes`, 'Mínimo 3 meses'],
      submit: 'Pedir mi lápiz gratis', fine: `Tu tarjeta queda guardada para después de la prueba. El lápiz gratis viene con un mínimo de 3 meses (el mes gratis más dos meses pagados a US${M}); si tu plan termina antes, se cobran US$50 por el lápiz. Te escribimos antes de que termine la prueba. Gestiona o cancela en Configuración, Facturación.`,
      gone: 'Ya se reclamaron todos los lápices gratis de esta oferta.',
    },
    given: {
      eyebrow: 'Tu lápiz Juno', h1: 'Tu lápiz Juno está listo.',
      lede: `Ya tienes el lápiz. Abre tu cuenta aquí: US${G.today} hoy cubren tus primeros ${G.months} meses de Juno, y luego son US${G.then} al mes.`,
      terms: [`US${G.today} hoy`, 'El lápiz es tuyo', `${G.months} meses incluidos`, `Luego US${G.then}/mes`, 'Cancela cuando quieras'],
      submit: `Empezar por US${G.today}`, fine: `Hoy se cobran US${G.today} a tu tarjeta, que queda guardada para el plan mensual: empieza después de ${G.months} meses, salvo que canceles. Te escribimos antes del primer cobro de US${G.then}. Cancela cuando quieras en Configuración, Facturación; el lápiz sigue siendo tuyo.`,
      gone: '',
    },
    ph: { name: 'Sofía Henríquez', email: 'tu@empresa.cl', phone: '+56 9 1234 5678', line1: 'Av. Apoquindo 3000', city: 'Santiago', state: 'RM', postcode: '7550000', country: 'Chile' },
  },
  pt: {
    eyebrow: 'Comece', h1: 'Grave a reunião. Leia o resumo.',
    lede: 'Escolha um plano e adicione a caneta se quiser. Leva um minuto.',
    ledeWait: 'Deixe seus dados e avisamos assim que a caneta chegar.',
    plan: 'Seu plano', monthly: 'Mensal', monthlyP: (p: string) => `${p} por mês`, yearly: 'Anual', yearlyP: (p: string) => `${p} por ano, pago adiantado`,
    pen: 'A caneta Juno', penYes: 'Adicionar a caneta', penYesP: (p: string) => `${p} uma vez. Enviamos para você`, penNo: 'Sem caneta', penNoP: 'Use seu celular ou seu próprio gravador',
    penShip: 'O endereço de entrega é pedido no pagamento.',
    today: (t: string, then: string) => `Hoje ${t}, depois ${then}. Cancele quando quiser.`,
    perMonth: (p: string) => `${p} por mês`, perYear: (p: string) => `${p} por ano`,
    name: 'Seu nome', email: 'E-mail', phone: 'Número de WhatsApp', phoneHint: 'Com o código do país. Você pode enviar gravações e receber suas notas pelo WhatsApp.', optional: 'opcional', role: 'O que você faz', choose: 'Escolha uma opção',
    roles: ['Corretor de imóveis', 'Saúde', 'Vendas', 'Consultoria', 'Fundador / executivo', 'Jurídico', 'Estudante ou pesquisador', 'Outra coisa'],
    ship: 'Onde enviar a caneta', line1: 'Endereço', line2: 'Apto., sala', city: 'Cidade', state: 'Estado', postcode: 'CEP', country: 'País',
    note: 'Algo que devemos saber', notePh: 'Para que você usaria, ou o que já testou antes.',
    submit: 'Continuar para o pagamento', sending: 'Enviando…',
    fine: 'Usamos isso para criar sua conta e falar com você pelo WhatsApp. Nada mais.', finePen: 'Usamos isso para criar sua conta, falar com você pelo WhatsApp e enviar sua caneta. Nada mais.',
    agree: ['Ao continuar, você aceita os ', 'Termos', ' e a ', 'Política de privacidade', '.'],
    doneH: 'Você está na lista.', doneWait: 'Avisamos por e-mail assim que a caneta estiver disponível onde você está.',
    doneBody: 'Enviamos uma confirmação para o seu e-mail. Mandaremos um link para terminar o cadastro.',
    back: 'Voltar ao site', err: 'Algo deu errado. Tente de novo.', home: 'Voltar ao Juno Pen',
    need: { name: 'Precisamos do seu nome.', email: 'Esse e-mail não parece correto.', phone: 'Precisamos do seu número de WhatsApp, com o código do país.' },
    free: {
      eyebrow: 'Sua caneta Juno grátis', h1: 'Sua caneta Juno é por nossa conta.',
      lede: 'Diga onde enviá-la. A caneta é grátis, e seus primeiros 30 dias de Juno também. Guardamos um cartão para depois do teste: nada é cobrado hoje.',
      terms: ['US$0 hoje', 'Caneta grátis', '30 dias grátis', `Depois US${M}/mês`, 'Mínimo de 3 meses'],
      submit: 'Pedir minha caneta grátis', fine: `Seu cartão fica salvo para depois do teste. A caneta grátis vem com um mínimo de 3 meses (o mês grátis mais dois meses pagos a US${M}); se o plano terminar antes, US$50 são cobrados pela caneta. Avisamos antes de o teste acabar. Gerencie ou cancele em Configurações, Cobrança.`,
      gone: 'Todas as canetas grátis desta oferta já foram resgatadas.',
    },
    given: {
      eyebrow: 'Sua caneta Juno', h1: 'Sua caneta Juno está pronta.',
      lede: `Você já tem a caneta. Abra sua conta aqui: US${G.today} hoje cobrem seus primeiros ${G.months} meses de Juno, e depois são US${G.then} por mês.`,
      terms: [`US${G.today} hoje`, 'A caneta é sua', `${G.months} meses incluídos`, `Depois US${G.then}/mês`, 'Cancele quando quiser'],
      submit: `Começar por US${G.today}`, fine: `Hoje são cobrados US${G.today} no seu cartão, que fica salvo para o plano mensal: ele começa depois de ${G.months} meses, a menos que você cancele. Avisamos antes da primeira cobrança de US${G.then}. Cancele quando quiser em Configurações, Cobrança; a caneta continua sua.`,
      gone: '',
    },
    ph: { name: 'Sofia Henriques', email: 'voce@empresa.com.br', phone: '+55 11 91234 5678', line1: 'Av. Paulista 1000', city: 'São Paulo', state: 'SP', postcode: '01310-100', country: 'Brasil' },
  },
} as const

const INVITED: Record<SuLang, (n: string) => string> = {
  en: (n) => `${n} invited you, so your first month is free.`,
  es: (n) => `${n} te invitó, así que tu primer mes es gratis.`,
  pt: (n) => `${n} convidou você, então seu primeiro mês é grátis.`,
}

/** A price in the visitor's currency (CLP/BRL since 15 Oct, PRICES.local). */
function priceIn(item: 'monthly' | 'yearly' | 'pen', cur: 'usd' | 'clp' | 'brl'): number {
  return cur === 'usd' ? PRICES[item] : LOCAL_PRICES[cur][item]
}
const show = (n: number, cur: 'usd' | 'clp' | 'brl') => (cur === 'usd' ? fmtUsd(n) : money(n, cur))

/** What to charge today and after, for the summary under the choices. */
function summary(T: (typeof SU)[SuLang], plan: 'monthly' | 'annual', pen: boolean, cur: 'usd' | 'clp' | 'brl'): string {
  const item = plan === 'annual' ? 'yearly' : 'monthly'
  const today = Math.round((priceIn(item, cur) + (pen ? priceIn('pen', cur) : 0)) * 100) / 100
  const then = show(priceIn(item, cur), cur)
  return T.today(show(today, cur), plan === 'annual' ? T.perYear(then) : T.perMonth(then))
}

export default function SignupPage() {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const firstField = useRef<HTMLInputElement>(null)
  // The two choices, preselected from the link (?plan=annual, ?pen=1 or the older
  // ?offer=posted-pen / own-recorder) and changeable here. Read after mount: the URL isn't known
  // on the server.
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly')
  const [pen, setPen] = useState(false)
  // Chile and Brazil pay in their own currency (plan and pen).
  const [cur, setCur] = useState<'usd' | 'clp' | 'brl'>('usd')
  // The "notify me when the pen arrives" version of this form: no checkout.
  const [waitlist, setWaitlist] = useState(false)
  const [lang, setLang] = useState<SuLang>('en')
  const T = SU[lang]
  // The invited-agent link (?offer=free-pen): pen free, 30 days free, capped at 25 claims.
  const [freePen, setFreePen] = useState(false)
  // A pen handed over in person (?offer=given-pen): nothing to post, $5 for two months, no cap.
  const [givenPen, setGivenPen] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  // The offer is read from the URL after mount; until then the header stays invisible so an
  // invited agent never sees the paid-plan copy flash before "Your Juno pen is on us".
  const [ready, setReady] = useState(false)
  const [invitedBy, setInvitedBy] = useState<string | null>(null)
  const F = givenPen ? T.given : T.free
  // Either special offer swaps the header, terms and button for its own copy, and has no choices.
  const offerCopy = freePen || givenPen
  const choices = !offerCopy && !waitlist
  // The pen is sold everywhere the form is (15 Oct); kept as one switch in case a market loses it.
  const penSold = true

  useEffect(() => {
    firstField.current?.focus()
    const q = new URLSearchParams(window.location.search)
    const offer = q.get('offer')
    setGivenPen(offer === 'given-pen')
    setWaitlist(q.get('waitlist') === 'pen')
    setPlan(q.get('plan') === 'annual' || q.get('plan') === 'yearly' ? 'annual' : 'monthly')
    const c = q.get('cur')
    const local = c === 'clp' || c === 'brl' ? c : 'usd'
    setCur(local)
    // No pen preference in the link: the pen, as before 15 Oct (offer=posted-pen was the default).
    setPen(q.get('pen') === '1' || (q.get('pen') === null && offer !== 'own-recorder'))
    setReady(true)
    // Came through a friend's link: say so, and that their first month is free.
    if (offer !== 'free-pen' && offer !== 'given-pen') {
      fetch('/api/pen/signup?status=invite').then((r) => r.json()).then((j) => setInvitedBy(typeof j.first === 'string' ? j.first : null)).catch(() => {})
    }
    if (offer === 'free-pen') {
      setFreePen(true)
      fetch('/api/pen/signup?status=free-pen').then((r) => r.json()).then((j) => setRemaining(typeof j.remaining === 'number' ? j.remaining : null)).catch(() => {})
    }
    const l = q.get('lang')
    if (l === 'es' || l === 'pt') {
      setLang(l)
      document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'es'
    }
  }, [])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    setError(null)
    const f = new FormData(e.currentTarget)
    // The same checks the server makes, said before the round trip (noValidate: our wording).
    const name = String(f.get('name') ?? '').trim()
    const email = String(f.get('email') ?? '').trim()
    const phone = String(f.get('phone') ?? '').trim()
    if (name.length < 2) return setError(T.need.name)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(T.need.email)
    if (!waitlist && phone.replace(/\D/g, '').length < 7) return setError(T.need.phone)
    setState('sending')
    try {
      const url = new URLSearchParams(window.location.search)
      const offer = url.get('offer')
      const r = await postJson<{ checkoutUrl?: string | null }>('/api/pen/signup', {
        // The pen offers carry their own offer; everything else is the plan and pen chosen here.
        plan: offerCopy ? 'monthly' : plan,
        offer: offer === 'free-pen' || offer === 'given-pen' ? offer : pen && penSold ? 'posted-pen' : 'own-recorder',
        pen: !offerCopy && pen && penSold ? '1' : '0',
        name,
        email,
        phone,
        role: f.get('role'),
        ship_line1: f.get('ship_line1'),
        ship_line2: f.get('ship_line2'),
        ship_city: f.get('ship_city'),
        ship_state: f.get('ship_state'),
        ship_postcode: f.get('ship_postcode'),
        ship_country: f.get('ship_country'),
        note: f.get('note'),
        jp_hp_7: f.get('jp_hp_7'), // honeypot, see the input below
        // "Notify me when the pen arrives" (Chile, Brazil): saved, never sent to checkout.
        waitlist: url.get('waitlist') === 'pen' ? 'pen' : undefined,
        lang: url.get('lang') ?? undefined,
        cur: url.get('cur') ?? undefined,
        elapsed: Date.now() - startedAt.current,
        source: url.get('from') ?? 'landing',
      })

      // Straight to Stripe, in the same sitting, while they are still willing.
      if (r.checkoutUrl) {
        window.location.href = r.checkoutUrl
        return
      }
      setState('done')
    } catch (err) {
      setError(errMessage(err, T.err))
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="pen-root">
        <main className="pen-su-wrap">
          <div className="pen-su-done">
            <div className="pen-su-tick" aria-hidden>&#10003;</div>
            <h1 className="pen-display text-[34px] leading-tight">{T.doneH}</h1>
            <p className="mt-4 text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
              {waitlist ? T.doneWait : T.doneBody}
            </p>
            <Link href="/pen" className="pen-lp-btn pen-lp-btn-ghost mt-8 inline-flex">{T.back}</Link>
          </div>
        </main>
      </div>
    )
  }

  const monthlyPrice = show(priceIn('monthly', cur), cur)
  const yearlyPrice = show(priceIn('yearly', cur), cur)
  const penPrice = show(priceIn('pen', cur), cur)

  return (
    <div className="pen-root">
      <main className="pen-su-wrap">
        <header className="pen-su-head" style={{ opacity: ready ? 1 : 0, transition: 'opacity .15s' }}>
          <Link href="/pen" className="pen-su-back" aria-label={T.home}>
            <Image src="/juno_mark.png" alt="Juno" width={24} height={24} className="pen-mark" />
            <span aria-hidden>&larr;</span>
          </Link>
          <div className="pen-lp-eyebrow pen-su-eyebrow">{offerCopy ? F.eyebrow : T.eyebrow}</div>
          <h1 className="pen-display pen-su-h1">{offerCopy ? F.h1 : T.h1}</h1>
          <p className="mt-4 max-w-[52ch] text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
            {offerCopy ? F.lede : waitlist ? T.ledeWait : T.lede}
          </p>
          {invitedBy && !offerCopy && !waitlist && <p className="pen-invited pen-invited-inline" role="status">{INVITED[lang](invitedBy)}</p>}
          {offerCopy && (
            <ul className="pen-su-terms" aria-label="Offer terms">
              {F.terms.map((t) => <li key={t}>{t}</li>)}
            </ul>
          )}
          {freePen && remaining === 0 && <p className="pen-su-gone" role="status">{F.gone}</p>}
        </header>

        <form className="pen-su-form" onSubmit={submit} noValidate>
          {/* Hidden from people, irresistible to bots. Named so no browser autofill recognises it:
              it used to be name="company", Chrome filled it with the user's company, and every
              autofilled signup was silently dropped as a bot. */}
          <input
            type="text"
            name="jp_hp_7"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="pen-su-pot"
          />

          {choices && (
            <>
              <fieldset className="pen-su-choice">
                <legend className="pen-label">{T.plan}</legend>
                <div className="pen-su-choice-row">
                  <button type="button" className="pen-su-opt" data-on={plan === 'monthly'} aria-pressed={plan === 'monthly'} onClick={() => setPlan('monthly')}>
                    <strong>{T.monthly}</strong><span>{T.monthlyP(monthlyPrice)}</span>
                  </button>
                  <button type="button" className="pen-su-opt" data-on={plan === 'annual'} aria-pressed={plan === 'annual'} onClick={() => setPlan('annual')}>
                    <strong>{T.yearly}</strong><span>{T.yearlyP(yearlyPrice)}</span>
                  </button>
                </div>
              </fieldset>
              {penSold && (
                <fieldset className="pen-su-choice">
                  <legend className="pen-label">{T.pen}</legend>
                  <div className="pen-su-choice-row">
                    <button type="button" className="pen-su-opt" data-on={pen} aria-pressed={pen} onClick={() => setPen(true)}>
                      <strong>{T.penYes}</strong><span>{T.penYesP(penPrice)}</span>
                    </button>
                    <button type="button" className="pen-su-opt" data-on={!pen} aria-pressed={!pen} onClick={() => setPen(false)}>
                      <strong>{T.penNo}</strong><span>{T.penNoP}</span>
                    </button>
                  </div>
                </fieldset>
              )}
              <p className="pen-su-fine" style={{ textAlign: 'left', marginTop: -8 }} role="status">
                {summary(T, plan, pen && penSold, cur)}{pen && penSold ? ` ${T.penShip}` : ''}
              </p>
            </>
          )}

          <div className="pen-su-grid">
            <label className="pen-su-field">
              <span className="pen-label">{T.name}</span>
              <input ref={firstField} name="name" required autoComplete="name" placeholder={T.ph.name} />
            </label>

            <label className="pen-su-field">
              <span className="pen-label">{T.email}</span>
              <input name="email" type="email" required autoComplete="email" placeholder={T.ph.email} inputMode="email" />
            </label>

            <label className="pen-su-field">
              <span className="pen-label">{T.phone}{waitlist && <> <em>{T.optional}</em></>}</span>
              <input name="phone" type="tel" required={!waitlist} autoComplete="tel" placeholder={T.ph.phone} inputMode="tel" aria-describedby="pen-su-phone-hint" />
              <span id="pen-su-phone-hint" className="pen-su-fine" style={{ textAlign: 'left', fontSize: 13 }}>{T.phoneHint}</span>
            </label>

            <label className="pen-su-field">
              <span className="pen-label">{T.role} <em>{T.optional}</em></span>
              <select name="role" defaultValue="">
                <option value="" disabled>{T.choose}</option>
                {ROLES.map((r, i) => <option key={r} value={r}>{T.roles[i] ?? r}</option>)}
              </select>
            </label>
          </div>

          {/* Where the pen goes: asked here as soon as the pen is chosen (and for the free pen), then
              handed to Stripe so its checkout opens with the address already filled in. */}
          {(freePen || (pen && penSold && !offerCopy)) && (
          <div className="pen-su-ship">
              <div className="pen-label pen-su-ship-head">{T.ship}</div>
              <div className="pen-su-grid">
                <label className="pen-su-field pen-su-wide">
                  <span className="pen-label">{T.line1}</span>
                  <input name="ship_line1" required autoComplete="address-line1" placeholder={T.ph.line1} />
                </label>
                <label className="pen-su-field pen-su-wide">
                  <span className="pen-label">{T.line2} <em>{T.optional}</em></span>
                  <input name="ship_line2" autoComplete="address-line2" placeholder="Apt 4B" />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">{T.city}</span>
                  <input name="ship_city" required autoComplete="address-level2" placeholder={T.ph.city} />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">{T.state}</span>
                  <input name="ship_state" autoComplete="address-level1" placeholder={T.ph.state} />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">{T.postcode}</span>
                  <input name="ship_postcode" required autoComplete="postal-code" placeholder={T.ph.postcode} inputMode="numeric" />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">{T.country}</span>
                  {/* Only where we post pens for this currency: Stripe needs the two-letter code. */}
                  <select name="ship_country" autoComplete="country" defaultValue={cur === 'clp' ? 'CL' : cur === 'brl' ? 'BR' : 'US'} key={cur}>
                    {cur === 'clp' ? <option value="CL">Chile</option> : cur === 'brl' ? <option value="BR">Brasil</option> : <option value="US">United States</option>}
                  </select>
                </label>
              </div>
          </div>
          )}

          <label className="pen-su-field pen-su-wide">
            <span className="pen-label">{T.note} <em>{T.optional}</em></span>
            <textarea name="note" rows={3} placeholder={T.notePh} />
          </label>

          {error && <div className="pen-su-err" role="alert">{error}</div>}

          <button className="pen-lp-btn pen-lp-btn-primary pen-su-submit" disabled={state === 'sending'}>
            {state === 'sending' ? T.sending : offerCopy ? F.submit : T.submit}
          </button>

          <p className="pen-su-fine">
            {offerCopy ? F.fine : pen && penSold ? T.finePen : T.fine}
          </p>
          {/* Relative links: this page is /signup on the Pen domain (→ /privacy) and /pen/signup
              elsewhere (→ /pen/privacy), and both resolve to the Pen versions. */}
          <p className="pen-su-fine pen-su-agree">
            {T.agree[0]}<a href={`terms${lang === 'en' ? '' : `?lang=${lang}`}`}>{T.agree[1]}</a>{T.agree[2]}
            <a href={`privacy${lang === 'en' ? '' : `?lang=${lang}`}`}>{T.agree[3]}</a>{T.agree[4]}
          </p>
        </form>
      </main>
    </div>
  )
}
