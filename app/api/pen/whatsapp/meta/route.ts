import { NextResponse, after } from 'next/server'
import { parseFailedStatuses, parseInboundAll, verifySignature } from '@/lib/pen/whatsapp/meta'
import { supabaseAdmin } from '@/lib/supabase'
import { notifyUnreachable } from '@/lib/pen/whatsapp/unreachable'
import { handleInbound } from '@/lib/pen/whatsapp/bot'

export const dynamic = 'force-dynamic'
// Streaming a 100 MB file from Meta to AssemblyAI happens inside after(), and a text waits there
// for the rest of its burst and for the turn before it (bot.ts, up to 270 s); give it room.
export const maxDuration = 300

// Meta's WhatsApp webhook. GET is the one-time handshake when the URL is registered in the app
// dashboard; POST carries messages and delivery statuses, signed with the app secret.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const want = process.env.META_WA_VERIFY_TOKEN
  if (want && q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === want) {
    return new Response(q.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

// The 200 goes back at once and the work happens in after(): Meta retries a slow webhook, and
// the message id (recorded first thing in handleInbound) makes a retry a no-op.
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true, note: 'not json' })
  }
  // Replies Meta accepted but could not deliver. Logged and kept (health.ts alerts on them),
  // because a 200 from the send API says nothing about whether it arrived.
  const failed = parseFailedStatuses(body)
  if (failed.length) {
    after(async () => {
      for (const f of failed) console.warn(`pen whatsapp (meta): delivery failed to …${f.recipient.slice(-4)}: ${f.code} ${f.title} ${f.detail}`)
      await supabaseAdmin
        .from('pen_whatsapp_failures')
        .upsert(failed.map((f) => ({ message_id: f.messageId, recipient: f.recipient, code: f.code, title: f.title, detail: f.detail, failed_at: f.at })), { onConflict: 'message_id' })
        .then(({ error }) => error && console.warn(`pen whatsapp (meta): could not store failures: ${error.message}`))
      // Someone who will never hear back on this number gets told by email, once.
      await notifyUnreachable(failed)
    })
  }

  // Side by side, not one after the other: two texts in one webhook call are one burst (bot.ts
  // waits a few seconds for the rest of a burst, then answers once). t0 + index keeps their order.
  const msgs = parseInboundAll(body)
  if (msgs.length) {
    after(async () => {
      const t0 = Date.now()
      await Promise.all(
        msgs.map((m, i) =>
          handleInbound(m, { at: t0 + i }).catch((e) => console.warn(`pen whatsapp (meta): inbound ${m.id} failed: ${(e as Error).message}`)),
        ),
      )
    })
  }
  return NextResponse.json({ ok: true })
}
