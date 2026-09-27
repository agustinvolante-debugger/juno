'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { postJson, errMessage } from '@/lib/pen/http'
import { useCopy, useLang } from '../../LangContext'
import { fmtDate, type Copy } from '@/lib/pen/i18n'

const DAYS = [30, 60, 90] as const

const BP_EN = {
  pauseTitle: 'Need a break?',
  pauseLede: 'Pause your plan instead of cancelling. We stop charging, and it starts again by itself on the date below. Your recordings, notes and search stay open the whole time.',
  days: (n: number) => `${n} days`,
  until: (d: string) => `No charges until ${d}. Anything you record while paused is kept and transcribed when the pause ends.`,
  pause: (n: number) => `Pause for ${n} days`,
  pausing: 'Pausing…',
  pausedTitle: 'Your plan is paused',
  pausedLede: (d: string) => `No charges until ${d}, when it starts again by itself. New recordings are kept and wait until then.`,
  resume: 'Resume now',
  resuming: 'Resuming…',
  resumed: 'Your plan is running again.',
  resumedHeld: (n: number) => ` ${n} waiting ${n === 1 ? 'recording is' : 'recordings are'} being transcribed now.`,
  paused: (d: string) => `Paused until ${d}.`,
  failed: 'That didn’t go through. Try again.',
  stripeTitle: 'Card, invoices and cancelling',
  stripeLede: 'Change your card, download invoices or cancel. This opens our payment provider, Stripe, and brings you back here.',
  open: 'Open billing',
  noStripe: 'Your account isn’t billed through Stripe, so there is nothing to manage here.',
}

const BP: Copy<typeof BP_EN> = {
  en: BP_EN,
  es: {
    pauseTitle: '¿Necesitas un descanso?',
    pauseLede: 'Pausa tu plan en vez de cancelarlo. Dejamos de cobrar y se reactiva solo en la fecha de abajo. Tus grabaciones, notas y búsqueda siguen disponibles todo el tiempo.',
    days: (n) => `${n} días`,
    until: (d) => `Sin cobros hasta el ${d}. Lo que grabes durante la pausa se guarda y se transcribe cuando termine.`,
    pause: (n) => `Pausar ${n} días`,
    pausing: 'Pausando…',
    pausedTitle: 'Tu plan está en pausa',
    pausedLede: (d) => `Sin cobros hasta el ${d}, cuando se reactiva solo. Las grabaciones nuevas se guardan y esperan hasta entonces.`,
    resume: 'Reactivar ahora',
    resuming: 'Reactivando…',
    resumed: 'Tu plan está activo de nuevo.',
    resumedHeld: (n) => (n === 1 ? ' 1 grabación en espera se está transcribiendo ahora.' : ` ${n} grabaciones en espera se están transcribiendo ahora.`),
    paused: (d) => `En pausa hasta el ${d}.`,
    failed: 'No se pudo completar. Inténtalo de nuevo.',
    stripeTitle: 'Tarjeta, facturas y cancelación',
    stripeLede: 'Cambia tu tarjeta, descarga facturas o cancela. Se abre nuestro proveedor de pagos, Stripe, y vuelves aquí.',
    open: 'Abrir facturación',
    noStripe: 'Tu cuenta no se cobra a través de Stripe, así que no hay nada que gestionar aquí.',
  },
  pt: {
    pauseTitle: 'Precisa de uma pausa?',
    pauseLede: 'Pause seu plano em vez de cancelar. Paramos de cobrar e ele volta sozinho na data abaixo. Suas gravações, notas e busca continuam disponíveis o tempo todo.',
    days: (n) => `${n} dias`,
    until: (d) => `Sem cobranças até ${d}. O que você gravar durante a pausa fica guardado e é transcrito quando ela terminar.`,
    pause: (n) => `Pausar por ${n} dias`,
    pausing: 'Pausando…',
    pausedTitle: 'Seu plano está pausado',
    pausedLede: (d) => `Sem cobranças até ${d}, quando ele volta sozinho. As gravações novas ficam guardadas e esperam até lá.`,
    resume: 'Retomar agora',
    resuming: 'Retomando…',
    resumed: 'Seu plano está ativo de novo.',
    resumedHeld: (n) => (n === 1 ? ' 1 gravação em espera está sendo transcrita agora.' : ` ${n} gravações em espera estão sendo transcritas agora.`),
    paused: (d) => `Pausado até ${d}.`,
    failed: 'Não deu certo. Tente de novo.',
    stripeTitle: 'Cartão, faturas e cancelamento',
    stripeLede: 'Troque o cartão, baixe faturas ou cancele. Isso abre nosso provedor de pagamentos, a Stripe, e traz você de volta.',
    open: 'Abrir cobrança',
    noStripe: 'Sua conta não é cobrada pela Stripe, então não há nada para gerenciar aqui.',
  },
}

