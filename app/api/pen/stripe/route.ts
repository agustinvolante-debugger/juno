import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { activate, deactivate, getAccountByStripe, setCancelAt, setPausedUntil } from '@/lib/pen/accounts'
import { sendCancelScheduled, sendEnded, sendWelcomeBack } from '@/lib/pen/cancel-mail'
import { referralCheckout, referralInvoicePaid, referralRefund } from '@/lib/pen/referral-events'
import { settleHoursCheckout } from '@/lib/pen/hours'
import { sendEmailResult } from '@/lib/news/email'
import { planPrice, parsePlan, parseOffer } from '@/lib/pen/plan'
import { LOCAL_PRICES, money, parseCurrency, parseLang } from '@/lib/pen/currency'
import { rememberAppLanguage } from '@/lib/pen/profile'
import { notifyPaid, notifyHours } from '@/lib/pen/notify-owner'
import { cancelAtOf, chargeCustomer, customerEmail, portalLoginUrl, type Subscription } from '@/lib/pen/stripe'

export const dynamic = 'force-dynamic'
// A purchase can release held recordings, and a pieced one is stitched into AssemblyAI on the way.
export const maxDuration = 300

// Stripe tells us who paid. Without this the funnel has no middle: someone signs up, pays, and
// the product still has no idea who they are.
//
// The signature is verified by hand rather than with the Stripe SDK — it is an HMAC over
// "timestamp.body" and checking it costs twenty lines, against a dependency that would be
// pulled in for this one route.

/** Stripe signs the RAW body, so it must be read as text before any JSON parsing. */
function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, ...rest] = kv.split('=')
      return [k.trim(), rest.join('=')]
    }),
  ) as { t?: string; v1?: string }
  if (!parts.t || !parts.v1) return false

  // Reject anything older than five minutes so a captured request cannot be replayed.
  const age = Math.abs(Date.now() / 1000 - Number(parts.t))
  if (!Number.isFinite(age) || age > 300) return false

  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(parts.v1)
  // Length check first: timingSafeEqual throws on a mismatch rather than returning false.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * When the current billing period ends.
 *
 * `current_period_end` was removed from the Subscription object and moved onto each
 * subscription item (API 2025-03-31 onwards). We were reading the old top-level field, which
 * has been quietly returning undefined — every account row has a null period end. Reads the
 * item first and keeps the legacy path for anything signed by an older API version.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function periodEnd(sub: Record<string, any>): string | null {
  const secs = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end
  return typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null
}

