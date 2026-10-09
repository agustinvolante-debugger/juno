// What happens to a referral after signup (lib/pen/referrals.ts):
//   · checkout: the friend's first month as credit (monthly plans), the fraud checks, and the
//     count if they paid there and then;
//   · invoice.paid: the count for a friend whose first real payment comes after a trial;
//   · the daily job: crediting the referrer once the 14-day hold is over;
//   · a refund or chargeback on the friend's payment: void, and take back unused credit.
// Every step is claimed in the database first, so Stripe repeating an event changes nothing.

import { addCredit, cardFingerprints, customerBalance, getSubscription, monthlyAmount, takeBackCredit } from './stripe'
import {
  HOLD_DAYS,
  claimFriendCredit,
  displayName,
  firstName,
  markPaid,
  markVoid,
  monthsEarned,
  pendingReferral,
  referralByCustomer,
  referralForReferee,
  referralsBy,
  releaseFriendCredit,
  setRefereeCustomer,
  shippingKey,
  type Referral,
} from './referrals'
import { notifyReferralPaid, notifyReferralNote } from './notify-owner'
import { sendEmailResult } from '@/lib/news/email'
import { userLang } from './user-lang'

const money = (amount: number, currency: string) =>
  currency === 'clp' ? `$${amount.toLocaleString('es-CL')} CLP` : `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`

/**
 * Why this friend isn't really a new person, or null. Same card or same shipping address as
 * the referrer, or a card one of the referrer's other friends already paid with.
 */
export async function fraudReason(r: Referral, refereeCustomer: string | null): Promise<{ reason: string | null; card: string | null }> {
  const cards: string[] = refereeCustomer ? await cardFingerprints(refereeCustomer).catch(() => []) : []
  const { getAccount } = await import('./accounts')
  const referrer = await getAccount(r.referrer_email).catch(() => null)
  if (cards.length && referrer?.stripe_customer_id) {
    const theirs: string[] = await cardFingerprints(referrer.stripe_customer_id).catch(() => [])
    if (cards.some((c) => theirs.includes(c))) return { reason: 'paid with the referrer’s own card', card: cards[0] }
  }
  if (cards.length) {
    const others = (await referralsBy(r.referrer_email)).filter((x) => x.id !== r.id && x.status !== 'void' && x.referee_card)
    if (others.some((x) => cards.includes(x.referee_card!))) return { reason: 'card already used by another of the referrer’s friends', card: cards[0] }
  }
  const [a, b] = await Promise.all([shippingKey(r.referee_email), shippingKey(r.referrer_email)])
  if (a && b && a === b) return { reason: 'same shipping address as the referrer', card: cards[0] ?? null }
  return { reason: null, card: cards[0] ?? null }
}

/** Checks a friend's first real payment and either counts it or voids the referral. */
async function countPayment(m: { customerId: string | null; email: string | null; amount: number; currency: string | null }): Promise<void> {
  if (!(m.amount > 0)) return
  const r = await pendingReferral(m.customerId, m.email)
  if (!r) return
  const f = await fraudReason(r, m.customerId ?? r.referee_customer_id)
  if (f.reason) {
    if (await markVoid(r.id, f.reason)) await voidedNote(r, f.reason, null)
    return
  }
  await counted(await markPaid({ ...m, card: f.card }))
}

