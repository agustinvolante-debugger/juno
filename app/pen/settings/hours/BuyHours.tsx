'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Allowance } from '@/lib/pen/allowance'
import type { HourPurchase } from '@/lib/pen/hours'
import { HOUR_USD, INCLUDED_HOURS, MAX_HOURS_PER_PURCHASE, PLAN_TZ } from '@/lib/pen/plan'
import { postJson, errMessage } from '@/lib/pen/http'
import UsageBar from '../../UsageBar'

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
    if (params.get('cancelled')) setErr('Checkout was cancelled. Nothing was charged.')
    if (!paid || confirmed.current) return
    confirmed.current = true
    void (async () => {
      try {
        const j = await postJson<{ ok?: boolean; pending?: boolean; hours?: number; resumed?: number; allowance: Allowance }>(
          '/api/pen/hours/confirm',
          { sessionId: paid },
        )
        setAllowance(j.allowance)
        if (j.pending) setDone('Payment received and still clearing. Your hours appear as soon as it does.')
        else {
          const got = `${j.hours} ${j.hours === 1 ? 'hour' : 'hours'} added.`
          const went = j.resumed ? ` ${j.resumed} waiting ${j.resumed === 1 ? 'recording is' : 'recordings are'} being transcribed now.` : ''
          setDone(got + went)
        }
      } catch (e) {
        setErr(errMessage(e, 'Could not confirm the payment. If you were charged, your hours will appear shortly.'))
      } finally {
        // Drop the session id from the address first, then re-render from the server so the
        // purchase list includes what was just bought. The other way round, the replace
        // re-used the snapshot taken before the purchase existed.
        router.replace('/pen/settings/hours', { scroll: false })
        router.refresh()
      }
    })()
  }, [params, router])

  async function buy() {
    setErr(null)
    setBusy(true)
    try {
      const j = await postJson<{ url: string }>('/api/pen/hours/checkout', { hours })
      window.location.href = j.url
    } catch (e) {
      setErr(errMessage(e, 'Could not start checkout.'))
      setBusy(false)
    }
  }

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">Recording hours</h2>
          <p className="pen-set-lede">
            {`Your plan includes ${INCLUDED_HOURS} hours a month, reset on the 1st. Extra hours are $${HOUR_USD} each, used only once the monthly ones run out, and they never expire.`}
          </p>
        </div>
        <div className="pen-set-meter">
          <UsageBar allowance={allowance} showCta={false} />
        </div>
      </div>

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">Buy hours</h2>
        </div>

        {done && <div className="pen-set-ok" role="status">{done}</div>}
        {err && <div className="pen-su-err">{err}</div>}

        <div className="pen-set-buy">
          <div className="pen-stepper" role="group" aria-label="Hours to buy">
            <button type="button" className="pen-stepper-btn" onClick={() => setHours((h) => clamp(h - 1))} disabled={hours <= 1} aria-label="One hour fewer">
              −
            </button>
            <label className="pen-stepper-val">
              <input
                type="number"
                min={1}
                max={MAX_HOURS_PER_PURCHASE}
                value={hours}
                onChange={(e) => setHours(clamp(Number(e.target.value)))}
                aria-label="Hours"
              />
              <span>{hours === 1 ? 'hour' : 'hours'}</span>
            </label>
            <button type="button" className="pen-stepper-btn" onClick={() => setHours((h) => clamp(h + 1))} disabled={hours >= MAX_HOURS_PER_PURCHASE} aria-label="One hour more">
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
          <span className="pen-label">Total</span>
          <span className="pen-set-total-n">{`$${total}`}</span>
          <span className="pen-set-total-sub">{`${hours} × $${HOUR_USD}, charged once`}</span>
        </div>

        <div className="pen-set-actions">
          <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={buy} disabled={busy || !checkoutReady}>
            {busy ? 'Opening checkout…' : `Buy ${hours} ${hours === 1 ? 'hour' : 'hours'}`}
          </button>
        </div>
        {!checkoutReady && (
          <p className="pen-set-fine">Checkout isn&rsquo;t switched on yet. Stripe still needs connecting.</p>
        )}
        <p className="pen-set-fine">Paid securely through Stripe. Hours are added the moment payment clears.</p>
      </div>

      {purchases.length > 0 && (
        <div className="pen-set-card">
          <div className="pen-set-card-head">
            <h2 className="pen-set-h2">Past purchases</h2>
          </div>
          <ul className="pen-set-history">
            {purchases.map((p) => (
              <li key={p.id}>
                <span>{new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: PLAN_TZ })}</span>
                <span>{`${p.hours} ${p.hours === 1 ? 'hour' : 'hours'}`}</span>
                <span className="pen-mono">{`$${(p.amount_cents / 100).toFixed(2)}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
