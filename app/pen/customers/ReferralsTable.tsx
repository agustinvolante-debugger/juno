'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { postJson, errMessage } from '@/lib/pen/http'

type Row = {
  id: string
  referrer_email: string
  referee_email: string
  referee_name: string | null
  plan: string | null
  status: 'signed_up' | 'paid' | 'void'
  paid_at: string | null
  paid_amount: number | null
  paid_currency: string | null
  friend_credit_at: string | null
  rewarded_at: string | null
  reward_months: number | null
  reward_error?: string | null
  reward_reversed_at?: string | null
  void_reason: string | null
  created_at: string
  months: number
  readyAt: string | null
}

const day = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const amt = (n: number | null, c: string | null) => (n == null ? '' : c === 'clp' ? `$${n.toLocaleString('es-CL')} CLP` : `$${(n / 100).toFixed(2)}${c && c !== 'usd' ? ` ${c.toUpperCase()}` : ''}`)

// Owners: every referral, and the button that credits the referrer once the friend has paid.
// Stage 1 is manual on purpose: look at the two rows (same address? same person?) before giving.
export default function ReferralsTable({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  async function voidIt(r: Row) {
    setBusy(r.id); setMsg(null)
    try {
      const j = await postJson<{ tookBack: number }>('/api/pen/referrals/void', { id: r.id })
      setMsg({ id: r.id, ok: true, text: j.tookBack ? `Void. Took back ${amt(j.tookBack, r.paid_currency)} of unused credit.` : 'Void.' })
      router.refresh()
    } catch (e) {
      setMsg({ id: r.id, ok: false, text: errMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  async function give(r: Row) {
    setBusy(r.id); setMsg(null)
    try {
      const j = await postJson<{ months: number }>('/api/pen/referrals/reward', { id: r.id })
      setMsg({ id: r.id, ok: true, text: `Credited ${j.months} month${j.months === 1 ? '' : 's'} to ${r.referrer_email}. They’ve been emailed.` })
      router.refresh()
    } catch (e) {
      setMsg({ id: r.id, ok: false, text: errMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  const paid = rows.filter((r) => r.status === 'paid').length
  const toGive = rows.filter((r) => r.status === 'paid' && !r.rewarded_at).length

  return (
    <section className="pen-ref">
      <div className="pen-ref-head">
        <h2 className="pen-display pen-ref-title">Referrals</h2>
        <p className="pen-cust-sub">{rows.length} signed up through a link · {paid} paid · {toGive} waiting for credit. Credit is given automatically each day once the 14 days pass; refunds and chargebacks void a referral by themselves. Give early or void by hand here.</p>
      </div>
      <div className="pen-cust-wrap">
        <table className="pen-cust-table">
          <thead>
            <tr><th>Friend</th><th>Referred by</th><th>Plan</th><th>Status</th><th>Referrer gets</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="pen-cust-empty">No referrals yet.</td></tr>
            )}
            {rows.map((r) => {
              const early = r.readyAt && Date.parse(r.readyAt) > Date.now()
              return (
                <tr key={r.id}>
                  <td>{r.referee_name ?? '—'}<div className="pen-ref-sub">{r.referee_email}</div></td>
                  <td>{r.referrer_email}</td>
                  <td>{r.plan ?? '—'}{r.friend_credit_at && <div className="pen-ref-sub">1st month credited</div>}</td>
                  <td>
                    {r.status === 'signed_up' && <>Signed up {day(r.created_at)}<div className="pen-ref-sub">not paid yet</div></>}
                    {r.status === 'paid' && <>Paid {amt(r.paid_amount, r.paid_currency)} on {day(r.paid_at!)}<div className="pen-ref-sub">{r.rewarded_at ? `credited ${day(r.rewarded_at)}` : `ready ${day(r.readyAt!)}`}</div></>}
                    {r.status === 'void' && <>Void<div className="pen-ref-sub">{r.void_reason}{r.reward_reversed_at ? ' · credit taken back' : ''}</div></>}
                    {r.reward_error && r.status === 'paid' && !r.rewarded_at && <div className="pen-ref-err">Couldn’t credit: {r.reward_error}</div>}
                  </td>
                  <td>
                    {r.rewarded_at ? `${r.reward_months} mo, ${r.reward_reversed_at ? 'taken back' : 'given'}` : r.status === 'paid' ? `${r.months} mo` : '—'}
                    <div className="pen-ref-actions">
                      {r.status === 'paid' && !r.rewarded_at && (
                        <button type="button" className="pen-btn" onClick={() => give(r)} disabled={busy === r.id} title={early ? 'Still inside the 14-day refund window' : undefined}>
                          {busy === r.id ? 'Working…' : early ? `Give ${r.months} mo early` : `Give ${r.months} mo`}
                        </button>
                      )}
                      {r.status !== 'void' && (
                        <button type="button" className="pen-btn pen-ref-void" onClick={() => voidIt(r)} disabled={busy === r.id}>Void</button>
                      )}
                    </div>
                    {msg?.id === r.id && <div className={msg.ok ? 'pen-ref-ok' : 'pen-ref-err'}>{msg.text}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