/** checkout.session.completed for a plan, after activate(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function referralCheckout(o: Record<string, any>, email: string): Promise<void> {
  if (!o.metadata?.ref) return
  const customer = typeof o.customer === 'string' ? o.customer : null
  if (customer) await setRefereeCustomer(email, customer)
  const r = await referralForReferee(email)
  if (!r || r.status === 'void') return

  // The referrer under another address doesn't get a friend's month either.
  if (r.status === 'signed_up') {
    const f = await fraudReason(r, customer)
    if (f.reason) {
      if (await markVoid(r.id, f.reason)) await voidedNote(r, f.reason, null)
      return
    }
  }

  // Monthly plans: the first monthly bill comes after the trial, so the friend's month is
  // credit on their account. Prepaid plans already got it off at checkout (the coupon).
  if (o.metadata.plan === 'monthly' && customer && typeof o.subscription === 'string' && (await claimFriendCredit(r.id))) {
    try {
      const m = monthlyAmount(await getSubscription(o.subscription))
      if (!m) throw new Error('no price on the subscription')
      const by = firstName(await displayName(r.referrer_email).catch(() => null), r.referrer_email)
      await addCredit(customer, m.amount, m.currency, `First month free: invited by ${by}`, `pen-friend-${r.id}`)
    } catch (e) {
      await releaseFriendCredit(r.id)
      throw e
    }
  }

  // The pen ($50) or a prepaid plan is paid right here, so the referral counts now.
  if (o.payment_status === 'paid' && (o.amount_total ?? 0) > 0) {
    await countPayment({ customerId: customer, email, amount: o.amount_total, currency: o.currency ?? null })
  }
}

/** invoice.paid: a friend's first real payment after a trial. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function referralInvoicePaid(o: Record<string, any>): Promise<void> {
  await countPayment({
    customerId: typeof o.customer === 'string' ? o.customer : null,
    email: o.customer_email ?? null,
    amount: o.amount_paid ?? 0,
    currency: o.currency ?? null,
  })
}

/**
 * A refund (at least half the charge) or a chargeback on a referred friend's payment, within
 * 90 days of their first payment. Before crediting: void. After: void and take back whatever
 * of the credit is still unused.
 */
export async function referralRefund(customerId: string | null, kind: 'refund' | 'chargeback'): Promise<void> {
  if (!customerId) return
  const r = await referralByCustomer(customerId)
  if (!r || r.status !== 'paid' || !r.paid_at) return
  if (Date.now() - Date.parse(r.paid_at) > 90 * 86_400_000) return
  await voidReferral(r, kind === 'refund' ? 'friend was refunded' : 'friend disputed the charge')
}

/** Voids a referral, taking back unused credit if it had already been given. For refunds and the owners' Void button. */
export async function voidReferral(r: Referral, reason: string): Promise<{ tookBack: number }> {
  if (!(await markVoid(r.id, reason))) return { tookBack: 0 }
  let tookBack = 0
  if (r.rewarded_at && !r.reward_reversed_at && r.reward_amount && r.reward_currency) {
    const { getAccount } = await import('./accounts')
    const acct = await getAccount(r.referrer_email)
    if (acct?.stripe_customer_id) {
      // Only what's still sitting on their balance: credit already spent on a bill stays spent.
      const unused = Math.max(0, -(await customerBalance(acct.stripe_customer_id)))
      tookBack = Math.min(r.reward_amount, unused)
      if (tookBack > 0) {
        await takeBackCredit(acct.stripe_customer_id, tookBack, r.reward_currency, `Referral reversed: ${reason}`, `pen-ref-back-${r.id}`)
      }
      const { supabaseAdmin } = await import('@/lib/supabase')
      await supabaseAdmin.from('pen_referrals').update({ reward_reversed_at: new Date().toISOString() }).eq('id', r.id)
    }
  }
  await voidedNote(r, reason, tookBack)
  return { tookBack }
}

async function voidedNote(r: Referral, reason: string, tookBack: number | null) {
  console.log(`pen referral: ${r.referee_email} via ${r.referrer_email} void: ${reason}`)
  await notifyReferralNote(`Referral void: ${r.referee_email} via ${r.referrer_email}`, [
    ['Friend', r.referee_email],
    ['Referred by', r.referrer_email],
    ['Why', reason],
    ...(tookBack !== null && r.rewarded_at ? ([['Credit taken back', tookBack > 0 ? money(tookBack, r.reward_currency ?? 'usd') : 'none (already used on a bill)']] as [string, string][]) : []),
  ]).catch(() => {})
}

