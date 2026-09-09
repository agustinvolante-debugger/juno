import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { sendEmail } from '@/lib/news/email'
import { getSession, updateSession } from '@/lib/pen/store'
import type { PenSession } from '@/lib/pen/store'
import { buildBriefingHtml } from '@/lib/pen/briefing-html'
import { fmtDurServer } from '@/lib/pen/briefing-html-util'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function render(session: PenSession) {
  const base = (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
  return buildBriefingHtml({
    notes: session.notes ?? {},
    title: session.title ?? session.source_name ?? 'Untitled recording',
    dateStr: new Date(session.recorded_at ?? session.created_at).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    clientName: session.client_name,
    durationStr: fmtDurServer(session.duration_sec ?? 0),
    appUrl: base || 'https://pen.tryjunoapp.com',
    actionDone: Array.isArray(session.action_done) ? session.action_done : [],
  })
}

// Compiles the note into an HTML email and sends it to the signed-in user's own address.
// No recipient is accepted from the client: this is a note-to-self feature, and letting the
// browser choose a destination would turn it into an open relay for someone else's data.
// Preview without sending. Renders exactly what POST would email, so the thing can be
// eyeballed (and reviewed for anything sensitive) before it leaves the building.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const session = await getSession(email, id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return new Response(render(session), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const n = session.notes ?? {}
  if (!n.summary && !n.actions?.length && !n.missed?.length && !n.open_questions?.length) {
    return NextResponse.json({ error: 'nothing to brief yet — write the notes first' }, { status: 400 })
  }

  const title = session.title ?? session.source_name ?? 'Untitled recording'
  const html = render(session)

  const ok = await sendEmail({
    to: email,
    subject: `Briefing — ${title}`,
    html,
  })

  if (!ok) {
    // sendEmail swallows its own errors and returns false, so distinguish the likely cause.
    const configured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
    return NextResponse.json(
      {
        error: configured
          ? 'The mail provider rejected it. Nothing was sent.'
          : 'Email is not configured on this deployment (RESEND_API_KEY / RESEND_FROM_EMAIL).',
      },
      { status: 502 },
    )
  }

  const sentAt = new Date().toISOString()
  await updateSession(session.id, { briefing_sent_at: sentAt })
  return NextResponse.json({ ok: true, to: email, briefing_sent_at: sentAt })
}
