import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { activate, deactivate } from '@/lib/pen/accounts'
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
        if (!email) break
        await activate({
          email,
          stripeCustomerId: typeof o.customer === 'string' ? o.customer : null,
          stripeSubscriptionId: typeof o.subscription === 'string' ? o.subscription : null,
        })
        await welcome(email).catch(() => {})
        break
      }

      // Renewals and plan changes keep the period end honest.
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = o
        const live = sub.status === 'active' || sub.status === 'trialing'
        if (live && email) {
          await activate({
            email,
            stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : null,
            stripeSubscriptionId: sub.id ?? null,
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
        } else if (!live && sub.id) {
          await deactivate(sub.id)
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

async function welcome(email: string) {
  const base = (process.env.PEN_PUBLIC_URL || 'https://pen.tryjunoapp.com').replace(/\/$/, '')
  await sendEmailResult({
    to: email,
    subject: 'Your Pen account is open',
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
      `<p>You&rsquo;re all set. Sign in with this email address and everything is there.</p>` +
      `<p><a href="${base}" style="color:#2C5F7C">${base.replace(/^https?:\/\//, '')}</a></p>` +
      `<p>Your recorder goes in the post shortly. In the meantime you can upload anything you ` +
      `already have &mdash; a voice memo works.</p>` +
      `<p style="color:#514E45">Reply to this and it reaches a person.</p>` +
      `</body></html>`,
  })
}
