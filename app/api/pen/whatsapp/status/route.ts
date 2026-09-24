import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Delivery receipts for what we send. Vonage wants a 200; failures are logged so a rejected
// send (outside the 24-hour window, an unapproved number) shows up in the Vercel logs.
export async function POST(req: Request) {
  const secret = process.env.PEN_WEBHOOK_SECRET
  if (!secret || new URL(req.url).searchParams.get('k') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const b = (await req.json().catch(() => ({}))) as { status?: string; message_uuid?: string; error?: unknown }
  if (b.status === 'rejected' || b.status === 'undeliverable' || b.status === 'failed') {
    console.warn(`pen whatsapp: message ${b.message_uuid} ${b.status}: ${JSON.stringify(b.error ?? {})}`)
  }
  return NextResponse.json({ ok: true })
}
