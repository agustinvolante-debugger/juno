'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ROLES } from '@/lib/pen/signup-fields'
import { postJson, errMessage } from '@/lib/pen/http'
import '../pen-theme.css'

type State = 'idle' | 'sending' | 'done'
type SuLang = 'en' | 'es' | 'pt'

// The form in the language the landing page was in (carried as ?lang=). Role VALUES stay in
// English (they are stored and read by the owners); only their labels are translated.
const SU = {
  en: {
    eyebrow: 'Get started', h1: 'Record the meeting. Read the write-up.',
    ledePen: 'Your plan includes a recorder, so we need somewhere to post it. Takes a minute.',
    ledeOwn: 'Use the recorder you already have. Takes a minute, then your free week starts.',
    ledeWait: 'Leave your details and we’ll tell you the moment the pen arrives.',
    name: 'Your name', email: 'Email', phone: 'Phone', optional: 'optional', role: 'What do you do', choose: 'Choose one',
    roles: ['Real estate agent', 'Healthcare', 'Sales', 'Consulting', 'Founder / exec', 'Legal', 'Student or researcher', 'Something else'],
    ship: 'Where to send the recorder', line1: 'Street address', line2: 'Apartment, suite', city: 'City', state: 'State', postcode: 'ZIP / postcode', country: 'Country',
    note: 'Anything we should know', notePh: 'What you’d want it for, or what you’ve tried before.',
    submit: 'Get started', sending: 'Sending…',
    finePen: 'We use this to set up your account and post your recorder. Nothing else.', fineOwn: 'We use this to set up your account. Nothing else.',
    agree: ['By continuing you agree to the ', 'Terms', ' and ', 'Privacy Policy', '.'],
    doneH: 'You’re on the list.', doneWait: 'We’ll email you as soon as the pen is available where you are.',
    doneBody: 'There’s a confirmation in your inbox. We’ll send a link to start your free trial, and get the recorder in the post.',
    back: 'Back to the site', err: 'Something went wrong. Try again.', home: 'Back to Juno Pen',
    ph: { name: 'Chris Dyas', email: 'you@company.com', phone: '(305) 555 0142', line1: '1200 Brickell Ave', city: 'Miami', state: 'FL', postcode: '33131', country: 'United States' },
  },
  es: {
    eyebrow: 'Empieza', h1: 'Graba la reunión. Lee el resumen.',
    ledePen: 'Tu plan incluye el lápiz, así que necesitamos dónde enviarlo. Toma un minuto.',
    ledeOwn: 'Usa el celular o la grabadora que ya tienes. Toma un minuto, y empieza tu semana gratis.',
    ledeWait: 'Déjanos tus datos y te avisamos apenas llegue el lápiz.',
    name: 'Tu nombre', email: 'Correo', phone: 'Teléfono', optional: 'opcional', role: 'A qué te dedicas', choose: 'Elige una opción',
    roles: ['Corredor de propiedades', 'Salud', 'Ventas', 'Consultoría', 'Fundador / ejecutivo', 'Legal', 'Estudiante o investigador', 'Otra cosa'],
    ship: 'Dónde enviar el lápiz', line1: 'Dirección', line2: 'Depto., oficina', city: 'Ciudad', state: 'Región', postcode: 'Código postal', country: 'País',
    note: 'Algo que debamos saber', notePh: 'Para qué lo usarías, o qué has probado antes.',
    submit: 'Empezar', sending: 'Enviando…',
    finePen: 'Usamos esto para crear tu cuenta y enviarte el lápiz. Nada más.', fineOwn: 'Usamos esto para crear tu cuenta. Nada más.',
    agree: ['Al continuar aceptas los ', 'Términos', ' y la ', 'Política de privacidad', '.'],
    doneH: 'Estás en la lista.', doneWait: 'Te escribimos apenas el lápiz esté disponible donde estás.',
    doneBody: 'Te llegó una confirmación al correo. Te enviaremos un enlace para empezar tu prueba gratis.',
    back: 'Volver al sitio', err: 'Algo salió mal. Inténtalo de nuevo.', home: 'Volver a Juno Pen',
    ph: { name: 'Sofía Henríquez', email: 'tu@empresa.cl', phone: '+56 9 1234 5678', line1: 'Av. Apoquindo 3000', city: 'Santiago', state: 'RM', postcode: '7550000', country: 'Chile' },
  },
  pt: {
    eyebrow: 'Comece', h1: 'Grave a reunião. Leia o resumo.',
    ledePen: 'Seu plano inclui a caneta, então precisamos de um endereço para enviá-la. Leva um minuto.',
    ledeOwn: 'Use o celular ou o gravador que você já tem. Leva um minuto, e sua semana grátis começa.',
    ledeWait: 'Deixe seus dados e avisamos assim que a caneta chegar.',
    name: 'Seu nome', email: 'E-mail', phone: 'Telefone', optional: 'opcional', role: 'O que você faz', choose: 'Escolha uma opção',
    roles: ['Corretor de imóveis', 'Saúde', 'Vendas', 'Consultoria', 'Fundador / executivo', 'Jurídico', 'Estudante ou pesquisador', 'Outra coisa'],
    ship: 'Onde enviar a caneta', line1: 'Endereço', line2: 'Apto., sala', city: 'Cidade', state: 'Estado', postcode: 'CEP', country: 'País',
    note: 'Algo que devemos saber', notePh: 'Para que você usaria, ou o que já testou antes.',
    submit: 'Começar', sending: 'Enviando…',
    finePen: 'Usamos isso para criar sua conta e enviar sua caneta. Nada mais.', fineOwn: 'Usamos isso para criar sua conta. Nada mais.',
    agree: ['Ao continuar, você aceita os ', 'Termos', ' e a ', 'Política de privacidade', '.'],
    doneH: 'Você está na lista.', doneWait: 'Avisamos por e-mail assim que a caneta estiver disponível onde você está.',
    doneBody: 'Enviamos uma confirmação para o seu e-mail. Mandaremos um link para começar seu teste grátis.',
    back: 'Voltar ao site', err: 'Algo deu errado. Tente de novo.', home: 'Voltar ao Juno Pen',
    ph: { name: 'Sofia Henriques', email: 'voce@empresa.com.br', phone: '+55 11 91234 5678', line1: 'Av. Paulista 1000', city: 'São Paulo', state: 'SP', postcode: '01310-100', country: 'Brasil' },
  },
} as const

