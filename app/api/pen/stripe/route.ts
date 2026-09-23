import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { activate, deactivate } from '@/lib/pen/accounts'
import { settleHoursCheckout } from '@/lib/pen/hours'
import { sendEmailResult } from '@/lib/news/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
          break
        }
        if (!email) break
        await activate({
          email,
          stripeCustomerId: typeof o.customer === 'string' ? o.customer : null,
          stripeSubscriptionId: typeof o.subscription === 'string' ? o.subscription : null,
          offer: o.metadata?.offer ?? null,
          plan: o.metadata?.plan ?? undefined,
        })
        // The subscription.created event that follows carries the trial dates; this one only
        // has to open the door, which it should do immediately rather than wait for it.
        await welcome(email, o.metadata?.offer ?? null, o.metadata?.plan ?? null).catch(() => {})
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
        if (live && email) {
          await activate({
            email,
            stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : null,
            stripeSubscriptionId: sub.id ?? null,
            currentPeriodEnd: periodEnd(sub),
            trialEndsAt: trialEnd(sub),
            offer: sub.metadata?.offer ?? null,
            plan: sub.metadata?.plan ?? undefined,
          })
        } else if (!live && sub.id) {
          await deactivate(sub.id)
        }
        break
      }

      // Three days before the card gets charged. Stripe only sends this when a trial is
      // ending with a payment method attached, so it is exactly the right moment to say so —
      // and a surprise charge is the fastest way to turn a trial into a chargeback.
      case 'customer.subscription.trial_will_end': {
        if (email) await trialEnding(email, trialEnd(o), o.metadata?.plan ?? null).catch(() => {})
        break
      }

      // The card declined when the trial ended. Stripe will retry, and the subscription goes
      // past_due, then canceled — the subscription.updated handler above closes the door. This
      // is here to tell them before that happens, while it is still fixable.
      case 'invoice.payment_failed': {
        if (email) await paymentFailed(email).catch(() => {})
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
        if (o.id) await deactivate(o.id)
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

const shell = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>` +
  `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
  body +
  `</body></html>`

async function trialEnding(email: string, endsAt: string | null, plan: string | null) {
  const when = endsAt
    ? new Date(endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : 'in three days'
  await sendEmailResult({
    to: email,
    subject: 'Your Juno Pen trial ends in three days',
    html: shell(
      // The yearly plan is charged $144 up front, not $15; saying $15 would be a surprise charge.
      (plan === 'annual'
        ? `<p>Your free trial ends on ${when}, and the card on file will be charged $144 for the year.</p>`
        : `<p>Your free trial ends on ${when}, and the card on file will be charged $15 for the first month.</p>`) +
        `<p>If Juno Pen hasn&rsquo;t earned that, cancel in one click and keep the recorder &mdash; ` +
        `no email, no call, nothing to explain.</p>` +
        `<p style="color:#514E45">Reply to this and it reaches a person.</p>`,
    ),
  })
}

async function paymentFailed(email: string) {
  const base = (process.env.PEN_PUBLIC_URL || 'https://pen.tryjunoapp.com').replace(/\/$/, '')
  await sendEmailResult({
    to: email,
    subject: 'Your card was declined',
    html: shell(
      `<p>We couldn&rsquo;t charge the card on file, so your Juno Pen account is on hold.</p>` +
        `<p>Your recordings and notes are untouched &mdash; update the card and everything ` +
        `comes straight back.</p>` +
        `<p><a href="${base}" style="color:#2C5F7C">${base.replace(/^https?:\/\//, '')}</a></p>` +
        `<p style="color:#514E45">If you meant to cancel, ignore this. Nothing else happens.</p>`,
    ),
  })
}

async function welcome(email: string, offer: string | null, plan: string | null) {
  const base = (process.env.PEN_PUBLIC_URL || 'https://pen.tryjunoapp.com').replace(/\/$/, '')
  await sendEmailResult({
    to: email,
    subject: 'Your Juno Pen account is open',
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
      `<p>You&rsquo;re all set. Sign in with this email address and everything is there.</p>` +
      `<p><a href="${base}" style="color:#2C5F7C">${base.replace(/^https?:\/\//, '')}</a></p>` +
      (offer === 'own-recorder'
        ? `<p>Upload anything to start &mdash; a voice memo off your phone works, and that is ` +
          `the fastest way to see what the write-up looks like.</p>`
        : plan === 'annual'
          ? `<p>Your year has started, and your recorder goes in the post shortly. In the ` +
            `meantime you can upload anything you already have &mdash; a voice memo works.</p>`
          // The trial counts from sign-up, not delivery, so the email must not say otherwise.
          : `<p>Your recorder goes in the post shortly, and your 21 free days have started. ` +
            `Upload anything you already have while it&rsquo;s on its way &mdash; a voice memo ` +
            `works, and it&rsquo;s the quickest way to see what the write-up looks like.</p>`) +
      `<p style="color:#514E45">Reply to this and it reaches a person.</p>` +
      `</body></html>`,
  })
}
