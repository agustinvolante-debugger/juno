'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { postJson, errMessage } from '@/lib/pen/http'
import { useCopy, useLang } from '../../LangContext'
import { fmtDate, type Copy } from '@/lib/pen/i18n'
import type { Clock } from '@/lib/pen/access'

const DAYS = [30, 60, 90] as const
const DAY = 86_400_000

// Stripe's own cancellation reasons (lib/pen/stripe.ts CANCEL_FEEDBACK), in the order asked.
const REASONS = ['unused', 'too_expensive', 'missing_features', 'low_quality', 'too_complex', 'switched_service', 'other'] as const
type Reason = (typeof REASONS)[number]

const BP_EN = {
  // Plan status and the countdown
  planTitle: 'Your plan',
  renews: (d: string) => `Renews on ${d}.`,
  trialTitle: 'Free trial',
  trialLede: (n: string, d: string) => `${n} left. Your first charge is on ${d}, unless you cancel before then.`,
  endingTitle: 'Your plan is cancelled',
  endingLede: (n: string, last: string, del: string) => `${n} of full access left, through ${last}. Nothing more will be charged. After that your account is read-only until ${del}, then deleted.`,
  keep: 'Keep my plan',
  keeping: 'Keeping it…',
  kept: 'Your plan is running again. Nothing changes.',
  readonlyTitle: 'Your account is read-only',
  readonlyLede: (n: string, d: string) => `Your plan has ended. You can open every recording, note and transcript for another ${n}, until ${d}; then the account is deleted. Reactivate to record, search and chat again.`,
  reactivate: 'Reactivate',
  reactivating: 'Opening checkout…',
  back: 'Welcome back. Everything is on again.',
  days: (n: number) => (n === 1 ? '1 day' : `${n} days`),

  // Pause
  pauseTitle: 'Need a break?',
  pauseLede: 'Pause your plan instead of cancelling. We stop charging, and it starts again by itself on the date below. Your recordings, notes and search stay open the whole time.',
  until: (d: string) => `No charges until ${d}. While paused you can read everything but can’t add new recordings.`,
  pause: (n: number) => `Pause for ${n} days`,
  pausing: 'Pausing…',
  pausedTitle: 'Your plan is paused',
  pausedLede: (d: string) => `No charges until ${d}, when it starts again by itself. Resume now to add recordings again.`,
  resume: 'Resume now',
  resuming: 'Resuming…',
  resumed: 'Your plan is running again.',
  resumedHeld: (n: number) => ` ${n} waiting ${n === 1 ? 'recording is' : 'recordings are'} being transcribed now.`,
  paused: (d: string) => `Paused until ${d}.`,
  failed: 'That didn’t go through. Try again.',

  // Stripe
  stripeTitle: 'Card and invoices',
  stripeLede: 'Change your card or download invoices. This opens our payment provider, Stripe, and brings you back here.',
  open: 'Open billing',
  noStripe: 'Your account has free access: there’s no card, plan or invoice to manage.',

  // Cancelling
  cancelTitle: 'Cancel your plan',
  cancelLede: (d: string) => `Your plan runs until ${d} either way. Cancelling stops the next charge.`,
  cancelStart: 'Cancel plan…',
  whyTitle: 'Before you go, what’s the main reason?',
  why: {
    unused: 'I don’t use it enough',
    too_expensive: 'It costs too much',
    missing_features: 'It’s missing something I need',
    low_quality: 'The notes aren’t good enough',
    too_complex: 'It’s too hard to use',
    switched_service: 'I’m switching to another tool',
    other: 'Something else',
  } as Record<Reason, string>,
  commentLabel: 'Anything we should know?',
  commentHint: 'Optional. A person reads every one.',
  next: 'Continue',
  never: 'Never mind',
  loseTitle: 'What happens when you cancel',
  loseAdd: (d: string) => `From ${d}, you can’t add recordings: no uploads, no pen, no WhatsApp.`,
  loseAi: 'Search, chat, briefings and every other AI feature turn off.',
  loseKeep: (d: string) => `You can still open every recording, note and transcript until ${d}. Then the account and its recordings are deleted.`,
  loseTrial: 'Your trial ends then and you’re never charged.',
  loseRefund: 'Nothing more is charged. There is no refund for the rest of this period, and you keep full access until it ends.',
  losePen: 'The pen is yours to keep.',
  loseBack: 'Change your mind before then and one click keeps your plan. After, Reactivate brings everything back.',
  pauseInstead: 'Would a break do? Pause for 30 days instead: no charges, and everything stays readable.',
  pauseInsteadBtn: 'Pause for 30 days instead',
  confirm: 'Cancel my plan',
  confirming: 'Cancelling…',
  cancelled: (d: string) => `Cancelled. You keep full access through ${d}. We sent you an email with the details.`,
}

