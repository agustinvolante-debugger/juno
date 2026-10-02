// Referrals, stage 1 (agreed 2 Oct; plan in juno_project/Notes/pen-referrals.html).
//
// Give a month, get a month:
//   · The friend gets their first month free: credit that zeroes the first monthly bill, or
//     a month off at checkout on a 6-month or yearly plan (no trial there to absorb it).
//   · A referral counts on the friend's first real payment (> $0). That's the count we show.
//   · The referrer earns 1 month per paying friend (2 for a 6-month friend, 3 for a yearly
//     one), +1 bonus on the 3rd and 5th friend, at most 12 months in any 12.
//   · Stage 2 (lib/pen/referral-events.ts): a referral whose card or shipping address matches
//     the referrer's, or a card another of their friends used, is void. A daily job credits the
//     referrer 14 days after the payment; a refund or chargeback before then voids it, and after
//     it takes back whatever credit is still unused. The owners can also give early or void by hand.
//
// Not through referrals: the free-pen offer (it would turn referrals into a pen giveaway),
// anyone who has ever had an account, and referring yourself under another address.

import { supabaseAdmin } from '@/lib/supabase'
import { getAccount } from './accounts'
import { parsePlan, type Plan } from './plan'

export const REF_COOKIE = 'juno_ref'
export const REF_DAYS = 60
/** Days between the friend's payment and crediting the referrer (refund window). */
export const HOLD_DAYS = 14
export const CAP_MONTHS = 12

export type ReferralStatus = 'signed_up' | 'paid' | 'void'

export type Referral = {
  id: string
  code: string
  referrer_email: string
  referee_email: string
  referee_name: string | null
  plan: string | null
  offer: string | null
  status: ReferralStatus
  referee_customer_id: string | null
  paid_at: string | null
  paid_amount: number | null
  paid_currency: string | null
  friend_credit_at: string | null
  rewarded_at: string | null
  reward_months: number | null
  reward_txn: string | null
  reward_amount?: number | null
  reward_currency?: string | null
  reward_reversed_at?: string | null
  reward_error?: string | null
  /** The card fingerprint the friend paid with, to spot one card behind several friends. */
  referee_card?: string | null
  void_reason: string | null
  created_at: string
}

/** One address per inbox: case, Gmail's dots and any +tag don't make a new person. */
export function normalizeEmail(email: string): string {
  const [local0, domain0] = email.trim().toLowerCase().split('@')
  if (!domain0) return email.trim().toLowerCase()
  const domain = domain0 === 'googlemail.com' ? 'gmail.com' : domain0
  let local = local0.split('+')[0]
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

/** Codes are what people type and read out: lowercase letters and digits only. */
export function cleanCode(v: unknown): string | null {
  const c = String(v ?? '').trim().toLowerCase()
  return /^[a-z0-9]{3,24}$/.test(c) ? c : null
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)
}

