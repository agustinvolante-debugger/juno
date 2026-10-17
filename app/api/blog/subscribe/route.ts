// Newsletter sign-up from the blog. Adds the address to a Resend audience (Resend now calls them
// "segments"; the ID is the same). Chris sends each issue from Resend's Broadcasts dashboard.
// No database table: Resend holds the list and handles unsubscribes.
//
// Env: RESEND_API_KEY (already set for the app's email) + RESEND_BLOG_AUDIENCE_ID.
// Without the audience ID this is a dry run: it logs and reports success, so the form can be
// tried locally.

import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Light, per-instance rate limit: 5 attempts per IP per 10 minutes. Serverless instances do not
// share memory, so this only blunts a burst from one client; the honeypot catches the dumb bots.
const WINDOW_MS = 10 * 60 * 1000
const LIMIT = 5
const hits = new Map<string, number[]>()

function limited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > LIMIT
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (limited(ip)) {
    return NextResponse.json({ error: 'Too many tries. Wait a few minutes and try again.' }, { status: 429 })
  }

  let body: { email?: unknown; company?: unknown; from?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  // A filled honeypot means a bot. Say yes and do nothing, so it learns nothing.
  if (typeof body.company === 'string' && body.company.trim()) return NextResponse.json({ ok: true })

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'That address looks incomplete. Check it and try again.' }, { status: 400 })
  }

  const audience = process.env.RESEND_BLOG_AUDIENCE_ID
  if (!audience || !process.env.RESEND_API_KEY) {
    console.log(`[blog] newsletter dry run (RESEND_BLOG_AUDIENCE_ID not set): would add ${email.replace(/^(.).*(@.*)$/, '$1…$2')}`)
    return NextResponse.json({ ok: true, dryRun: true })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.contacts.create({ email, unsubscribed: false, segments: [{ id: audience }] })
  // Already on the list counts as success: the visitor's intent is satisfied either way.
  if (error && !/already|exists/i.test(error.message)) {
    console.error('[blog] newsletter: Resend error', error.name, error.message)
    return NextResponse.json({ error: 'Something went wrong on our side. Try again in a minute.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