const BP: Copy<typeof BP_EN> = {
  en: BP_EN,
  es: {
    planTitle: 'Tu plan',
    renews: (d) => `Se renueva el ${d}.`,
    trialTitle: 'Prueba gratis',
    trialLede: (n, d) => `Te quedan ${n}. El primer cobro es el ${d}, salvo que canceles antes.`,
    endingTitle: 'Tu plan está cancelado',
    endingLede: (n, last, del) => `Te quedan ${n} de acceso completo, hasta el ${last}. No se cobrará nada más. Después tu cuenta queda solo de lectura hasta el ${del}, y luego se elimina.`,
    keep: 'Mantener mi plan',
    keeping: 'Manteniéndolo…',
    kept: 'Tu plan sigue activo. No cambia nada.',
    readonlyTitle: 'Tu cuenta es solo de lectura',
    readonlyLede: (n, d) => `Tu plan terminó. Puedes abrir todas tus grabaciones, notas y transcripciones por ${n} más, hasta el ${d}; luego la cuenta se elimina. Reactívala para grabar, buscar y chatear de nuevo.`,
    reactivate: 'Reactivar',
    reactivating: 'Abriendo el pago…',
    back: 'Qué bueno tenerte de vuelta. Todo está activo otra vez.',
    days: (n) => (n === 1 ? '1 día' : `${n} días`),
    pauseTitle: '¿Necesitas un descanso?',
    pauseLede: 'Pausa tu plan en vez de cancelarlo. Dejamos de cobrar y se reactiva solo en la fecha de abajo. Tus grabaciones, notas y búsqueda siguen disponibles todo el tiempo.',
    until: (d) => `Sin cobros hasta el ${d}. Durante la pausa puedes ver todo, pero no agregar grabaciones nuevas.`,
    pause: (n) => `Pausar ${n} días`,
    pausing: 'Pausando…',
    pausedTitle: 'Tu plan está en pausa',
    pausedLede: (d) => `Sin cobros hasta el ${d}, cuando se reactiva solo. Reactívalo ahora para volver a agregar grabaciones.`,
    resume: 'Reactivar ahora',
    resuming: 'Reactivando…',
    resumed: 'Tu plan está activo de nuevo.',
    resumedHeld: (n) => (n === 1 ? ' 1 grabación en espera se está transcribiendo ahora.' : ` ${n} grabaciones en espera se están transcribiendo ahora.`),
    paused: (d) => `En pausa hasta el ${d}.`,
    failed: 'No se pudo completar. Inténtalo de nuevo.',
    stripeTitle: 'Tarjeta y facturas',
    stripeLede: 'Cambia tu tarjeta o descarga facturas. Se abre nuestro proveedor de pagos, Stripe, y vuelves aquí.',
    open: 'Abrir facturación',
    noStripe: 'Tu cuenta tiene acceso gratuito: no hay tarjeta, plan ni facturas que gestionar.',
    cancelTitle: 'Cancelar tu plan',
    cancelLede: (d) => `Tu plan sigue hasta el ${d} de todas formas. Cancelar evita el próximo cobro.`,
    cancelStart: 'Cancelar plan…',
    whyTitle: 'Antes de irte, ¿cuál es la razón principal?',
    why: {
      unused: 'No lo uso lo suficiente',
      too_expensive: 'Es muy caro',
      missing_features: 'Le falta algo que necesito',
      low_quality: 'Las notas no son lo bastante buenas',
      too_complex: 'Es difícil de usar',
      switched_service: 'Me cambio a otra herramienta',
      other: 'Otra razón',
    },
    commentLabel: '¿Algo que debamos saber?',
    commentHint: 'Opcional. Una persona lee cada respuesta.',
    next: 'Continuar',
    never: 'Mejor no',
    loseTitle: 'Qué pasa si cancelas',
    loseAdd: (d) => `Desde el ${d}, no puedes agregar grabaciones: ni subidas, ni lápiz, ni WhatsApp.`,
    loseAi: 'La búsqueda, el chat, los resúmenes por correo y todas las funciones de IA se apagan.',
    loseKeep: (d) => `Puedes seguir abriendo todas tus grabaciones, notas y transcripciones hasta el ${d}. Luego la cuenta y sus grabaciones se eliminan.`,
    loseTrial: 'Tu prueba termina ese día y nunca se te cobra.',
    loseRefund: 'No se cobra nada más. No hay reembolso por el resto de este período, y mantienes acceso completo hasta que termine.',
    losePen: 'El lápiz es tuyo, quédatelo.',
    loseBack: 'Si cambias de opinión antes, un clic mantiene tu plan. Después, Reactivar trae todo de vuelta.',
    pauseInstead: '¿Te sirve un descanso? Pausa 30 días: sin cobros y todo sigue disponible para leer.',
    pauseInsteadBtn: 'Pausar 30 días',
    confirm: 'Cancelar mi plan',
    confirming: 'Cancelando…',
    cancelled: (d) => `Cancelado. Mantienes acceso completo hasta el ${d}. Te enviamos un correo con los detalles.`,
  },
  pt: {
    planTitle: 'Seu plano',
    renews: (d) => `Renova em ${d}.`,
    trialTitle: 'Teste grátis',
    trialLede: (n, d) => `Faltam ${n}. A primeira cobrança é em ${d}, a menos que você cancele antes.`,
    endingTitle: 'Seu plano foi cancelado',
    endingLede: (n, last, del) => `Faltam ${n} de acesso completo, até ${last}. Nada mais será cobrado. Depois a conta fica somente leitura até ${del}, e então é excluída.`,
    keep: 'Manter meu plano',
    keeping: 'Mantendo…',
    kept: 'Seu plano continua ativo. Nada muda.',
    readonlyTitle: 'Sua conta é somente leitura',
    readonlyLede: (n, d) => `Seu plano terminou. Você pode abrir todas as gravações, notas e transcrições por mais ${n}, até ${d}; depois a conta é excluída. Reative para gravar, buscar e conversar de novo.`,
    reactivate: 'Reativar',
    reactivating: 'Abrindo o pagamento…',
    back: 'Que bom ter você de volta. Está tudo ativo de novo.',
    days: (n) => (n === 1 ? '1 dia' : `${n} dias`),
    pauseTitle: 'Precisa de uma pausa?',
    pauseLede: 'Pause seu plano em vez de cancelar. Paramos de cobrar e ele volta sozinho na data abaixo. Suas gravações, notas e busca continuam disponíveis o tempo todo.',
    until: (d) => `Sem cobranças até ${d}. Durante a pausa você vê tudo, mas não pode adicionar gravações novas.`,
    pause: (n) => `Pausar por ${n} dias`,
    pausing: 'Pausando…',
    pausedTitle: 'Seu plano está pausado',
    pausedLede: (d) => `Sem cobranças até ${d}, quando ele volta sozinho. Retome agora para voltar a adicionar gravações.`,
    resume: 'Retomar agora',
    resuming: 'Retomando…',
    resumed: 'Seu plano está ativo de novo.',
    resumedHeld: (n) => (n === 1 ? ' 1 gravação em espera está sendo transcrita agora.' : ` ${n} gravações em espera estão sendo transcritas agora.`),
    paused: (d) => `Pausado até ${d}.`,
    failed: 'Não deu certo. Tente de novo.',
    stripeTitle: 'Cartão e faturas',
    stripeLede: 'Troque o cartão ou baixe faturas. Isso abre nosso provedor de pagamentos, a Stripe, e traz você de volta.',
    open: 'Abrir cobrança',
    noStripe: 'Sua conta tem acesso gratuito: não há cartão, plano nem faturas para gerenciar.',
    cancelTitle: 'Cancelar seu plano',
    cancelLede: (d) => `Seu plano continua até ${d} de qualquer forma. Cancelar evita a próxima cobrança.`,
    cancelStart: 'Cancelar plano…',
    whyTitle: 'Antes de ir, qual é o motivo principal?',
    why: {
      unused: 'Não uso o suficiente',
      too_expensive: 'Está caro demais',
      missing_features: 'Falta algo de que preciso',
      low_quality: 'As notas não são boas o bastante',
      too_complex: 'É difícil de usar',
      switched_service: 'Vou mudar para outra ferramenta',
      other: 'Outro motivo',
    },
    commentLabel: 'Algo que devemos saber?',
    commentHint: 'Opcional. Uma pessoa lê cada resposta.',
    next: 'Continuar',
    never: 'Deixa pra lá',
    loseTitle: 'O que acontece se você cancelar',
    loseAdd: (d) => `A partir de ${d}, não dá para adicionar gravações: nem envios, nem caneta, nem WhatsApp.`,
    loseAi: 'Busca, chat, resumos por e-mail e todos os recursos de IA são desligados.',
    loseKeep: (d) => `Você ainda abre todas as gravações, notas e transcrições até ${d}. Depois a conta e as gravações são excluídas.`,
    loseTrial: 'Seu teste termina nesse dia e você nunca é cobrado.',
    loseRefund: 'Nada mais é cobrado. Não há reembolso pelo resto deste período, e você mantém acesso completo até ele terminar.',
    losePen: 'A caneta é sua, pode ficar com ela.',
    loseBack: 'Se mudar de ideia antes, um clique mantém seu plano. Depois, Reativar traz tudo de volta.',
    pauseInstead: 'Uma pausa resolve? Pause por 30 dias: sem cobranças, e tudo continua disponível para ler.',
    pauseInsteadBtn: 'Pausar por 30 dias',
    confirm: 'Cancelar meu plano',
    confirming: 'Cancelando…',
    cancelled: (d) => `Cancelado. Você mantém acesso completo até ${d}. Enviamos um e-mail com os detalhes.`,
  },
}