/** Trial end, in ISO, or null when there is no trial. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trialEnd(sub: Record<string, any>): string | null {
  return typeof sub?.trial_end === 'number' ? new Date(sub.trial_end * 1000).toISOString() : null
}

type StripeEvent = {
  type: string
  data: {
    object: {
      id?: string
      customer?: string
      subscription?: string
      status?: string
      current_period_end?: number
      customer_email?: string | null
      customer_details?: { email?: string | null } | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    } & Record<string, any>
  }
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'stripe webhook not configured' }, { status: 503 })

  const raw = await req.text()
  if (!verify(raw, req.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }

  let event: StripeEvent
  try {
    event = JSON.parse(raw) as StripeEvent
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }

  const o = event.data?.object ?? {}
  const email =
    (o.customer_details?.email || o.customer_email || o.receipt_email || '').toLowerCase() || null

  try {
    switch (event.type) {
      // The moment a Payment Link checkout succeeds. This is the one that matters.
      case 'checkout.session.completed': {
        // Extra hours are a one-off payment, not a subscription. They must never reach
        // activate(), which would overwrite the account's subscription id with null.
        if (o.metadata?.kind === 'hours') {
          await settleHoursCheckout({
            id: o.id ?? '',
            payment_status: o.payment_status,
            amount_total: o.amount_total,
            metadata: o.metadata,
          })
          if (email) await notifyHours({ email, amountCents: o.amount_total ?? null, hours: o.metadata?.hours ?? null }).catch(() => {})
          break
        }
        if (!email) break
        const first = await activate({
          email,
          stripeCustomerId: typeof o.customer === 'string' ? o.customer : null,
          stripeSubscriptionId: typeof o.subscription === 'string' ? o.subscription : null,
          offer: o.metadata?.offer ?? null,
          plan: o.metadata?.plan ?? undefined,
        })
        // The subscription.created event that follows carries the trial dates; this one only
        // has to open the door, which it should do immediately rather than wait for it.
        // The language they signed up in becomes their App language unless they already chose
        // one, so briefings and WhatsApp replies match from the first recording.
        if (o.metadata?.lang) await rememberAppLanguage(email, parseLang(o.metadata.lang)).catch(() => {})
        console.log(`pen stripe: checkout completed for ${email} (${o.metadata?.offer ?? '?'}), first=${first}`)
        if (first) await greet(email, o.metadata ?? {}, o.amount_total ?? null)
        // A friend's referral: their first month, and the count if they paid just now.
        await referralCheckout(o, email)
        break
      }

      // Renewals and plan changes keep the period end honest.
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = o
        // `trialing` counts as live: the card is on file and the product is theirs to use.
        // `past_due` does NOT — the card failed at the end of the trial, which is exactly the
        // case this whole mechanic exists to catch.
        const live = sub.status === 'active' || sub.status === 'trialing'
        const subEmail = email || (await emailForSubscription(sub))
        if (live && subEmail) {
          const first = await activate({
            email: subEmail,
            stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : null,
            stripeSubscriptionId: sub.id ?? null,
            currentPeriodEnd: periodEnd(sub),
            trialEndsAt: trialEnd(sub),
            offer: sub.metadata?.offer ?? null,
            plan: sub.metadata?.plan ?? undefined,
          })
          // If this event beat checkout.session.completed (or that one never comes), the
          // signup is greeted here instead. Nothing is charged today on a trial.
          console.log(`pen stripe: ${event.type} for ${subEmail} (${sub.status}), first=${first}`)
          if (first) await greet(subEmail, sub.metadata ?? {}, sub.status === 'trialing' ? 0 : null)
          // Cancelled at period end (in the app or Stripe's portal), or taken back. Whichever
          // records it first sends the confirmation, so the in-app cancel and this can't double up.
          if (sub.id) {
            const at = cancelAtOf(sub as Subscription)
            const reason = sub.cancellation_details?.feedback ?? null
            if (await setCancelAt(sub.id, at, at ? reason : null)) {
              const acct = await getAccountByStripe(sub.id, null).catch(() => null)
              await sendCancelScheduled(subEmail, at!, acct?.offer ?? sub.metadata?.offer ?? null).catch((e) => console.warn(`pen cancel email failed: ${(e as Error).message}`))
            }
          }
        } else if (!live && sub.id) {
          await ended(sub)
        }
        // A pause started or ended (in the app, the dashboard, or by Stripe on the resume
        // date). Stripe clears pause_collection itself when the date arrives.
        if (sub.id) {
          const resumes = sub.pause_collection?.resumes_at
          await setPausedUntil(sub.id, typeof resumes === 'number' ? new Date(resumes * 1000).toISOString() : null)
        }
        break
      }

      // Three days before the card gets charged. Stripe only sends this when a trial is
      // ending with a payment method attached, so it is exactly the right moment to say so —
      // and a surprise charge is the fastest way to turn a trial into a chargeback.
      case 'customer.subscription.trial_will_end': {
        // Same as above: a subscription event, so no email on it. Before this lookup the
        // trial-ending email was never sent at all.
        // Cancelled during the trial: it ends on that date and nothing is charged, so "your card
        // will be charged" would be false.
        if (o.cancel_at_period_end || o.cancel_at) break
        const to = email || (await emailForSubscription(o))
        if (to) await trialEnding(to, trialEnd(o), o.metadata?.plan ?? null, o.metadata?.offer ?? null, o.metadata?.lang, o.metadata?.currency ?? null).catch(() => {})
        break
      }

      // The card declined when the trial ended. Stripe will retry, and the subscription goes
      // past_due, then canceled — the subscription.updated handler above closes the door. This
      // is here to tell them before that happens, while it is still fixable.
      // Any paid invoice. Only referrals care, and only about a friend's first real payment.
      case 'invoice.paid': {
        await referralInvoicePaid(o)
        break
      }

      // A referred friend's payment refunded (at least half of it) or disputed: the referral
      // is void, and unused credit is taken back from the referrer (lib/pen/referral-events.ts).
      case 'charge.refunded': {
        if ((o.amount_refunded ?? 0) * 2 >= (o.amount ?? 0)) await referralRefund(typeof o.customer === 'string' ? o.customer : null, 'refund')
        break
      }
      case 'charge.dispute.created': {
        const charge = typeof o.charge === 'string' ? o.charge : null
        if (charge) await referralRefund(await chargeCustomer(charge).catch(() => null), 'chargeback')
        break
      }

      case 'invoice.payment_failed': {
        if (email) await paymentFailed(email, invoiceLang(o)).catch(() => {})
        break
      }

      // A delayed payment method (a bank debit) settling after checkout already completed.
      case 'checkout.session.async_payment_succeeded': {
        if (o.metadata?.kind === 'hours') {
          await settleHoursCheckout({ id: o.id ?? '', payment_status: o.payment_status, amount_total: o.amount_total, metadata: o.metadata })
        }
        break
      }

      case 'customer.subscription.deleted': {
        if (o.id) await ended(o)
        break
      }
    }
  } catch (e) {
    // 500 so Stripe retries — losing a payment event is worse than handling it twice, and
    // activate() is an upsert, so twice is harmless.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/** The plan is over: read-only from now (lib/pen/access.ts), and say so once. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ended(sub: Record<string, any>) {
  // Looked up before deactivate, while the row still matches this subscription as active.
  const to = await emailForSubscription(sub).catch(() => null)
  // Only a real end is announced. A declined card (past_due, unpaid) also closes the account,
  // but the payment-failed email already told them, and fixing the card brings it straight back.
  if ((await deactivate(sub.id)) && to && sub.status === 'canceled') {
    await sendEnded(to, new Date().toISOString()).catch((e) => console.warn(`pen ended email failed: ${(e as Error).message}`))
  }
}

/** A new customer: their welcome email, and the owners' "new customer" email with the address. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function greet(email: string, meta: Record<string, any>, amountCents: number | null) {
  // Reactivated after the plan ended: they know the product, so no "your pen is in the post".
  if (meta.returning === '1') {
    await sendWelcomeBack(email).catch((e) => console.warn(`pen welcome-back failed: ${(e as Error).message}`))
    await notifyPaid({ email, plan: meta.plan ?? null, offer: meta.offer ?? null, amountCents, returning: true }).catch((e) => console.warn(`pen notify failed: ${(e as Error).message}`))
    return
  }
  await welcome(email, meta.offer ?? null, meta.plan ?? null, meta.lang).catch((e) => console.warn(`pen welcome failed: ${(e as Error).message}`))
  await notifyPaid({ email, plan: meta.plan ?? null, offer: meta.offer ?? null, amountCents }).catch((e) => console.warn(`pen notify failed: ${(e as Error).message}`))
}

const shell = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>` +
  `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
  body +
  `</body></html>`

// Customer emails in the language they signed up in (Stripe metadata `lang`, set at
// checkout), and trial amounts in the currency they pay in (metadata `currency`).
type MailLang = 'en' | 'es' | 'pt'
const LOCALE: Record<MailLang, string> = { en: 'en-GB', es: 'es-CL', pt: 'pt-BR' }

const MAIL = {
  en: {
    trialSubject: 'Your Juno Pen trial ends in three days',
    trialBody: (when: string, charge: string) => `<p>Your free trial ends on ${when}, and the card on file will be charged ${charge}.</p>`,
    trialCancel: (url: string) => `<p>If Juno Pen hasn&rsquo;t earned that, <a href="${url}" style="color:#0B6B44">cancel here</a> before then and you won&rsquo;t be charged. No email, no call, nothing to explain.</p>`,
    inThreeDays: 'in three days',
    firstMonth: (p: string) => `${p} for the first month`,
    firstMonths: (p: string, n: number) => `${p} for the first ${n} months`,
    forPlan: 'for your plan',
    declinedSubject: 'Your card was declined',
    declined: '<p>We couldn&rsquo;t charge the card on file, so your Juno Pen account is on hold.</p><p>Your recordings and notes are untouched. Update the card and everything comes straight back.</p>',
    declinedIgnore: 'If you meant to cancel, ignore this. Nothing else happens.',
    updateCard: 'Update your card',
    welcomeSubject: 'Your Juno Pen account is open',
    welcomeTop: '<p>You&rsquo;re all set. Sign in with this email address and everything is there.</p>',
    welcomeOwn: '<p>Upload anything to start: a voice memo off your phone works, and it&rsquo;s the fastest way to see what the write-up looks like.</p>',
    welcomePrepaid: (len: string) => `<p>Your ${len} started, and your recorder goes in the post shortly. In the meantime you can upload anything you already have; a voice memo works.</p>`,
    year: 'year', half: 'six months',
    welcomeMonthlyPen: '<p>Your recorder goes in the post shortly, and your 21 free days have started. Upload anything you already have while it&rsquo;s on its way; a voice memo works.</p>',
    welcomeFreePen: '<p>Your free Juno pen goes in the post shortly, and your 30 free days have started. Nothing is charged until the trial ends, and you can cancel anytime in Settings. Upload anything you already have while the pen is on its way; a voice memo works.</p>',
    invite: (url: string) => `<p>Know someone who’d use it? <a href="${url}" style="color:#0B6B44">Your invite link</a> gives them their first month free, and you a free month when they pay.</p>`,
    reply: 'Reply to this and it reaches a person.',
  },
  es: {
    trialSubject: 'Tu prueba de Juno Pen termina en tres días',
    trialBody: (when: string, charge: string) => `<p>Tu prueba gratis termina el ${when}, y se cobrará ${charge} a la tarjeta registrada.</p>`,
    trialCancel: (url: string) => `<p>Si Juno Pen no te sirvió, <a href="${url}" style="color:#0B6B44">cancela aquí</a> antes de esa fecha y no se te cobrará. Sin correos, sin llamadas, sin explicaciones.</p>`,
    inThreeDays: 'en tres días',
    firstMonth: (p: string) => `${p} por el primer mes`,
    firstMonths: (p: string, n: number) => `${p} por los primeros ${n} meses`,
    forPlan: 'el valor de tu plan',
    declinedSubject: 'Tu tarjeta fue rechazada',
    declined: '<p>No pudimos cobrar a la tarjeta registrada, así que tu cuenta de Juno Pen está en pausa.</p><p>Tus grabaciones y notas están intactas. Actualiza la tarjeta y todo vuelve al instante.</p>',
    declinedIgnore: 'Si querías cancelar, ignora este correo. No pasa nada más.',
    updateCard: 'Actualiza tu tarjeta',
    welcomeSubject: 'Tu cuenta de Juno Pen está lista',
    welcomeTop: '<p>Todo listo. Entra con este correo y ahí está todo.</p>',
    welcomeOwn: '<p>Para empezar, sube cualquier audio o mándalo por WhatsApp: una nota de voz del celular sirve, y es la forma más rápida de ver cómo queda el resumen.</p>',
    welcomePrepaid: (len: string) => `<p>Empezaron tus ${len}, y te enviaremos el lápiz pronto. Mientras tanto puedes subir cualquier audio que ya tengas.</p>`,
    year: '12 meses', half: 'seis meses',
    welcomeMonthlyPen: '<p>Te enviaremos el lápiz pronto, y tus 21 días gratis ya empezaron. Mientras llega, sube cualquier audio que ya tengas.</p>',
    welcomeFreePen: '<p>Tu lápiz Juno gratis sale por correo muy pronto, y tus 30 días gratis ya empezaron. No se cobra nada hasta que termine la prueba, y puedes cancelar cuando quieras en Configuración. Mientras llega, sube cualquier audio que ya tengas; una nota de voz sirve.</p>',
    invite: (url: string) => `<p>¿Conoces a alguien a quien le sirva? <a href="${url}" style="color:#0B6B44">Tu enlace de invitación</a> le da su primer mes gratis, y a ti un mes gratis cuando pague.</p>`,
    reply: 'Responde este correo y te contesta una persona.',
  },
  pt: {
    trialSubject: 'Seu teste do Juno Pen termina em três dias',
    trialBody: (when: string, charge: string) => `<p>Seu teste grátis termina em ${when}, e o cartão cadastrado será cobrado em ${charge}.</p>`,
    trialCancel: (url: string) => `<p>Se o Juno Pen não valeu a pena, <a href="${url}" style="color:#0B6B44">cancele aqui</a> antes dessa data e nada será cobrado. Sem e-mails, sem ligações, sem explicações.</p>`,
    inThreeDays: 'em três dias',
    firstMonth: (p: string) => `${p} pelo primeiro mês`,
    firstMonths: (p: string, n: number) => `${p} pelos primeiros ${n} meses`,
    forPlan: 'o valor do seu plano',
    declinedSubject: 'Seu cartão foi recusado',
    declined: '<p>Não conseguimos cobrar o cartão cadastrado, então sua conta do Juno Pen está pausada.</p><p>Suas gravações e notas estão intactas. Atualize o cartão e tudo volta na hora.</p>',
    declinedIgnore: 'Se você queria cancelar, ignore este e-mail. Nada mais acontece.',
    updateCard: 'Atualize seu cartão',
    welcomeSubject: 'Sua conta do Juno Pen está pronta',
    welcomeTop: '<p>Tudo certo. Entre com este e-mail e está tudo lá.</p>',
    welcomeOwn: '<p>Para começar, envie qualquer áudio pelo site ou pelo WhatsApp: uma mensagem de voz do celular serve, e é o jeito mais rápido de ver como fica o resumo.</p>',
    welcomePrepaid: (len: string) => `<p>Seus ${len} começaram, e enviaremos a caneta em breve. Enquanto isso, você pode enviar qualquer áudio que já tenha.</p>`,
    year: '12 meses', half: 'seis meses',
    welcomeMonthlyPen: '<p>Enviaremos a caneta em breve, e seus 21 dias grátis já começaram. Enquanto ela chega, envie qualquer áudio que já tenha.</p>',
    welcomeFreePen: '<p>Sua caneta Juno grátis sai pelo correio em breve, e seus 30 dias grátis já começaram. Nada é cobrado até o fim do teste, e você pode cancelar quando quiser em Configurações. Enquanto ela chega, envie qualquer áudio que já tiver; uma mensagem de voz serve.</p>',
    invite: (url: string) => `<p>Conhece alguém que usaria? <a href="${url}" style="color:#0B6B44">Seu link de convite</a> dá a essa pessoa o primeiro mês grátis, e a você um mês grátis quando ela pagar.</p>`,
    reply: 'Responda este e-mail e uma pessoa vai ler.',
  },
} as const

function mailLang(v: unknown): MailLang {
  return v === 'es' || v === 'pt' ? v : 'en'
}

function trialCharge(plan: string | null, offer: string | null, lang: MailLang, currency: string | null): string {
  const M = MAIL[lang]
  const p = planPrice(parseOffer(offer), parsePlan(plan))
  if (!p) return M.forPlan
  const cur = parseCurrency(currency)
  const amount =
    cur === 'usd' ? money(p.usd, 'usd') : money(p.months === 1 ? LOCAL_PRICES[cur].monthly : LOCAL_PRICES[cur].halfyear, cur)
  return p.months === 1 ? M.firstMonth(amount) : M.firstMonths(amount, p.months)
}

// Subscription objects carry no email. Our account row knows it (by subscription, then
// customer); failing that, the Stripe customer does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emailForSubscription(sub: Record<string, any>): Promise<string | null> {
  const customer = typeof sub.customer === 'string' ? sub.customer : null
  const found = await getAccountByStripe(sub.id ?? null, customer).catch(() => null)
  if (found?.email) return found.email
  return customer ? ((await customerEmail(customer).catch(() => null))?.toLowerCase() ?? null) : null
}

// Where an email sends someone to cancel or fix their card: Stripe's portal sign-in, which needs
// no Juno session (an account on hold can't get into the app). Our own route if it isn't set.
function billingUrl(): string {
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  return portalLoginUrl() ?? `${base}/api/pen/billing`
}

async function trialEnding(email: string, endsAt: string | null, plan: string | null, offer: string | null = null, langRaw: unknown = null, currency: string | null = null) {
  const lang = mailLang(langRaw)
  const M = MAIL[lang]
  const when = endsAt ? new Date(endsAt).toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'long' }) : M.inThreeDays
  await sendEmailResult({
    to: email,
    subject: M.trialSubject,
    // The amount comes from the plan and currency they are on; a wrong amount here would be
    // a surprise charge.
    html: shell(M.trialBody(when, trialCharge(plan, offer, lang, currency)) + M.trialCancel(billingUrl()) + `<p style="color:#514E45">${M.reply}</p>`),
  })
}

async function paymentFailed(email: string, langRaw: unknown = null) {
  const M = MAIL[mailLang(langRaw)]
  await sendEmailResult({
    to: email,
    subject: M.declinedSubject,
    html: shell(
      M.declined +
        `<p><a href="${billingUrl()}" style="color:#0B6B44">${M.updateCard}</a></p>` +
        `<p style="color:#514E45">${M.declinedIgnore}</p>`,
    ),
  })
}

async function welcome(email: string, offer: string | null, plan: string | null, langRaw: unknown = null) {
  const M = MAIL[mailLang(langRaw)]
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  await sendEmailResult({
    to: email,
    subject: M.welcomeSubject,
    html: shell(
      M.welcomeTop +
        `<p><a href="${base}" style="color:#0B6B44">${base.replace(/^https?:\/\//, '')}</a></p>` +
        (offer === 'own-recorder'
          ? M.welcomeOwn
          : offer === 'free-pen'
            ? M.welcomeFreePen
            : plan === 'annual' || plan === 'halfyear'
            ? M.welcomePrepaid(plan === 'annual' ? M.year : M.half)
            // The trial counts from sign-up, not delivery, so the email must not say otherwise.
            : M.welcomeMonthlyPen) +
        M.invite(`${base}/settings/invite`) +
        `<p style="color:#514E45">${M.reply}</p>`,
    ),
  })
}

/** An invoice carries its subscription's metadata in one of two places depending on API version. */
function invoiceLang(o: Record<string, unknown>): unknown {
  const inv = o as { subscription_details?: { metadata?: Record<string, string> }; parent?: { subscription_details?: { metadata?: Record<string, string> } }; metadata?: Record<string, string> }
  return inv.parent?.subscription_details?.metadata?.lang ?? inv.subscription_details?.metadata?.lang ?? inv.metadata?.lang ?? null
}
