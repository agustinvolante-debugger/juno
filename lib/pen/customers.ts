// Everyone who has touched Juno Pen, in one row each: what they signed up with, what they
// pay for, whether their pen is in the post, and how much they record.
//
// Four sources joined on lower-cased email, because each answers a different question:
//   pen_signups         what they told us (name, phone, role, shipping address)
//   pen_accounts        what they have (pending / active / cancelled, plan, trial, Stripe ids)
//   pen_hour_purchases  extra hours bought
//   pen_sessions        what they actually do (recordings, hours this month, last active)
// Plus the hand-granted list in lib/auth.ts, for people let in without paying.

import { supabaseAdmin } from '@/lib/supabase'
import { ALLOWED_EMAILS } from '@/lib/auth'
import { foldAllowance, isMissingSchema, type MeterRow } from './allowance'
import { isUncapped, planPrice, parsePlan, parseOffer } from './plan'

export type CustomerStatus = 'pending' | 'trial' | 'monthly' | 'halfyear' | 'yearly' | 'active' | 'granted' | 'cancelled'
export type PenState = 'to-post' | 'posted' | 'own' | 'none'

export type Customer = {
  email: string
  name: string | null
  phone: string | null
  role: string | null
  address: string | null
  note: string | null
  source: string | null
  status: CustomerStatus
  plan: string | null
  offer: string | null
  trialEndsAt: string | null
  periodEnd: string | null
  signedUpAt: string | null
  stripeCustomerId: string | null
  pen: PenState
  penShippedAt: string | null
  uncapped: boolean
  recordings: number
  usedThisMonthSec: number
  boughtHours: number
  boughtLeftSec: number
  spentCents: number
  lastActiveAt: string | null
}

export type CustomerSummary = {
  total: number
  pending: number
  trial: number
  paying: number
  cancelled: number
  /** Monthly recurring revenue from each paying customer's own plan. Trials excluded. */
  mrrUsd: number
  pensToPost: number
}

type SignupRow = {
  email: string; name: string | null; phone: string | null; role: string | null; note: string | null; source: string | null
  ship_line1: string | null; ship_line2: string | null; ship_city: string | null; ship_state: string | null; ship_postcode: string | null; ship_country: string | null
  created_at: string
}
type AccountRow = {
  email: string; status: string; plan: string | null; offer: string | null; trial_ends_at: string | null
  current_period_end: string | null; stripe_customer_id: string | null; created_at: string; pen_shipped_at?: string | null; source: string | null
}

async function rows<T>(table: string, select = '*'): Promise<T[]> {
  const { data, error } = await supabaseAdmin.from(table).select(select)
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(`${table}: ${error.message}`)
  }
  return (data ?? []) as T[]
}

function statusOf(a: AccountRow | undefined, email: string, now: number): CustomerStatus {
  if (!a) return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email) ? 'granted' : 'pending'
  if (a.status === 'cancelled') return 'cancelled'
  if (a.status === 'pending') return 'pending'
  if (a.trial_ends_at && Date.parse(a.trial_ends_at) > now) return 'trial'
  if (a.plan === 'monthly') return 'monthly'
  if (a.plan === 'halfyear') return 'halfyear'
  if (a.plan === 'annual') return 'yearly'
  return a.stripe_customer_id ? 'active' : 'granted'
}