export default function BillingPanel({
  pausedUntil,
  pausable,
  hasStripe,
  clock,
  renewsAt,
  cancelable,
  endsAt,
  trial,
  keepsPen,
  back,
}: {
  pausedUntil: string | null
  pausable: boolean
  hasStripe: boolean
  /** Trial days left, full-access days left after cancelling, or days until deletion. */
  clock: Clock | null
  /** A running paid plan's next charge. */
  renewsAt: string | null
  cancelable: boolean
  /** When a cancellation made now would take effect: the end of the trial or paid period. */
  endsAt: string | null
  trial: boolean
  keepsPen: boolean
  /** Just came back from the reactivation checkout. */
  back: boolean
}) {
  const T = useCopy(BP)
  const lang = useLang()
  const router = useRouter()
  const [days, setDays] = useState<(typeof DAYS)[number]>(30)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(back ? T.back : null)
  const [step, setStep] = useState<'idle' | 'why' | 'confirm'>('idle')
  const [reason, setReason] = useState<Reason | null>(null)
  const [comment, setComment] = useState('')
  const day = (d: string | number | Date) => fmtDate(d instanceof Date ? d.getTime() : d, lang, { day: 'numeric', month: 'long', year: 'numeric' })
  const lastDay = (iso: string) => day(new Date(new Date(iso).getTime() - DAY))
  // "12 days" → "days", for under the big number.
  const unitOf = (n: number) => T.days(n).replace(/^\d+\s*/, '')
  const deleteAfter = (iso: string) => day(new Date(new Date(iso).getTime() + 365 * DAY))

  async function run<J>(key: string, url: string, body: unknown, ok: (j: J) => string | null) {
    setErr(null); setDone(null); setBusy(key)
    try {
      const j = await postJson<J>(url, body)
      const msg = ok(j)
      if (msg !== null) setDone(msg)
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(null)
    }
  }

  const pause = (n: number) => run<{ pausedUntil: string }>('pause', '/api/pen/billing/pause', { days: n }, (j) => { setStep('idle'); return T.paused(day(j.pausedUntil)) })
  const resume = () => run<{ started: number }>('resume', '/api/pen/billing/resume', {}, (j) => T.resumed + (j.started ? T.resumedHeld(j.started) : ''))
  const keep = () => run('keep', '/api/pen/billing/keep', {}, () => T.kept)
  const cancel = () =>
    run<{ cancelAt: string }>('cancel', '/api/pen/billing/cancel', { reason, comment }, (j) => {
      setStep('idle')
      return T.cancelled(lastDay(j.cancelAt))
    })
  async function reactivate() {
    setErr(null); setBusy('reactivate')
    try {
      const j = await postJson<{ url: string }>('/api/pen/billing/reactivate', {})
      window.location.href = j.url
    } catch (e) {
      setErr(errMessage(e, T.failed))
      setBusy(null)
    }
  }

  // The status card: what the plan is doing, and the countdown.
  let status: React.ReactNode = null
  if (clock?.state === 'readonly') {
    status = (
      <StatusCard title={T.readonlyTitle} lede={T.readonlyLede(T.days(clock.days), day(clock.until))} tone="warn" days={clock.days} unit={unitOf(clock.days)}>
        <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={reactivate} disabled={!!busy}>
          {busy === 'reactivate' ? T.reactivating : T.reactivate}
        </button>
      </StatusCard>
    )
  } else if (clock?.state === 'ending') {
    status = (
      <StatusCard title={T.endingTitle} lede={T.endingLede(T.days(clock.days), lastDay(clock.until), deleteAfter(clock.until))} tone="warn" days={clock.days} unit={unitOf(clock.days)}>
        <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={keep} disabled={!!busy}>
          {busy === 'keep' ? T.keeping : T.keep}
        </button>
      </StatusCard>
    )
  } else if (clock?.state === 'trial') {
    status = <StatusCard title={T.trialTitle} lede={T.trialLede(T.days(clock.days), day(clock.until))} days={clock.days} unit={unitOf(clock.days)} />
  } else if (renewsAt && !pausedUntil) {
    status = <StatusCard title={T.planTitle} lede={T.renews(day(renewsAt))} />
  }

  const ending = clock?.state === 'ending' || clock?.state === 'readonly'

  return (
    <div className="pen-set-stack">
      {done && <div className="pen-set-ok" role="status">{done}</div>}
      {err && step === 'idle' && <div className="pen-su-err">{err}</div>}
      {status}

      {!ending && (pausedUntil || pausable) && (
        <div className="pen-set-card">
          {pausedUntil ? (
            <>
              <div className="pen-set-card-head">
                <h2 className="pen-set-h2">{T.pausedTitle}</h2>
                <p className="pen-set-lede">{T.pausedLede(day(pausedUntil))}</p>
              </div>
              <div className="pen-set-actions">
                <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={resume} disabled={!!busy}>
                  {busy === 'resume' ? T.resuming : T.resume}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="pen-set-card-head">
                <h2 className="pen-set-h2">{T.pauseTitle}</h2>
                <p className="pen-set-lede">{T.pauseLede}</p>
              </div>
              <div className="pen-set-chips">
                {DAYS.map((d) => (
                  <button type="button" key={d} className="pen-set-chip" data-on={days === d} aria-pressed={days === d} onClick={() => setDays(d)}>
                    {T.days(d)}
                  </button>
                ))}
              </div>
              <p className="pen-set-fine">{T.until(day(Date.now() + days * DAY))}</p>
              <div className="pen-set-actions">
                <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={() => pause(days)} disabled={!!busy}>
                  {busy === 'pause' ? T.pausing : T.pause(days)}
                </button>
              </div>
            </>
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

      {cancelable && endsAt && (
        <div className="pen-set-card pen-cancel" data-step={step}>
          <div className="pen-set-card-head">
            <h2 className="pen-set-h2">{step === 'why' ? T.whyTitle : step === 'confirm' ? T.loseTitle : T.cancelTitle}</h2>
            {step === 'idle' && <p className="pen-set-lede">{T.cancelLede(lastDay(endsAt))}</p>}
          </div>

          {step === 'idle' && (
            <div className="pen-set-actions">
              <button type="button" className="pen-btn pen-cancel-quiet" onClick={() => { setErr(null); setDone(null); setStep('why') }}>
                {T.cancelStart}
              </button>
            </div>
          )}

          {step === 'why' && (
            <>
              <div className="pen-cancel-reasons" role="radiogroup" aria-label={T.whyTitle}>
                {REASONS.map((r) => (
                  <button type="button" key={r} role="radio" aria-checked={reason === r} className="pen-set-chip" data-on={reason === r} onClick={() => setReason(r)}>
                    {T.why[r]}
                  </button>
                ))}
              </div>
              <label className="pen-su-field">
                <span className="pen-label">{T.commentLabel} <em>{T.commentHint}</em></span>
                <textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              <div className="pen-set-actions">
                <button type="button" className="pen-btn pen-btn-primary" disabled={!reason} onClick={() => setStep('confirm')}>{T.next}</button>
                <button type="button" className="pen-btn" onClick={() => setStep('idle')}>{T.never}</button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <ul className="pen-cancel-lose">
                <li>{T.loseAdd(day(endsAt))}</li>
                <li>{T.loseAi}</li>
                <li>{T.loseKeep(deleteAfter(endsAt))}</li>
                <li>{trial ? T.loseTrial : T.loseRefund}</li>
                {keepsPen && <li>{T.losePen}</li>}
                <li>{T.loseBack}</li>
              </ul>
              {pausable && (
                <div className="pen-cancel-pause">
                  <span>{T.pauseInstead}</span>
                  <button type="button" className="pen-btn pen-btn-accent" onClick={() => pause(30)} disabled={!!busy}>
                    {busy === 'pause' ? T.pausing : T.pauseInsteadBtn}
                  </button>
                </div>
              )}
              {err && <div className="pen-su-err">{err}</div>}
              <div className="pen-set-actions">
                <button type="button" className="pen-btn pen-btn-primary" onClick={() => setStep('idle')} disabled={!!busy}>{T.keep}</button>
                <button type="button" className="pen-btn pen-cancel-confirm" onClick={cancel} disabled={!!busy}>
                  {busy === 'cancel' ? T.confirming : T.confirm}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatusCard({ title, lede, tone, days, unit, children }: { title: string; lede: string; tone?: 'warn'; days?: number; unit?: string; children?: React.ReactNode }) {
  return (
    <div className="pen-set-card pen-plan-status" data-tone={tone}>
      <div className="pen-plan-status-row">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{title}</h2>
          <p className="pen-set-lede">{lede}</p>
        </div>
        {days !== undefined && unit && (
          <div className="pen-plan-count" aria-hidden="true">
            <strong>{days}</strong>
            <span>{unit}</span>
          </div>
        )}
      </div>
      {children && <div className="pen-set-actions">{children}</div>}
    </div>
  )
}
