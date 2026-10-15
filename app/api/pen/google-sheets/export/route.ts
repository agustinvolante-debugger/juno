import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { driveConnected } from '@/lib/pen/google-calendar'
import { exportContactsSheet, exportTodosSheet } from '@/lib/pen/google-exports'
import { userLang } from '@/lib/pen/user-lang'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Home → Still to do / People → "Export to Google Sheets": a new Sheet in the user's "Juno Pen"
// Drive folder. POST {what: 'todos' | 'contacts'}. Not connected: 409 {connect: true}.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const refusal = await readOnlyRefusal(email)
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { what?: string }
  if (b.what !== 'todos' && b.what !== 'contacts') return NextResponse.json({ error: 'what must be todos or contacts' }, { status: 400 })
  if (!(await driveConnected(email))) return NextResponse.json({ error: 'not connected', connect: true }, { status: 409 })
  try {
    const lang = await userLang(email)
    const r = b.what === 'todos' ? await exportTodosSheet(email, lang) : await exportContactsSheet(email, lang)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
