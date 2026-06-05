import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { addSuggestion } from '@/lib/news/store'
import { sendEmail } from '@/lib/news/email'

export const dynamic = 'force-dynamic'

const OWNER = 'chaska@caerusai.com' // where suggestions are emailed

// A signed-in user (Agustin, Carlos, Martin…) submits "what else would you like to see?".
// Stored for review + emailed to the owner so requests aren't missed.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { text } = await req.json().catch(() => ({}))
  const t = (text || '').toString().trim().slice(0, 1000)
  if (!t) return NextResponse.json({ error: 'empty' }, { status: 400 })

  await addSuggestion(email, t)
  await sendEmail({
    to: OWNER,
    subject: `Daily Brief — request from ${email.split('@')[0]}`,
    html: `<p><b>${email}</b> would like to see:</p><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#333">${t.replace(/</g, '&lt;')}</blockquote>`,
  })
  return NextResponse.json({ ok: true })
}