const REF_MAIL = {
  en: {
    subject: (f: string) => `${f} joined Juno Pen with your link`,
    body: (f: string, m: number, d: string) =>
      `<p>${f} signed up with your link and made their first payment. Thank you.</p><p>Your ${m === 1 ? 'free month is' : `${m} free months are`} added to your account by ${d}, once the two-week refund window has passed. It comes off your next bill.</p>`,
    see: 'See your referrals',
    reply: 'Questions? Just reply to this email.',
  },
  es: {
    subject: (f: string) => `${f} se unió a Juno Pen con tu enlace`,
    body: (f: string, m: number, d: string) =>
      `<p>${f} se registró con tu enlace e hizo su primer pago. Gracias.</p><p>${m === 1 ? 'Tu mes gratis se suma' : `Tus ${m} meses gratis se suman`} a tu cuenta a más tardar el ${d}, cuando pasen las dos semanas de devolución. Se descuenta de tu próximo cobro.</p>`,
    see: 'Ver tus referidos',
    reply: '¿Preguntas? Solo responde este correo.',
  },
  pt: {
    subject: (f: string) => `${f} entrou no Juno Pen com seu link`,
    body: (f: string, m: number, d: string) =>
      `<p>${f} se cadastrou com seu link e fez o primeiro pagamento. Obrigado.</p><p>${m === 1 ? 'Seu mês grátis entra' : `Seus ${m} meses grátis entram`} na sua conta até ${d}, quando passar o prazo de duas semanas para reembolso. Ele é descontado da sua próxima cobrança.</p>`,
    see: 'Ver suas indicações',
    reply: 'Dúvidas? É só responder este e-mail.',
  },
} as const

async function counted(r: Referral | null): Promise<void> {
  if (!r) return
  const months = monthsEarned(r, await referralsBy(r.referrer_email))
  const ready = new Date(Date.parse(r.paid_at!) + HOLD_DAYS * 86_400_000)
  const friend = firstName(r.referee_name, r.referee_email)
  console.log(`pen referral: ${r.referee_email} paid, referred by ${r.referrer_email} (${months} month(s))`)
  await notifyReferralPaid({
    friend: r.referee_email,
    referrer: r.referrer_email,
    plan: r.plan,
    amount: money(r.paid_amount ?? 0, r.paid_currency ?? 'usd'),
    readyOn: ready.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
    months,
  }).catch((e) => console.warn(`pen notify failed: ${(e as Error).message}`))

  const lang = await userLang(r.referrer_email)
  const M = REF_MAIL[lang]
  const day = ready.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-CL' : 'pt-BR', { day: 'numeric', month: 'long' })
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  await sendEmailResult({
    to: r.referrer_email,
    subject: M.subject(friend),
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
      M.body(friend, months, day) +
      `<p><a href="${base}/settings/invite" style="color:#0B6B44">${M.see}</a></p>` +
      `<p style="color:#514E45">${M.reply}</p></body></html>`,
  }).catch((e) => console.warn(`pen referral email failed: ${(e as Error).message}`))
}

const GIVEN_MAIL = {
  en: { subject: 'Your free month is in', body: (f: string, m: number) => `<p>Thanks for bringing ${f} to Juno Pen. ${m === 1 ? 'A free month is' : `${m} free months are`} now on your account and come off your next ${m === 1 ? 'bill' : 'bills'} automatically.</p>` },
  es: { subject: 'Tu mes gratis ya está', body: (f: string, m: number) => `<p>Gracias por traer a ${f} a Juno Pen. ${m === 1 ? 'Ya tienes un mes gratis' : `Ya tienes ${m} meses gratis`} en tu cuenta, y se descuenta${m === 1 ? '' : 'n'} automáticamente de tus próximos cobros.</p>` },
  pt: { subject: 'Seu mês grátis chegou', body: (f: string, m: number) => `<p>Obrigado por trazer ${f} para o Juno Pen. ${m === 1 ? 'Um mês grátis já está' : `${m} meses grátis já estão`} na sua conta e ${m === 1 ? 'é descontado' : 'são descontados'} automaticamente das próximas cobranças.</p>` },
} as const