export async function listCustomers(now = new Date()): Promise<{ customers: Customer[]; summary: CustomerSummary }> {
  const [signups, accounts, purchases, sessions] = await Promise.all([
    rows<SignupRow>('pen_signups'),
    rows<AccountRow>('pen_accounts'),
    rows<{ user_email: string; hours: number; amount_cents: number; created_at: string }>('pen_hour_purchases', 'user_email,hours,amount_cents,created_at'),
    rows<MeterRow & { user_email: string; recorded_at: string | null }>(
      'pen_sessions',
      'user_email,status,duration_sec,aai_id,created_at,metered_at,metered_sec,recorded_at',
    ),
  ])

  const key = (e: string) => e.trim().toLowerCase()
  const bySignup = new Map(signups.map((s) => [key(s.email), s]))
  const byAccount = new Map(accounts.map((a) => [key(a.email), a]))
  const buys = new Map<string, { hours: number; created_at: string }[]>()
  const spent = new Map<string, number>()
  for (const p of purchases) {
    const k = key(p.user_email)
    buys.set(k, [...(buys.get(k) ?? []), { hours: p.hours, created_at: p.created_at }])
    spent.set(k, (spent.get(k) ?? 0) + (p.amount_cents ?? 0))
  }
  const sess = new Map<string, (MeterRow & { recorded_at: string | null })[]>()
  for (const s of sessions) {
    const k = key(s.user_email)
    sess.set(k, [...(sess.get(k) ?? []), s])
  }

  // Everyone who signed up, has an account, or has recorded something.
  const emails = new Set([...bySignup.keys(), ...byAccount.keys(), ...sess.keys()])
  const t = now.getTime()

  const customers: Customer[] = Array.from(emails).map((email) => {
    const s = bySignup.get(email)
    const a = byAccount.get(email)
    const mine = sess.get(email) ?? []
    const allowance = foldAllowance(email, mine, buys.get(email) ?? [], now)
    const status = statusOf(a, email, t)
    const address = s
      ? [s.ship_line1, s.ship_line2, s.ship_city, s.ship_state, s.ship_postcode, s.ship_country].filter(Boolean).join(', ') || null
      : null
    // A pen is owed when they chose the posted pen and are trialing or paying.
    const owed = a?.offer === 'posted-pen' && ['trial', 'monthly', 'halfyear', 'yearly', 'active'].includes(status)
    const pen: PenState = a?.offer === 'own-recorder' ? 'own' : a?.pen_shipped_at ? 'posted' : owed ? 'to-post' : 'none'
    const last = mine.map((m) => m.recorded_at ?? m.created_at).sort().pop() ?? null
    return {
      email,
      name: s?.name ?? null,
      phone: s?.phone ?? null,
      role: s?.role ?? null,
      address,
      note: s?.note ?? null,
      source: s?.source ?? a?.source ?? null,
      status,
      plan: a?.plan ?? null,
      offer: a?.offer ?? null,
      trialEndsAt: a?.trial_ends_at ?? null,
      periodEnd: a?.current_period_end ?? null,
      signedUpAt: [s?.created_at, a?.created_at].filter(Boolean).sort()[0] ?? null,
      stripeCustomerId: a?.stripe_customer_id ?? null,
      pen,
      penShippedAt: a?.pen_shipped_at ?? null,
      uncapped: isUncapped(email),
      recordings: mine.length,
      usedThisMonthSec: allowance.usedThisMonthSec,
      boughtHours: (buys.get(email) ?? []).reduce((n, b) => n + b.hours, 0),
      boughtLeftSec: allowance.boughtLeftSec,
      spentCents: spent.get(email) ?? 0,
      lastActiveAt: last,
    }
  })

  // Newest first by sign-up; people with no sign-up date (hand-granted) at the end.
  customers.sort((x, y) => (y.signedUpAt ?? '').localeCompare(x.signedUpAt ?? ''))

  const count = (st: CustomerStatus[]) => customers.filter((c) => st.includes(c.status)).length
  const summary: CustomerSummary = {
    total: customers.length,
    pending: count(['pending']),
    trial: count(['trial']),
    paying: count(['monthly', 'halfyear', 'yearly', 'active']),
    cancelled: count(['cancelled']),
    // Each paying customer's own plan, per month (software only is cheaper than the pen plans).
    mrrUsd: customers.reduce((sum, c) => {
      if (!['monthly', 'halfyear', 'yearly'].includes(c.status)) return sum
      const p = planPrice(parseOffer(c.offer), parsePlan(c.plan))
      return sum + (p ? p.usd / p.months : 0)
    }, 0),
    pensToPost: customers.filter((c) => c.pen === 'to-post').length,
  }
  return { customers, summary }
}

/** Marks a customer's pen as posted, or undoes it. */
export async function setPenShipped(email: string, shipped: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('pen_accounts')
    .update({ pen_shipped_at: shipped ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .ilike('email', email)
  if (error) {
    throw new Error(isMissingSchema(error.message) ? 'Run the pen_shipped_at ALTER in lib/pen/schema.sql first.' : error.message)
  }
}
