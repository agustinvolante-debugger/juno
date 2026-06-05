'use client'
import { useState } from 'react'

// First-run "how to start" callouts. Shown to a signed-in user who has no topics/videos yet
// and hasn't dismissed it. Spans the full grid width; dismiss persists in prefs.layout.onboarded.
export default function Onboarding({ lang = 'en' }: { lang?: string }) {
  const [busy, setBusy] = useState(false)
  const es = lang === 'es'

  async function dismiss() {
    setBusy(true)
    try {
      await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { onboarded: true } }) })
      location.reload()
    } finally { setBusy(false) }
  }

  const steps = es
    ? [
        { n: '1', t: 'Brief me', d: 'Escribe cualquier tema arriba — una empresa, un partido, un sector — y recibe un resumen de 30 segundos antes de una reunión.' },
        { n: '2', t: 'Set up my feed', d: 'Dile qué te interesa y te propone secciones listas para guardar.' },
        { n: '3', t: 'Add a video section', d: 'Nombra unos canales de YouTube y arma una estantería de videos “recién subidos”.' },
        { n: '4', t: '🌍 Mercados', d: 'Abre el menú de Mercados (arriba a la derecha del ticker) para ver datos por país y fijar lo que sigues.' },
      ]
    : [
        { n: '1', t: 'Brief me', d: 'Type any topic up top — a company, a game, a sector — for a 30-second briefing before a meeting.' },
        { n: '2', t: 'Set up my feed', d: 'Tell it what you’re into and it proposes ready-made sections you can keep with one click.' },
        { n: '3', t: 'Add a video section', d: 'Name a few YouTube channels and it builds a “just dropped” video shelf for you.' },
        { n: '4', t: '🌍 Markets', d: 'Open the Markets menu (top-right of the belt) to browse live data by country and pin what you watch.' },
      ]

  return (
    <section style={{ gridColumn: '1 / -1' }} className="rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <span className="text-[13px] font-bold">👋 {es ? 'Bienvenido a tu Daily Brief — así se empieza' : 'Welcome to your Daily Brief — here’s how to start'}</span>
        <button onClick={dismiss} disabled={busy} className="text-[11px] text-neutral-400 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100">{busy ? '…' : es ? 'ocultar ✕' : 'got it ✕'}</button>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">{s.n}</span>
              <span className="text-[12.5px] font-bold">{s.t}</span>
            </div>
            <p className="text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-400">{s.d}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-400 dark:border-neutral-800">
        {es ? 'Esto desaparece cuando agregas tu primer tema. Abajo ya tienes el feed listo.' : 'This disappears once you add your first topic. Your feed is ready below.'}
      </div>
    </section>
  )
}
