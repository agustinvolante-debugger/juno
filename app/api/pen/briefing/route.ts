import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { renderBriefing, sendBriefing, hasSomethingToSay } from '@/lib/pen/briefing'
import { getSession, updateSession } from '@/lib/pen/store'
import type { PenSession } from '@/lib/pen/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


// Compiles the note into an HTML email and sends it to the signed-in user, plus anyone they
// explicitly add.
//
// The signed-in user is ALWAYS a recipient and is always first. That is the guard against
// this becoming an open relay: you cannot use it to mail a stranger without also mailing
// yourself, so every send is attributable and visible to the person who triggered it.
// Extras are capped, de-duplicated and syntax-checked.
const MAX_EXTRA = 5
const EMAIL_RE = /^[^\s@,;:<>()\[\]\\]+@[^\s@.,;:<>()\[\]\\]+\.[a-z]{2,}$/i

/** Validated, de-duplicated, never including the sender (who is added separately). */
function cleanRecipients(raw: unknown, self: string): { list: string[]; bad: string[] } {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\s]+/)
      : []
  const seen = new Set([self.toLowerCase()])
  const list: string[] = []
  const bad: string[] = []
  for (const v of items) {
    const e = String(v ?? '').trim()
    if (!e) continue
    if (!EMAIL_RE.test(e)) {
      bad.push(e)
      continue
    }
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    if (list.length < MAX_EXTRA) list.push(e)
  }
  return { list, bad }
}

// Preview without sending. Renders exactly what POST would email, so the thing can be
// eyeballed (and reviewed for anything sensitive) before it leaves the building.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const session = await getSession(email, id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return new Response(renderBriefing(session), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; also?: string[] | string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { list: extras, bad } = cleanRecipients(b.also, email)
  if (bad.length) {
    return NextResponse.json(
      { error: `Not a valid email address: ${bad.slice(0, 3).join(', ')}` },
      { status: 400 },
    )
  }

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (!hasSomethingToSay(session)) {
    return NextResponse.json({ error: 'nothing to brief yet — write the notes first' }, { status: 400 })
  }

  const to = [email, ...extras]
  const r = await sendBriefing({ session, to, replyTo: email })

  if (!r.ok) {
    return NextResponse.json({ error: r.error ?? 'Nothing was sent.' }, { status: 502 })
  }

  const sentAt = new Date().toISOString()
  await updateSession(session.id, { briefing_sent_at: sentAt })
  return NextResponse.json({ ok: true, to, briefing_sent_at: sentAt })
}
