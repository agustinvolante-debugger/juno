'use client'

import Image from 'next/image'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { safeCallback } from '@/lib/safe-callback'
import { SUPPORT_EMAIL } from '@/lib/support'

// One sign-in page for every Juno surface. Coming from Pen (callbackUrl under /pen, which is
// every Pen link) it is the Pen page, in the visitor's language; from anywhere else (the Daily
// Brief, VC, the AI stack) the same page with the plain Juno name.
//
// Two ways in: Google, or a one-time link emailed to any address (lib/auth-link.ts), so
// Outlook, Yahoo, iCloud and work addresses work too. Who is let in is the same either way.

type Lang = 'en' | 'es' | 'pt'
const T = {
  en: {
    penTitle: 'Sign in to Juno Pen',
    penSub: 'Your notes, to-dos and follow-ups, right where you left them.',
    title: 'Sign in',
    sub: 'Continue to Juno.',
    google: 'Continue with Google',
    or: 'or',
    email: 'Email',
    placeholder: 'you@example.com',
    send: 'Email me a sign-in link',
    sending: 'Sending…',
    sentTitle: 'Check your email',
    sentBody: (e: string) => `If ${e} has an account, a sign-in link is on its way. It works once, for 15 minutes.`,
    spam: 'Not in your inbox? Check your Spam or Promotions folder, and search for “Juno sign-in link”. It only goes to the email you signed up with.',
    other: 'Use a different email',
    newHere: 'New to Juno Pen?',
    start: 'Start free',
    deniedTitle: 'No account for this address',
    deniedPen: 'Sign in with the email you signed up with. If you’ve just paid, it can take a moment to come through; try again shortly.',
    denied: 'This address doesn’t have access yet.',
    expiredTitle: 'That link has expired',
    expired: 'Sign-in links work once, for 15 minutes. Send yourself a new one below.',
    failed: 'Something went wrong. Please try again.',
    help: 'Trouble signing in?',
    contact: 'Email us',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  es: {
    penTitle: 'Entra a Juno Pen',
    penSub: 'Tus notas, pendientes y seguimientos, donde los dejaste.',
    title: 'Entrar',
    sub: 'Continúa a Juno.',
    google: 'Continuar con Google',
    or: 'o',
    email: 'Correo',
    placeholder: 'tu@ejemplo.com',
    send: 'Envíame un enlace para entrar',
    sending: 'Enviando…',
    sentTitle: 'Revisa tu correo',
    sentBody: (e: string) => `Si ${e} tiene una cuenta, te enviamos un enlace para entrar. Sirve una vez, durante 15 minutos.`,
    spam: '¿No está en tu bandeja de entrada? Revisa Spam o Promociones, y busca “enlace para entrar a Juno”. Solo llega al correo con el que te registraste.',
    other: 'Usar otro correo',
    newHere: '¿Nuevo en Juno Pen?',
    start: 'Pruébalo gratis',
    deniedTitle: 'No hay una cuenta con este correo',
    deniedPen: 'Entra con el correo con el que te registraste. Si acabas de pagar, puede tardar un momento; inténtalo de nuevo en un rato.',
    denied: 'Este correo todavía no tiene acceso.',
    expiredTitle: 'Ese enlace ya expiró',
    expired: 'Los enlaces sirven una vez, durante 15 minutos. Pide uno nuevo abajo.',
    failed: 'Algo falló. Inténtalo de nuevo.',
    help: '¿Problemas para entrar?',
    contact: 'Escríbenos',
    privacy: 'Privacidad',
    terms: 'Términos',
  },
  pt: {
    penTitle: 'Entre no Juno Pen',
    penSub: 'Suas notas, tarefas e follow-ups, onde você deixou.',
    title: 'Entrar',
    sub: 'Continue para o Juno.',
    google: 'Continuar com o Google',
    or: 'ou',
    email: 'E-mail',
    placeholder: 'voce@exemplo.com',
    send: 'Me envie um link para entrar',
    sending: 'Enviando…',
    sentTitle: 'Confira seu e-mail',
    sentBody: (e: string) => `Se ${e} tem uma conta, um link para entrar está a caminho. Ele funciona uma vez, por 15 minutos.`,
    spam: 'Não está na caixa de entrada? Veja o Spam ou Promoções, e procure “link para entrar no Juno”. Ele só vai para o e-mail que você usou no cadastro.',
    other: 'Usar outro e-mail',
    newHere: 'Novo no Juno Pen?',
    start: 'Teste grátis',
    deniedTitle: 'Nenhuma conta com este e-mail',
    deniedPen: 'Entre com o e-mail que você usou no cadastro. Se acabou de pagar, pode levar um momento; tente de novo daqui a pouco.',
    denied: 'Este e-mail ainda não tem acesso.',
    expiredTitle: 'Esse link expirou',
    expired: 'Os links funcionam uma vez, por 15 minutos. Peça um novo abaixo.',
    failed: 'Algo deu errado. Tente de novo.',
    help: 'Problemas para entrar?',
    contact: 'Fale com a gente',
    privacy: 'Privacidade',
    terms: 'Termos',
  },
} satisfies Record<Lang, Record<string, unknown>>

/** The page's language: the landing page's remembered choice, then the browser's. */
function detectLang(): Lang {
  const c = /(?:^|;\s*)juno_lang=(en|es|pt)/.exec(document.cookie)?.[1] as Lang | undefined
  if (c) return c
  const n = (navigator.language || '').toLowerCase()
  return n.startsWith('pt') ? 'pt' : n.startsWith('es') ? 'es' : 'en'
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

function SignInContent() {
  const params = useSearchParams()
  const error = params.get('error')
  // Honours ?callbackUrl= so Pen, news. and vc. return people where they came from; the
  // authOptions redirect callback restricts it to *.tryjunoapp.com.
  const callbackUrl = params.get('callbackUrl') || '/dashboard'
  const fromPen = callbackUrl.includes('/pen')
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => setLang(detectLang()), [])
  const L = T[lang]

  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending')
    try {
      const r = await fetch('/api/auth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, callbackUrl: safeCallback(callbackUrl), lang }),
      })
      setState(r.ok ? 'sent' : 'failed')
    } catch {
      setState('failed')
    }
  }

  const alert =
    error === 'AccessDenied'
      ? { title: L.deniedTitle, body: fromPen ? L.deniedPen : L.denied }
      : error === 'CredentialsSignin'
        ? { title: L.expiredTitle, body: L.expired }
        : error
          ? { title: L.failed, body: '' }
          : null

  return (
    <main className="auth-card">
      <Link href="/" className="auth-brand" aria-label="Juno">
        <Image src="/juno_mark.png" alt="" width={36} height={36} className="auth-mark" priority />
        <span className="auth-word">{fromPen ? 'Juno Pen' : 'Juno'}</span>
      </Link>

      {state === 'sent' ? (
        <div className="auth-sent" aria-live="polite">
          <div className="auth-sent-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </div>
          <h1 className="auth-title" style={{ marginTop: 0 }}>{L.sentTitle}</h1>
          <p className="auth-sub">{L.sentBody(email.trim())}</p>
          <p className="auth-alert" style={{ textAlign: 'left' }}>{L.spam}</p>
          <button type="button" className="auth-btn auth-btn-quiet" onClick={() => setState('idle')}>
            {L.other}
          </button>
        </div>
      ) : (
        <>
          <h1 className="auth-title">{fromPen ? L.penTitle : L.title}</h1>
          <p className="auth-sub">{fromPen ? L.penSub : L.sub}</p>

          {alert && (
            <div className="auth-alert" role="alert">
              <strong>{alert.title}</strong>
              {alert.body}
            </div>
          )}

          <button type="button" className="auth-btn auth-btn-google" onClick={() => signIn('google', { callbackUrl })}>
            <GoogleG />
            {L.google}
          </button>

          <div className="auth-or">{L.or}</div>

          <form onSubmit={sendLink}>
            <label className="auth-label" htmlFor="auth-email">{L.email}</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder={L.placeholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="auth-btn auth-btn-primary" disabled={state === 'sending'}>
              {state === 'sending' ? L.sending : L.send}
            </button>
            {state === 'failed' && <p className="auth-note" role="alert" style={{ color: 'var(--bad)' }}>{L.failed}</p>}
          </form>

          {fromPen && (
            <p className="auth-note">
              {L.newHere} <a href="/pen/signup?from=signin">{L.start}</a>
            </p>
          )}
        </>
      )}

      <nav className="auth-foot">
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Sign-in%20help`}>{L.help} {L.contact}</a>
        {fromPen && <a href={`/privacy${lang === 'en' ? '' : `?lang=${lang}`}`}>{L.privacy}</a>}
        {fromPen && <a href={`/terms${lang === 'en' ? '' : `?lang=${lang}`}`}>{L.terms}</a>}
      </nav>
    </main>
  )
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}
