'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Allowance } from '@/lib/pen/allowance'
import type { HourPurchase } from '@/lib/pen/hours'
import { HOUR_USD, INCLUDED_HOURS, MAX_HOURS_PER_PURCHASE, PLAN_TZ } from '@/lib/pen/plan'
import { postJson, errMessage } from '@/lib/pen/http'
import UsageBar from '../../UsageBar'
import { useCopy, useLang } from '../../LangContext'
import { fmtDate, type Copy } from '@/lib/pen/i18n'

const BH_EN = {
  cancelled: 'Checkout was cancelled. Nothing was charged.',
  pending: 'Payment received and still clearing. Your hours appear as soon as it does.',
  added: (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'} added.`,
  resumed: (n: number) => ` ${n} waiting ${n === 1 ? 'recording is' : 'recordings are'} being transcribed now.`,
  confirmFailed: 'Could not confirm the payment. If you were charged, your hours will appear shortly.',
  checkoutFailed: 'Could not start checkout.',
  title: 'Recording hours',
  lede: (inc: number, usd: number) => `Your plan includes ${inc} hours a month, reset on the 1st. Extra hours are $${usd} each, used only once the monthly ones run out, and they never expire.`,
  buyTitle: 'Buy hours',
  stepper: 'Hours to buy',
  fewer: 'One hour fewer',
  more: 'One hour more',
  hoursAria: 'Hours',
  hours: (n: number): string => (n === 1 ? 'hour' : 'hours'),
  total: 'Total',
  once: (n: number, usd: number) => `${n} × $${usd}, charged once`,
  opening: 'Opening checkout…',
  buy: (n: number) => `Buy ${n} ${n === 1 ? 'hour' : 'hours'}`,
  notReady: 'Checkout isn’t switched on yet. Stripe still needs connecting.',
  secure: 'Paid securely through Stripe. Hours are added the moment payment clears.',
  past: 'Past purchases',
}

const BH: Copy<typeof BH_EN> = {
  en: BH_EN,
  es: {
    cancelled: 'Cancelaste el pago. No se cobró nada.',
    pending: 'Recibimos el pago y se está confirmando. Tus horas aparecen apenas se confirme.',
    added: (n) => `${n} ${n === 1 ? 'hora agregada' : 'horas agregadas'}.`,
    resumed: (n) => (n === 1 ? ' 1 grabación en espera se está transcribiendo ahora.' : ` ${n} grabaciones en espera se están transcribiendo ahora.`),
    confirmFailed: 'No se pudo confirmar el pago. Si se te cobró, tus horas aparecerán en breve.',
    checkoutFailed: 'No se pudo abrir el pago.',
    title: 'Horas de grabación',
    lede: (inc, usd) => `Tu plan incluye ${inc} horas al mes, que se reinician el día 1. Las horas extra cuestan US$${usd} cada una, se usan solo cuando se acaban las del mes y no vencen.`,
    buyTitle: 'Comprar horas',
    stepper: 'Horas a comprar',
    fewer: 'Una hora menos',
    more: 'Una hora más',
    hoursAria: 'Horas',
    hours: (n) => (n === 1 ? 'hora' : 'horas'),
    total: 'Total',
    once: (n, usd) => `${n} × US$${usd}, un solo cobro`,
    opening: 'Abriendo el pago…',
    buy: (n) => `Comprar ${n} ${n === 1 ? 'hora' : 'horas'}`,
    notReady: 'El pago todavía no está activado. Falta conectar Stripe.',
    secure: 'Pago seguro con Stripe. Las horas se agregan apenas se confirma el pago.',
    past: 'Compras anteriores',
  },
  pt: {
    cancelled: 'O pagamento foi cancelado. Nada foi cobrado.',
    pending: 'Pagamento recebido e ainda em confirmação. Suas horas aparecem assim que confirmar.',
    added: (n) => `${n} ${n === 1 ? 'hora adicionada' : 'horas adicionadas'}.`,
    resumed: (n) => (n === 1 ? ' 1 gravação em espera está sendo transcrita agora.' : ` ${n} gravações em espera estão sendo transcritas agora.`),
    confirmFailed: 'Não foi possível confirmar o pagamento. Se você foi cobrado, suas horas aparecem em breve.',
    checkoutFailed: 'Não foi possível abrir o pagamento.',
    title: 'Horas de gravação',
    lede: (inc, usd) => `Seu plano inclui ${inc} horas por mês, que reiniciam no dia 1. Horas extras custam US$${usd} cada, só são usadas quando as do mês acabam e não expiram.`,
    buyTitle: 'Comprar horas',
    stepper: 'Horas para comprar',
    fewer: 'Uma hora a menos',
    more: 'Uma hora a mais',
    hoursAria: 'Horas',
    hours: (n) => (n === 1 ? 'hora' : 'horas'),
    total: 'Total',
    once: (n, usd) => `${n} × US$${usd}, cobrança única`,
    opening: 'Abrindo o pagamento…',
    buy: (n) => `Comprar ${n} ${n === 1 ? 'hora' : 'horas'}`,
    notReady: 'O pagamento ainda não está ativado. Falta conectar o Stripe.',
    secure: 'Pagamento seguro pelo Stripe. As horas são adicionadas assim que o pagamento é confirmado.',
    past: 'Compras anteriores',
  },
}

const QUICK = [1, 5, 10, 20]

export default function BuyHours({
  initialAllowance,
  purchases,
  checkoutReady,
  loadError,
}: {
  initialAllowance: Allowance | null
  purchases: HourPurchase[]
  checkoutReady: boolean
  loadError: string | null
}) {
  const T = useCopy(BH)
  const lang = useLang()
  const router = useRouter()
  const params = useSearchParams()
  const [allowance, setAllowance] = useState(initialAllowance)
  const [hours, setHours] = useState(5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(loadError)
  const [done, setDone] = useState<string | null>(null)

  const clamp = (n: number) => Math.min(MAX_HOURS_PER_PURCHASE, Math.max(1, Math.floor(n) || 1))
  const total = hours * HOUR_USD

  // Back from Stripe. Confirm with Stripe directly rather than wait on the webhook, which
  // never reaches localhost and can lag in production. Once per return.
  const confirmed = useRef(false)
  useEffect(() => {
    const paid = params.get('paid')
    if (params.get('cancelled')) setErr(T.cancelled)
    if (!paid || confirmed.current) return
    confirmed.current = true
    void (async () => {
      try {
        const j = await postJson<{ ok?: boolean; pending?: boolean; hours?: number; resumed?: number; allowance: Allowance }>(
          '/api/pen/hours/confirm',
          { sessionId: paid },
        )
        setAllowance(j.allowance)
        if (j.pending) setDone(T.pending)
        else {
          const got = T.added(j.hours ?? 0)
          const went = j.resumed ? T.resumed(j.resumed) : ''
          setDone(got + went)
        }
      } catch (e) {
        setErr(errMessage(e, T.confirmFailed))
      } finally {
        // Drop the session id from the address first, then re-render from the server so the
        // purchase list includes what was just bought. The other way round, the replace
        // re-used the snapshot taken before the purchase existed.
        router.replace('/pen/settings/hours', { scroll: false })
        router.refresh()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, router])

  async function buy() {
    setErr(null)
    setBusy(true)
    try {
      const j = await postJson<{ url: string }>('/api/pen/hours/checkout', { hours })
      window.location.href = j.url
    } catch (e) {
      setErr(errMessage(e, T.checkoutFailed))
      setBusy(false)
    }
  }

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.title}</h2>
          <p className="pen-set-lede">
            {T.lede(INCLUDED_HOURS, HOUR_USD)}
          </p>
        </div>
        <div className="pen-set-meter">
          <UsageBar allowance={allowance} showCta={false} />
        </div>
      </div>

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.buyTitle}</h2>
        </div>

        {done && <div className="pen-set-ok" role="status">{done}</div>}
        {err && <div className="pen-su-err">{err}</div>}

        <div className="pen-set-buy">
          <div className="pen-stepper" role="group" aria-label={T.stepper}>
            <button type="button" className="pen-stepper-btn" onClick={() => setHours((h) => clamp(h - 1))} disabled={hours <= 1} aria-label={T.fewer}>
              −
            </button>
            <label className="pen-stepper-val">
              <input
                type="number"
                min={1}
                max={MAX_HOURS_PER_PURCHASE}
                value={hours}
                onChange={(e) => setHours(clamp(Number(e.target.value)))}
                aria-label={T.hoursAria}
              />
              <span>{T.hours(hours)}</span>
            </label>
            <button type="button" className="pen-stepper-btn" onClick={() => setHours((h) => clamp(h + 1))} disabled={hours >= MAX_HOURS_PER_PURCHASE} aria-label={T.more}>
              +
            </button>
          </div>

          <div className="pen-set-chips">
            {QUICK.map((q) => (
              <button type="button" key={q} className="pen-set-chip" data-on={hours === q} aria-pressed={hours === q} onClick={() => setHours(q)}>
                {`${q}h`}
              </button>
            ))}
          </div>
        </div>

        <div className="pen-set-total">
          <span className="pen-label">{T.total}</span>
          <span className="pen-set-total-n">{`$${total}`}</span>
          <span className="pen-set-total-sub">{T.once(hours, HOUR_USD)}</span>
        </div>

        <div className="pen-set-actions">
          <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={buy} disabled={busy || !checkoutReady}>
            {busy ? T.opening : T.buy(hours)}
          </button>
        </div>
        {!checkoutReady && (
          <p className="pen-set-fine">{T.notReady}</p>
        )}
        <p className="pen-set-fine">{T.secure}</p>
      </div>

      {purchases.length > 0 && (
        <div className="pen-set-card">
          <div className="pen-set-card-head">
            <h2 className="pen-set-h2">{T.past}</h2>
          </div>
          <ul className="pen-set-history">
            {purchases.map((p) => (
              <li key={p.id}>
                <span>{fmtDate(p.created_at, lang, { month: 'short', day: 'numeric', year: 'numeric', timeZone: PLAN_TZ })}</span>
                <span>{`${p.hours} ${T.hours(p.hours)}`}</span>
                <span className="pen-mono">{`$${(p.amount_cents / 100).toFixed(2)}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
