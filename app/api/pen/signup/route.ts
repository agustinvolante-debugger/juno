import { NextResponse } from 'next/server'
import { validate, saveSignup, type Signup } from '@/lib/pen/signup'
import { sendEmailResult } from '@/lib/news/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// The only unauthenticated write in the app. Everything else sits behind a Google session, so
// this route carries the protections the rest can assume: a honeypot, a minimum fill time, and
// a per-IP rate limit.

/** In-memory and therefore per-instance — a speed bump, not a wall, which is the right size of
 *  defence for a launch form. Anything stronger belongs in a WAF, not here. */
const hits = new Map<string, number[]>()
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 5

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear() // crude ceiling so this cannot grow unbounded
  return recent.length > MAX_PER_WINDOW
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // Honeypot: a field hidden from people and irresistible to bots. Answer 200 so the bot
  // records a success and does not retune.
  if (typeof b.company === 'string' && b.company.trim()) {
    return NextResponse.json({ ok: true })
  }

  // Nobody fills this form in under two seconds.
  if (typeof b.elapsed === 'number' && b.elapsed < 2000) {
    return NextResponse.json({ ok: true })
  }

  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })
  }

  const v = validate(b)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  try {
    const { created } = await saveSignup(v.value)

    // Confirmation to them, and a heads-up to us. Neither is allowed to fail the signup —
    // the record is already saved, and an email problem is ours, not theirs.
    void sendConfirmation(v.value.name, v.value.email).catch(() => {})
    void notifyOwner(v.value, created).catch(() => {})

    return NextResponse.json({ ok: true, created })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function sendConfirmation(name: string, email: string) {
  const first = name.split(/\s+/)[0]
  await sendEmailResult({
    to: email,
    subject: 'You’re on the list for Pen',
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
      `<p>Hi ${esc(first)},</p>` +
      `<p>You’re on the list. Pen turns a recorded conversation into the write-up — what was said, ` +
      `who said it, what you agreed to, and the thing you nearly missed.</p>` +
      `<p>We have your address and will get the recorder in the post.</p>` +
      `<p>We’ll email you the moment your account is open. Replying to this reaches a person.</p>` +
      `<p style="color:#514E45">— Agustin</p>` +
      `</body></html>`,
  })
}

async function notifyOwner(s: Signup, created: boolean) {
  const to = process.env.PEN_SIGNUP_NOTIFY || process.env.RESEND_FROM_EMAIL
  if (!to) return
  const rows: [string, string][] = [
    ['Name', s.name],
    ['Email', s.email],
    ['Phone', s.phone ?? '—'],
    ['Role', s.role ?? '—'],
    ['Ship to', [s.ship_line1, s.ship_line2, s.ship_city, s.ship_state, s.ship_postcode, s.ship_country].filter(Boolean).join(', ') || '—'],
    ['Note', s.note ?? '—'],
  ]
  await sendEmailResult({
    to: to.replace(/^.*<|>.*$/g, ''),
    subject: `${created ? 'New' : 'Updated'} Pen signup — ${s.name}`,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:20px">` +
      rows.map(([k, val]) => `<div><strong>${k}:</strong> ${esc(String(val))}</div>`).join('') +
      `</body></html>`,
  })
}
