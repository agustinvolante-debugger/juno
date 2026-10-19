import crypto from 'node:crypto'
import { NextResponse, after } from 'next/server'
import { handleInbound } from '@/lib/pen/whatsapp/bot'
import { configured, toInbound } from '@/lib/pen/imessage/sendblue'

// Sendblue's "receive" webhook (iMessage, lib/pen/imessage/sendblue.ts). The URL carries a
// secret (?key=), because Sendblue doesn't document a signature scheme; anything without it is
// refused. The 200 goes back at once and the bot runs in after(), like the WhatsApp webhook:
// Sendblue waits 45 s and retries on silence, and the bot ignores a message it has already seen.

export const dynamic = 'force-dynamic'
// A recording sent this way is streamed to AssemblyAI inside after(), and a text waits there for
// the rest of its burst and for the turn before it (bot.ts, up to 270 s); give it room.
export const maxDuration = 300

function keyOk(given: string | null): boolean {
  const want = process.env.SENDBLUE_WEBHOOK_SECRET
  if (!want || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(want)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ error: 'not configured' }, { status: 404 })
  if (!keyOk(new URL(req.url).searchParams.get('key'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const inbound = body ? toInbound(body) : null
  if (inbound) {
    after(async () => {
      try {
        await handleInbound(inbound)
      } catch (e) {
        console.warn(`pen imessage: inbound ${inbound.id} failed: ${(e as Error).message}`)
      }
    })
  }
  return NextResponse.json({ ok: true })
}
