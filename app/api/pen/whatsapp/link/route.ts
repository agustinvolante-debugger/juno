import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { authedEmail } from '@/lib/news/auth'
import { getLinkByEmail, newCode, unlink } from '@/lib/pen/whatsapp/store'
import { botNumber, configured } from '@/lib/pen/whatsapp/vonage'

export const dynamic = 'force-dynamic'

// Settings → WhatsApp. GET says whether a phone is linked, POST makes a fresh code, DELETE
// unlinks. The phone itself proves ownership by sending the code from WhatsApp.
export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const link = await getLinkByEmail(email).catch(() => null)
  return NextResponse.json({
    ready: configured(),
    number: botNumber(),
    phone: link?.linked_at ? link.phone : null,
  })
}

export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const { code, expiresAt } = await newCode(email)
    const number = botNumber()
    // The QR is the wa.me link with the message already typed: scan, WhatsApp opens, tap Send.
    const waLink = `https://wa.me/${number}?text=${encodeURIComponent(`LINK ${code}`)}`
    const qr = await QRCode.toString(waLink, { type: 'svg', margin: 1, color: { dark: '#16150F', light: '#0000' } })
    return NextResponse.json({ code, expiresAt, number, waLink, qr })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await unlink(email)
  return NextResponse.json({ ok: true })
}
