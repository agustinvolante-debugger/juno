'use client'

import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

// Where an emailed sign-in link lands (lib/auth-link.ts). Nothing is spent by opening it:
// Outlook's Safe Links and other scanners open every link in an email, so only the button
// uses the token. An expired or used link comes back to the sign-in page with a message.

type Lang = 'en' | 'es' | 'pt'
const T: Record<Lang, { title: string; sub: string; button: string; working: string }> = {
  en: { title: 'You’re almost in', sub: 'Tap to finish signing in on this device.', button: 'Sign in', working: 'Signing in…' },
  es: { title: 'Ya casi estás', sub: 'Toca para terminar de entrar en este dispositivo.', button: 'Entrar', working: 'Entrando…' },
  pt: { title: 'Quase lá', sub: 'Toque para terminar de entrar neste dispositivo.', button: 'Entrar', working: 'Entrando…' },
}

function detectLang(): Lang {
  const c = /(?:^|;\s*)juno_lang=(en|es|pt)/.exec(document.cookie)?.[1] as Lang | undefined
  if (c) return c
  const n = (navigator.language || '').toLowerCase()
  return n.startsWith('pt') ? 'pt' : n.startsWith('es') ? 'es' : 'en'
}

function EmailLinkContent() {
  const params = useSearchParams()
  const token = params.get('t') ?? ''
  const cb = params.get('callbackUrl') ?? '/pen'
  const callbackUrl = cb.startsWith('/') && !cb.startsWith('//') ? cb : '/pen'
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => setLang(detectLang()), [])
  const [working, setWorking] = useState(false)
  const L = T[lang]
  const fromPen = callbackUrl.includes('/pen')

  return (
    <main className="auth-card">
      <div className="auth-brand">
        <Image src="/juno_mark.png" alt="" width={36} height={36} className="auth-mark" priority />
        <span className="auth-word">{fromPen ? 'Juno Pen' : 'Juno'}</span>
      </div>
      <h1 className="auth-title">{L.title}</h1>
      <p className="auth-sub">{L.sub}</p>
      <button
        type="button"
        className="auth-btn auth-btn-primary"
        disabled={working || !token}
        onClick={() => {
          setWorking(true)
          // On failure NextAuth returns to /auth/signin?error=CredentialsSignin, which explains.
          void signIn('email-link', { token, callbackUrl })
        }}
      >
        {working ? L.working : L.button}
      </button>
    </main>
  )
}

export default function EmailLink() {
  return (
    <Suspense>
      <EmailLinkContent />
    </Suspense>
  )
}
