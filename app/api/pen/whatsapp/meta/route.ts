import { NextResponse, after } from 'next/server'
import { parseInboundAll, verifySignature } from '@/lib/pen/whatsapp/meta'
import { handleInbound } from '@/lib/pen/whatsapp/bot'

export const dynamic = 'force-dynamic'
// Streaming a 100 MB file from Meta to AssemblyAI happens inside after(); give it room.
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
  const msgs = parseInboundAll(body)
  if (msgs.length) {
    after(async () => {
      for (const m of msgs) {
        try {
          await handleInbound(m)
        } catch (e) {
          console.warn(`pen whatsapp (meta): inbound ${m.id} failed: ${(e as Error).message}`)
        }
      }
    })
  }
  return NextResponse.json({ ok: true })
}