/** The name we know them by: the signup form, then their profile. */
export async function displayName(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('pen_signups').select('name').ilike('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (data?.name) return String(data.name)
  const { getProfileRaw } = await import('./profile')
  const p = await getProfileRaw(email).catch(() => null)
  return p?.name ?? null
}

export const firstName = (name: string | null, email: string) => {
  const n = name?.trim().split(/\s+/)[0] || email.split('@')[0].split(/[.+_-]/)[0]
  return n.charAt(0).toUpperCase() + n.slice(1)
}

/** The customer's code, made on first ask: their first name, then name2, name3… */
export async function codeFor(email: string): Promise<string> {
  const e = email.toLowerCase()
  const have = await supabaseAdmin.from('pen_referral_codes').select('code').eq('email', e).maybeSingle()
  if (have.error) throw new Error(have.error.message)
  if (have.data?.code) return have.data.code
  let base = slug(firstName(await displayName(e), e))
  if (base.length < 3) base = slug(e.split('@')[0]).padEnd(3, '0')
  for (let n = 1; n < 200; n++) {
    const code = n === 1 ? base : `${base}${n}`
    const r = await supabaseAdmin.from('pen_referral_codes').insert({ email: e, code })
    if (!r.error) return code
    // 23505 on the email means a concurrent request made one; on the code, try the next.
    if (r.error.code !== '23505') throw new Error(r.error.message)
    const mine = await supabaseAdmin.from('pen_referral_codes').select('code').eq('email', e).maybeSingle()
    if (mine.data?.code) return mine.data.code
  }
  throw new Error('Could not make a referral code.')
}

export async function referrerFor(code: string): Promise<{ email: string; first: string } | null> {
  const { data } = await supabaseAdmin.from('pen_referral_codes').select('email').eq('code', code).maybeSingle()
  if (!data?.email) return null
  return { email: data.email, first: firstName(await displayName(data.email), data.email) }
}

/**
 * Whether `refereeEmail` may be referred with `code`. Returns the referrer's email, or null
 * with no reason given: the signup simply goes ahead without a referral.
 */
export async function eligibleReferral(code: string | null, refereeEmail: string, offer: string): Promise<string | null> {
  if (!code || offer === 'free-pen') return null
  const ref = await referrerFor(code).catch(() => null)
  if (!ref) return null
  if (normalizeEmail(ref.email) === normalizeEmail(refereeEmail)) return null
  // Someone who has ever had an account is a returning customer, not a new friend.
  const existing = await getAccount(refereeEmail).catch(() => null)
  if (existing && (existing.status !== 'pending' || existing.activated_at)) return null
  // Already referred (by anyone): the first referral stands.
  const prior = await supabaseAdmin.from('pen_referrals').select('id,code').ilike('referee_email', refereeEmail).maybeSingle()
  if (prior.data && prior.data.code !== code) return null
  return ref.email
}

/** The friend reached checkout through a link. One row per friend, ever. */
export async function recordSignup(r: { code: string; referrerEmail: string; refereeEmail: string; refereeName: string | null; plan: Plan; offer: string }): Promise<void> {
  const { error } = await supabaseAdmin.from('pen_referrals').insert({
    code: r.code,
    referrer_email: r.referrerEmail.toLowerCase(),
    referee_email: r.refereeEmail.toLowerCase(),
    referee_name: r.refereeName,
    plan: r.plan,
    offer: r.offer,
  })
  // 23505: they came back to checkout a second time. The first row stands, but keep the plan
  // they finally chose.
  if (error?.code === '23505') {
    await supabaseAdmin.from('pen_referrals').update({ plan: r.plan, offer: r.offer, updated_at: new Date().toISOString() }).ilike('referee_email', r.refereeEmail).eq('status', 'signed_up')
    return
  }
  if (error) throw new Error(error.message)
}

export async function referralForReferee(email: string): Promise<Referral | null> {
  const { data } = await supabaseAdmin.from('pen_referrals').select('*').ilike('referee_email', email).maybeSingle()
  return (data as Referral) ?? null
}

export async function setRefereeCustomer(email: string, customerId: string): Promise<void> {
  await supabaseAdmin.from('pen_referrals').update({ referee_customer_id: customerId }).ilike('referee_email', email).is('referee_customer_id', null)
}

/** Claims the friend's first-month credit, so a retried webhook can't grant it twice. */
export async function claimFriendCredit(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('pen_referrals').update({ friend_credit_at: new Date().toISOString() }).eq('id', id).is('friend_credit_at', null).select('id')
  return Boolean(data?.length)
}

export async function releaseFriendCredit(id: string): Promise<void> {
  await supabaseAdmin.from('pen_referrals').update({ friend_credit_at: null }).eq('id', id)
}

/**
 * The friend's first real payment. Returns the referral only for the call that moved it to
 * paid, so the emails go out once however Stripe repeats itself.
 */
export async function markPaid(m: { email?: string | null; customerId?: string | null; amount: number; currency: string | null; card?: string | null }): Promise<Referral | null> {
  if (!(m.amount > 0)) return null
  let q = supabaseAdmin
    .from('pen_referrals')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_amount: m.amount, paid_currency: m.currency, ...(m.card ? { referee_card: m.card } : {}), updated_at: new Date().toISOString() })
    .eq('status', 'signed_up')
  if (m.customerId) q = q.eq('referee_customer_id', m.customerId)
  else if (m.email) q = q.ilike('referee_email', m.email)
  else return null
  const { data, error } = await q.select('*')
  if (error) throw new Error(error.message)
  if (data?.length) return data[0] as Referral
  // The customer id wasn't stored yet (the payment beat the checkout event): try the email.
  if (m.customerId && m.email) return markPaid({ ...m, customerId: null })
  return null
}

/** Months a paying friend is worth before bonuses: their plan's length, in effect. */
export function baseMonths(plan: string | null): number {
  const p = parsePlan(plan)
  return p === 'annual' ? 3 : p === 'halfyear' ? 2 : 1
}

export async function referralsBy(referrerEmail: string): Promise<Referral[]> {
  const { data, error } = await supabaseAdmin.from('pen_referrals').select('*').ilike('referrer_email', referrerEmail).order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Referral[]
}

const paidOrder = (rows: Referral[]) => rows.filter((r) => r.status === 'paid').sort((a, b) => Date.parse(a.paid_at!) - Date.parse(b.paid_at!))