export default function SignupPage() {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const firstField = useRef<HTMLInputElement>(null)
  // Only pen plans ship anything. Read after mount (the URL isn't known on the server), so a
  // software-only signup never asks for a street address.
  const [shipsPen, setShipsPen] = useState(true)
  // The "notify me when the pen arrives" version of this form: no address, no checkout.
  const [waitlist, setWaitlist] = useState(false)
  const [lang, setLang] = useState<SuLang>('en')
  const T = SU[lang]

  useEffect(() => {
    firstField.current?.focus()
    const q = new URLSearchParams(window.location.search)
    setShipsPen(q.get('offer') !== 'own-recorder' && q.get('waitlist') !== 'pen')
    setWaitlist(q.get('waitlist') === 'pen')
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
    setState('sending')
    const f = new FormData(e.currentTarget)
    try {
      const url = new URLSearchParams(window.location.search)
      const r = await postJson<{ checkoutUrl?: string | null }>('/api/pen/signup', {
        // Which plan and which offer, both carried in the link. A cold-email recipient arrives
        // on ?offer=posted-pen and gets the longer trial; someone who already owns a recorder
        // starts today and gets fourteen days.
        plan: url.get('plan') === 'annual' ? 'annual' : url.get('plan') === 'halfyear' ? 'halfyear' : 'monthly',
        offer: url.get('offer') === 'own-recorder' ? 'own-recorder' : 'posted-pen',
        name: f.get('name'),
        email: f.get('email'),
        phone: f.get('phone'),
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

      // Straight to Stripe, in the same sitting, while they are still willing. Taking the card
      // now is what makes a free recorder affordable — see lib/pen/stripe.
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

  return (
    <div className="pen-root">
      <main className="pen-su-wrap">
        <header className="pen-su-head">
          <Link href="/pen" className="pen-su-back" aria-label={T.home}>
            <Image src="/juno_mark.png" alt="Juno" width={24} height={24} className="pen-mark" />
            <span aria-hidden>&larr;</span>
          </Link>
          <div className="pen-lp-eyebrow pen-su-eyebrow">{T.eyebrow}</div>
          <h1 className="pen-display pen-su-h1">{T.h1}</h1>
          <p className="mt-4 max-w-[52ch] text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
            {waitlist ? T.ledeWait : shipsPen ? T.ledePen : T.ledeOwn}
          </p>
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
              <span className="pen-label">{T.phone} <em>{T.optional}</em></span>
              <input name="phone" type="tel" autoComplete="tel" placeholder={T.ph.phone} inputMode="tel" />
            </label>

            <label className="pen-su-field">
              <span className="pen-label">{T.role}</span>
              <select name="role" defaultValue="">
                <option value="" disabled>{T.choose}</option>
                {ROLES.map((r, i) => <option key={r} value={r}>{T.roles[i] ?? r}</option>)}
              </select>
            </label>
          </div>

          {shipsPen && (
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
                  <input name="ship_country" autoComplete="country-name" defaultValue={T.ph.country} key={lang} />
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
            {state === 'sending' ? T.sending : T.submit}
          </button>

          <p className="pen-su-fine">
            {shipsPen ? T.finePen : T.fineOwn}
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
