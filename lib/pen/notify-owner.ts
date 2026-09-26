// Telling the owners about a customer, at the moment it means something.
//
// This used to fire when the signup form was submitted, before any payment, so an abandoned
// checkout looked exactly like a sale. It now fires from the Stripe webhook once the checkout
// completes (paid, or a trial started with a card), and from the form only when checkout could
// not be opened at all, labelled as unpaid.

import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'
import { planPrice, parseOffer, parsePlan } from './plan'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function recipient(): string | null {
  const to = process.env.PEN_SIGNUP_NOTIFY || process.env.RESEND_FROM_EMAIL
  return to ? to.replace(/^.*<|>.*$/g, '') : null
}

function planLabel(plan: string | null, offer: string | null): string {
  const o = parseOffer(offer)
  const p = parsePlan(plan)
  const len = p === 'annual' ? 'yearly' : p === 'halfyear' ? '6 months' : 'monthly'
  const price = planPrice(o, p)
  return `${o === 'own-recorder' ? 'Own recorder' : 'With pen'}, ${len}${price ? ` ($${price.usd})` : ''}`
}

async function signupRow(email: string) {
  const { data } = await supabaseAdmin
    .from('pen_signups')
    .select('name,phone,role,ship_line1,ship_line2,ship_city,ship_state,ship_postcode,ship_country,note')
    .ilike('email', email)
    .maybeSingle()
  return (data ?? null) as Record<string, string | null> | null
}

async function send(subject: string, rows: [string, string][]) {
  const to = recipient()
  if (!to) return
  await sendEmailResult({
    to,
    subject,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:20px">` +
      rows.map(([k, v]) => `<div><strong>${k}:</strong> ${esc(v)}</div>`).join('') +
      `</body></html>`,
  })
}

/** A checkout completed. `amountCents` is what was charged today (0 on a trial). */
export async function notifyPaid(opts: { email: string; plan: string | null; offer: string | null; amountCents: number | null }) {
  const s = await signupRow(opts.email).catch(() => null)
  const today = opts.amountCents ? `$${(opts.amountCents / 100).toFixed(2)} charged today` : 'Free trial started, card on file'
  const shipTo = s ? [s.ship_line1, s.ship_line2, s.ship_city, s.ship_state, s.ship_postcode, s.ship_country].filter(Boolean).join(', ') : ''
  const pen = parseOffer(opts.offer) === 'posted-pen'
  await send(`${opts.amountCents ? 'Paid' : 'Trial'}: Juno Pen, ${s?.name ?? opts.email} (${planLabel(opts.plan, opts.offer)})`, [
    ['Name', s?.name ?? '(no signup form)'],
    ['Email', opts.email],
    ['Plan', planLabel(opts.plan, opts.offer)],
    ['Today', today],
    ['Phone', s?.phone ?? '—'],
    ['Role', s?.role ?? '—'],
    ...(pen ? ([['Ship pen to', shipTo || '— (no address on file)']] as [string, string][]) : []),
    ['Note', s?.note ?? '—'],
  ])
}

/** Hours bought. Mostly useful for the live $1 test. */
export async function notifyHours(opts: { email: string; amountCents: number | null; hours: string | null }) {
  await send(`Paid: ${opts.hours ?? '?'} extra hour(s), ${opts.email}`, [
    ['Email', opts.email],
    ['Hours', opts.hours ?? '?'],
    ['Charged', opts.amountCents ? `$${(opts.amountCents / 100).toFixed(2)}` : '—'],
  ])
}

/** The form was submitted but no checkout could be opened (Stripe down or unconfigured). */
export async function notifyUnpaidSignup(s: { name: string; email: string; phone?: string | null; role?: string | null; note?: string | null }, plan: string | null, offer: string | null) {
  await send(`Signed up, NOT paid (checkout unavailable): ${s.name}`, [
    ['Name', s.name],
    ['Email', s.email],
    ['Plan chosen', planLabel(plan, offer)],
    ['Phone', s.phone ?? '—'],
    ['Role', s.role ?? '—'],
    ['Note', s.note ?? '—'],
  ])
}

/** Someone asked to hear when the pen reaches their country (Chile, Brazil). No payment. */
export async function notifyPenWaitlist(s: { name: string; email: string; phone?: string | null; role?: string | null; note?: string | null }) {
  await send(`Pen waitlist: ${s.name}`, [
    ['Name', s.name],
    ['Email', s.email],
    ['Phone', s.phone ?? '—'],
    ['Role', s.role ?? '—'],
    ['Note', s.note ?? '—'],
  ])
}