/** What this referral earns its referrer: base months, +1 if it was the 3rd or 5th paying friend. */
export function monthsEarned(r: Referral, all: Referral[]): number {
  const n = paidOrder(all).findIndex((x) => x.id === r.id) + 1
  if (n <= 0) return 0
  return baseMonths(r.plan) + (n === 3 || n === 5 ? 1 : 0)
}

/** Months already credited in the last 12 months, for the cap. */
export function creditedLastYear(all: Referral[], now = new Date()): number {
  const since = now.getTime() - 365 * 86_400_000
  return all.filter((r) => r.rewarded_at && Date.parse(r.rewarded_at) > since).reduce((n, r) => n + (r.reward_months ?? 0), 0)
}

export type ReferralSummary = {
  code: string
  paid: number
  earned: number
  credited: number
  /** Paying friends still needed for the next bonus month, or null after the 5th. */
  toBonus: number | null
  friends: { name: string; status: ReferralStatus; paidAt: string | null; creditedAt: string | null; months: number; readyAt: string | null }[]
}

export async function summaryFor(email: string): Promise<ReferralSummary> {
  const [code, all] = await Promise.all([codeFor(email), referralsBy(email)])
  const paid = paidOrder(all)
  const earnedRaw = paid.reduce((n, r) => n + monthsEarned(r, all), 0)
  return {
    code,
    paid: paid.length,
    earned: Math.min(CAP_MONTHS, earnedRaw),
    credited: all.reduce((n, r) => n + (r.reward_months ?? 0), 0),
    toBonus: paid.length < 3 ? 3 - paid.length : paid.length < 5 ? 5 - paid.length : null,
    friends: all
      .filter((r) => r.status !== 'void')
      .map((r) => ({
        name: firstName(r.referee_name, r.referee_email),
        status: r.status,
        paidAt: r.paid_at,
        creditedAt: r.rewarded_at,
        months: r.status === 'paid' ? monthsEarned(r, all) : baseMonths(r.plan),
        readyAt: r.paid_at ? new Date(Date.parse(r.paid_at) + HOLD_DAYS * 86_400_000).toISOString() : null,
      })),
  }
}

/** Every referral, newest first, for the owners' page. */
export async function listReferrals(): Promise<(Referral & { months: number; readyAt: string | null })[]> {
  const { data, error } = await supabaseAdmin.from('pen_referrals').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Referral[]
  const byReferrer = new Map<string, Referral[]>()
  for (const r of rows) byReferrer.set(r.referrer_email, [...(byReferrer.get(r.referrer_email) ?? []), r])
  return rows.map((r) => ({
    ...r,
    months: r.status === 'paid' ? monthsEarned(r, byReferrer.get(r.referrer_email)!) : baseMonths(r.plan),
    readyAt: r.paid_at ? new Date(Date.parse(r.paid_at) + HOLD_DAYS * 86_400_000).toISOString() : null,
  }))
}

/** The referral a friend's payment is about, while it can still be counted. */
export async function pendingReferral(customerId: string | null, email: string | null): Promise<Referral | null> {
  if (customerId) {
    const { data } = await supabaseAdmin.from('pen_referrals').select('*').eq('referee_customer_id', customerId).eq('status', 'signed_up').maybeSingle()
    if (data) return data as Referral
  }
  if (email) {
    const { data } = await supabaseAdmin.from('pen_referrals').select('*').ilike('referee_email', email).eq('status', 'signed_up').maybeSingle()
    if (data) return data as Referral
  }
  return null
}

export async function referralByCustomer(customerId: string): Promise<Referral | null> {
  const { data } = await supabaseAdmin.from('pen_referrals').select('*').eq('referee_customer_id', customerId).maybeSingle()
  return (data as Referral) ?? null
}

/** Marks a referral void. True only for the call that did it. */
export async function markVoid(id: string, reason: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('pen_referrals')
    .update({ status: 'void', void_reason: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq('id', id)
    .neq('status', 'void')
    .select('id')
  if (error) throw new Error(error.message)
  return Boolean(data?.length)
}

/** Paid, not yet credited, and past the hold: what the daily job credits. */
export async function dueForReward(now = new Date()): Promise<Referral[]> {
  const before = new Date(now.getTime() - HOLD_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabaseAdmin.from('pen_referrals').select('*').eq('status', 'paid').is('rewarded_at', null).lte('paid_at', before).order('paid_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Referral[]
}

/** Lowercase letters and digits of the street line and postcode: "12 Oak St." and "12 oak st" match. */
export function addressKey(line1: string | null | undefined, postcode: string | null | undefined): string | null {
  const a = (line1 ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const p = (postcode ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return a && p ? `${a}|${p}` : null
}

export async function shippingKey(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('pen_signups').select('ship_line1,ship_postcode').ilike('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ? addressKey(data.ship_line1, data.ship_postcode) : null
}