/**
 * The owners credit a paid referral (stage 1 does this by hand, after the refund window): the
 * referrer's months as Stripe credit, in their own plan's currency, within the yearly cap.
 */
export async function giveReward(id: string): Promise<{ months: number }> {
  const { supabaseAdmin } = await import('@/lib/supabase')
  const { getAccount } = await import('./accounts')
  const { CAP_MONTHS, creditedLastYear } = await import('./referrals')
  const { data } = await supabaseAdmin.from('pen_referrals').select('*').eq('id', id).maybeSingle()
  const r = data as Referral | null
  if (!r) throw new Error('No such referral.')
  if (r.status !== 'paid') throw new Error('This friend hasn’t paid yet.')
  if (r.rewarded_at) throw new Error('Already credited.')
  const all = await referralsBy(r.referrer_email)
  const months = Math.min(monthsEarned(r, all), CAP_MONTHS - creditedLastYear(all))
  if (months <= 0) throw new Error(`${r.referrer_email} has had ${CAP_MONTHS} free months this year, the cap.`)
  const acct = await getAccount(r.referrer_email)
  if (!acct?.stripe_customer_id || !acct.stripe_subscription_id) throw new Error(`${r.referrer_email} isn’t billed through Stripe, so there’s nothing to credit.`)
  const m = monthlyAmount(await getSubscription(acct.stripe_subscription_id))
  if (!m) throw new Error('Couldn’t read the referrer’s plan price from Stripe.')
  const friend = firstName(r.referee_name, r.referee_email)
  const txn = await addCredit(acct.stripe_customer_id, m.amount * months, m.currency, `Referral: ${friend} joined (${months} free month${months === 1 ? '' : 's'})`, `pen-ref-${r.id}`)
  const { error } = await supabaseAdmin.from('pen_referrals').update({ rewarded_at: new Date().toISOString(), reward_months: months, reward_txn: txn.id, reward_amount: m.amount * months, reward_currency: m.currency, reward_error: null, updated_at: new Date().toISOString() }).eq('id', id).is('rewarded_at', null)
  if (error) throw new Error(error.message)

  const lang = await userLang(r.referrer_email)
  const M = GIVEN_MAIL[lang]
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  await sendEmailResult({
    to: r.referrer_email,
    subject: M.subject,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
      M.body(friend, months) +
      `<p><a href="${base}/settings/invite" style="color:#0B6B44">${REF_MAIL[lang].see}</a></p>` +
      `<p style="color:#514E45">${REF_MAIL[lang].reply}</p></body></html>`,
  }).catch((e) => console.warn(`pen referral email failed: ${(e as Error).message}`))
  return { months }
}

/** The daily job: credit every referral whose 14-day hold is over. Returns what it did. */
export async function creditDue(): Promise<{ credited: string[]; failed: string[] }> {
  const { dueForReward } = await import('./referrals')
  const { supabaseAdmin } = await import('@/lib/supabase')
  const credited: string[] = []
  const failed: string[] = []
  for (const r of await dueForReward()) {
    try {
      const { months } = await giveReward(r.id)
      credited.push(`${r.referrer_email}: ${months} month(s) for ${r.referee_email}`)
    } catch (e) {
      const msg = (e as Error).message
      // Said once per problem, not every day.
      if (r.reward_error !== msg) failed.push(`${r.referrer_email} for ${r.referee_email}: ${msg}`)
      await supabaseAdmin.from('pen_referrals').update({ reward_error: msg.slice(0, 300) }).eq('id', r.id)
    }
  }
  if (credited.length || failed.length) {
    await notifyReferralNote(`Referral credits: ${credited.length} given${failed.length ? `, ${failed.length} need you` : ''}`, [
      ...credited.map((c) => ['Credited', c] as [string, string]),
      ...failed.map((f) => ['Couldn’t credit', f] as [string, string]),
    ]).catch(() => {})
  }
  return { credited, failed }
}
