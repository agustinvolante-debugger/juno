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

/** PEN_SIGNUP_NOTIFY may list several addresses, comma-separated (the founder + Chris). */
function recipient(): string[] | null {
  const to = process.env.PEN_SIGNUP_NOTIFY || process.env.RESEND_FROM_EMAIL
  if (!to) return null
  const list = to.split(',').map((a) => a.trim().replace(/^.*<|>.*$/g, '')).filter(Boolean)
  return list.length ? list : null
}

function planLabel(plan: string | null, offer: string | null): string {
  const o = parseOffer(offer)
  const p = parsePlan(plan)
  if (o === 'free-pen') return 'FREE PEN (invited agent), 30-day trial, then $15/month'
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
  if (!to) {
    console.warn('pen notify: no recipient (PEN_SIGNUP_NOTIFY / RESEND_FROM_EMAIL unset)')
    return
  }
  const r = await sendEmailResult({
    to,
    subject,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:20px">` +
      rows.map(([k, v]) => `<div><strong>${k}:</strong> ${esc(v)}</div>`).join('') +
      `</body></html>`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
  })
  // A failure used to vanish here; the Vercel log is the only place it can show up.
  if (!r.ok) console.warn(`pen notify: "${subject}" not sent: ${r.error}`)
  else console.log(`pen notify: "${subject}" sent to ${to.length} recipient(s)`)
}

/** A checkout completed. `amountCents` is what was charged today (0 on a trial). */
export async function notifyPaid(opts: { email: string; plan: string | null; offer: string | null; amountCents: number | null; returning?: boolean }) {
  const s = await signupRow(opts.email).catch(() => null)
  const today = opts.amountCents ? `$${(opts.amountCents / 100).toFixed(2)} charged today` : 'Free trial started, card on file'
  const shipTo = s ? [s.ship_line1, s.ship_line2, s.ship_city, s.ship_state, s.ship_postcode, s.ship_country].filter(Boolean).join(', ') : ''
  // A returning customer kept their pen; there is nothing to ship.
  const pen = parseOffer(opts.offer) !== 'own-recorder' && !opts.returning
  // Coming back: charged today, no trial, keeps the pen they had, whatever the original offer was.
  const plan = opts.returning ? `${opts.plan ?? 'monthly'} plan, reactivated (no trial, no pen)` : planLabel(opts.plan, opts.offer)
  await send(`${opts.returning ? 'Reactivated' : opts.amountCents ? 'Paid' : 'Trial'}: Juno Pen, ${s?.name ?? opts.email} (${plan})`, [
    ['Name', s?.name ?? '(no signup form)'],
    ['Email', opts.email],
    ['Plan', plan],
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

/** A referred friend made their first real payment. The referrer's month is credited by hand. */
export async function notifyReferralPaid(opts: { friend: string; referrer: string; plan: string | null; amount: string; readyOn: string; months: number }) {
  const friend = await signupRow(opts.friend).catch(() => null)
  const ref = await signupRow(opts.referrer).catch(() => null)
  const addr = (s: Awaited<ReturnType<typeof signupRow>> | null) => (s ? [s.ship_line1, s.ship_city, s.ship_state, s.ship_country].filter(Boolean).join(', ') || '—' : '—')
  await send(`Referral paid: ${friend?.name ?? opts.friend} via ${ref?.name ?? opts.referrer}`, [
    ['Friend', `${friend?.name ?? '—'} <${opts.friend}>`],
    ['Friend ships to', addr(friend)],
    ['Referred by', `${ref?.name ?? '—'} <${opts.referrer}>`],
    ['Referrer ships to', addr(ref)],
    ['Friend plan', opts.plan ?? '—'],
    ['Paid', opts.amount],
    ['Referrer earns', `${opts.months} month${opts.months === 1 ? '' : 's'}`],
    ['Credit it from', `${opts.readyOn}, in Customers → Referrals (if no refund by then)`],
  ])
}

/** Anything else about referrals the owners should see: voids, the daily credits. */
export async function notifyReferralNote(subject: string, rows: [string, string][]) {
  await send(subject, rows)
}
