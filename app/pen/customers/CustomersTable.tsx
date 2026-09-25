'use client'

import { useMemo, useState } from 'react'
import type { Customer, CustomerStatus, CustomerSummary } from '@/lib/pen/customers'
import { postJson, errMessage } from '@/lib/pen/http'
import { fmtHours, INCLUDED_HOURS, PLAN_TZ } from '@/lib/pen/plan'

const STATUS: Record<CustomerStatus, { label: string; tone: string }> = {
  pending: { label: 'Signed up, not paid', tone: 'dim' },
  trial: { label: 'Trial', tone: 'warn' },
  monthly: { label: 'Monthly', tone: 'good' },
  halfyear: { label: '6 months', tone: 'good' },
  yearly: { label: 'Yearly', tone: 'good' },
  active: { label: 'Paying', tone: 'good' },
  granted: { label: 'Free access', tone: 'accent' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
}

type Filter = 'all' | 'pending' | 'trial' | 'paying' | 'cancelled' | 'pens'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Not paid' },
  { key: 'trial', label: 'Trial' },
  { key: 'paying', label: 'Paying' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'pens', label: 'Pens to post' },
]

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: PLAN_TZ }) : '—'

export default function CustomersTable({ customers, summary, stripeBase }: { customers: Customer[]; summary: CustomerSummary; stripeBase: string }) {
  const [rows, setRows] = useState(customers)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter((c) => {
      const f =
        filter === 'all' ||
        (filter === 'pending' && c.status === 'pending') ||
        (filter === 'trial' && c.status === 'trial') ||
        (filter === 'paying' && ['monthly', 'halfyear', 'yearly', 'active'].includes(c.status)) ||
        (filter === 'cancelled' && c.status === 'cancelled') ||
        (filter === 'pens' && c.pen === 'to-post')
      return f && (!n || [c.email, c.name, c.phone, c.role, c.address].some((x) => x?.toLowerCase().includes(n)))
    })
  }, [rows, filter, q])

  async function ship(c: Customer, shipped: boolean) {
    setErr(null)
    const before = rows
    setRows((rs) => rs.map((r) => (r.email === c.email ? { ...r, pen: shipped ? 'posted' : 'to-post', penShippedAt: shipped ? new Date().toISOString() : null } : r)))
    try {
      await postJson('/api/pen/customers/ship', { email: c.email, shipped })
    } catch (e) {
      setRows(before)
      setErr(errMessage(e, 'Could not save that.'))
    }
  }

  const pensToPost = rows.filter((c) => c.pen === 'to-post').length

  return (
    <>
      <div className="pen-cust-tiles">
        <Tile n={summary.total} label="people" />
        <Tile n={summary.pending} label="signed up, not paid" />
        <Tile n={summary.trial} label="on trial" tone="warn" />
        <Tile n={summary.paying} label="paying" tone="good" />
        <Tile n={`$${Math.round(summary.mrrUsd).toLocaleString('en-US')}`} label="monthly revenue" tone="good" />
        <Tile n={pensToPost} label="pens to post" tone={pensToPost ? 'warn' : undefined} />
      </div>

      <div className="pen-cust-tools">
        <input className="pen-cust-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, address" aria-label="Search customers" />
        <div className="pen-cust-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="pen-set-chip" data-on={filter === f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="pen-su-err">{err}</p>}

      <div className="pen-cust-wrap">
        <table className="pen-cust-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Status</th>
              <th>Trial ends / renews</th>
              <th>Pen</th>
              <th className="n">This month</th>
              <th className="n">Bought</th>
              <th className="n">Recordings</th>
              <th>Last active</th>
              <th>Signed up</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <Row key={c.email} c={c} open={open === c.email} onToggle={() => setOpen(open === c.email ? null : c.email)} onShip={ship} stripeBase={stripeBase} />
            ))}
            {!list.length && (
              <tr>
                <td colSpan={9} className="pen-cust-empty">Nobody here yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Tile({ n, label, tone }: { n: number | string; label: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="pen-cust-tile">
      <span className="pen-cust-tile-n" data-tone={tone}>{n}</span>
      <span className="pen-cust-tile-l">{label}</span>
    </div>
  )
}

function Row({ c, open, onToggle, onShip, stripeBase }: { c: Customer; open: boolean; onToggle: () => void; onShip: (c: Customer, shipped: boolean) => void; stripeBase: string }) {
  const st = STATUS[c.status]
  const when = c.status === 'trial' ? c.trialEndsAt : c.periodEnd
  return (
    <>
      <tr className="pen-cust-row" data-open={open}>
        <td>
          <button type="button" className="pen-cust-person" onClick={onToggle} aria-expanded={open}>
            <strong>{c.name || c.email.split('@')[0]}</strong>
            <span>{c.email}</span>
          </button>
        </td>
        <td>
          <span className="pen-cust-pill" data-tone={st.tone}>{st.label}</span>
          {c.uncapped && <span className="pen-cust-note">no cap</span>}
        </td>
        <td>{when ? day(when) : '—'}</td>
        <td>
          {c.pen === 'to-post' && (
            <button type="button" className="pen-cust-ship" onClick={() => onShip(c, true)}>Mark posted</button>
          )}
          {c.pen === 'posted' && (
            <span className="pen-cust-posted">
              Posted {day(c.penShippedAt)}
              <button type="button" onClick={() => onShip(c, false)} aria-label={`Undo: pen not posted to ${c.email}`}>undo</button>
            </span>
          )}
          {c.pen === 'own' && <span className="pen-cust-muted">Own recorder</span>}
          {c.pen === 'none' && <span className="pen-cust-muted">—</span>}
        </td>
        <td className="n">{c.recordings ? `${fmtHours(c.usedThisMonthSec)} / ${INCLUDED_HOURS}h` : '—'}</td>
        <td className="n">{c.boughtHours ? `${c.boughtHours}h ($${(c.spentCents / 100).toFixed(0)})` : '—'}</td>
        <td className="n">{c.recordings || '—'}</td>
        <td>{day(c.lastActiveAt)}</td>
        <td>{day(c.signedUpAt)}</td>
      </tr>
      {open && (
        <tr className="pen-cust-detail">
          <td colSpan={9}>
            <dl>
              <div><dt>Phone</dt><dd>{c.phone || '—'}</dd></div>
              <div><dt>Role</dt><dd>{c.role || '—'}</dd></div>
              <div><dt>Ship to</dt><dd>{c.address || '—'}</dd></div>
              <div><dt>Came from</dt><dd>{c.source || '—'}</dd></div>
              <div><dt>Plan / offer</dt><dd>{[c.plan, c.offer].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt>Bought hours left</dt><dd>{c.boughtLeftSec ? fmtHours(c.boughtLeftSec) : '—'}</dd></div>
              {c.note && <div><dt>Note</dt><dd>{c.note}</dd></div>}
              <div>
                <dt>Stripe</dt>
                <dd>{c.stripeCustomerId ? <a href={`${stripeBase}/customers/${c.stripeCustomerId}`} target="_blank" rel="noopener">Open in Stripe</a> : 'No payment yet'}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}
