import { NextResponse, after } from 'next/server'
import { parseInbound, verifySignature } from '@/lib/pen/whatsapp/vonage'
import { handleInbound } from '@/lib/pen/whatsapp/bot'
import { recordInbound } from '@/lib/pen/whatsapp/store'

export const dynamic = 'force-dynamic'
// Streaming a 100 MB file from Vonage to AssemblyAI happens inside after(); give it room.
export const maxDuration = 300

// Vonage posts every WhatsApp message here. The URL carries our own secret (the same one the
// AssemblyAI webhook uses), and Vonage's JWT signature is checked too when its secret is set.
//
// The 200 goes back at once and the work happens in after(). Vonage retries a slow webhook,
// and a retry is how a file would get transcribed twice; the message id is the second guard.
export async function POST(req: Request) {
  const secret = process.env.PEN_WEBHOOK_SECRET
  if (!secret || new URL(req.url).searchParams.get('k') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true, note: 'not json' })
  }
  // A text message to the number itself (not WhatsApp). Only expected once: Meta's
  // verification code when the number is registered for WhatsApp. Kept so it can be read.
  const sms = body as { channel?: string; message_uuid?: string; from?: string; text?: string }
  if (sms?.channel === 'sms' && sms.message_uuid) {
    await recordInbound({ id: sms.message_uuid, phone: String(sms.from ?? ''), email: null, kind: 'sms', state: 'received', payload: { raw: body } }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  const msg = parseInbound(body)
  if (!msg) return NextResponse.json({ ok: true, note: 'ignored' })

  after(async () => {
    try {
      await handleInbound(msg)
    } catch (e) {
      console.warn(`pen whatsapp: inbound ${msg.id} failed: ${(e as Error).message}`)
    }
  })
  return NextResponse.json({ ok: true })
}