export default function BillingPanel({ pausedUntil, pausable, hasStripe }: { pausedUntil: string | null; pausable: boolean; hasStripe: boolean }) {
  const T = useCopy(BP)
  const lang = useLang()
  const router = useRouter()
  const [days, setDays] = useState<(typeof DAYS)[number]>(30)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const day = (d: string | number) => fmtDate(d, lang, { day: 'numeric', month: 'long', year: 'numeric' })

  async function pause() {
    setErr(null); setDone(null); setBusy(true)
    try {
      const j = await postJson<{ pausedUntil: string }>('/api/pen/billing/pause', { days })
      setDone(T.paused(day(j.pausedUntil)))
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(false)
    }
  }

  async function resume() {
    setErr(null); setDone(null); setBusy(true)
    try {
      const j = await postJson<{ started: number }>('/api/pen/billing/resume', {})
      setDone(T.resumed + (j.started ? T.resumedHeld(j.started) : ''))
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pen-set-stack">
      {(pausedUntil || pausable || done) && (
        <div className="pen-set-card">
          {pausedUntil ? (
            <>
              <div className="pen-set-card-head">
                <h2 className="pen-set-h2">{T.pausedTitle}</h2>
                <p className="pen-set-lede">{T.pausedLede(day(pausedUntil))}</p>
              </div>
              {done && <div className="pen-set-ok" role="status">{done}</div>}
              {err && <div className="pen-su-err">{err}</div>}
              <div className="pen-set-actions">
                <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={resume} disabled={busy}>
                  {busy ? T.resuming : T.resume}
                </button>
              </div>
            </>
          ) : pausable ? (
            <>
              <div className="pen-set-card-head">
                <h2 className="pen-set-h2">{T.pauseTitle}</h2>
                <p className="pen-set-lede">{T.pauseLede}</p>
              </div>
              {err && <div className="pen-su-err">{err}</div>}
              <div className="pen-set-chips">
                {DAYS.map((d) => (
                  <button type="button" key={d} className="pen-set-chip" data-on={days === d} aria-pressed={days === d} onClick={() => setDays(d)}>
                    {T.days(d)}
                  </button>
                ))}
              </div>
              <p className="pen-set-fine">{T.until(day(Date.now() + days * 86400000))}</p>
              <div className="pen-set-actions">
                <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={pause} disabled={busy}>
                  {busy ? T.pausing : T.pause(days)}
                </button>
              </div>
            </>
          ) : (
            done && <div className="pen-set-ok" role="status">{done}</div>
          )}
        </div>
      )}

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.stripeTitle}</h2>
          <p className="pen-set-lede">{hasStripe ? T.stripeLede : T.noStripe}</p>
        </div>
        {hasStripe && (
          <div className="pen-set-actions">
            <a href="/api/pen/billing" className="pen-btn pen-set-pay">{T.open}</a>
          </div>
        )}
      </div>
    </div>
  )
}
