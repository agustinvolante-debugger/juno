import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { getSession } from '@/lib/pen/store'
import { driveConnected } from '@/lib/pen/google-calendar'
import { sendNotesToDocs } from '@/lib/pen/google-exports'
import { userLang } from '@/lib/pen/user-lang'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// "Send to Google Docs" on a note (lib/pen/google-exports.ts). Returns the Doc (made now, or the
// one made before). Not connected: 409 {connect: true}, and the page goes to Settings → Google.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const refusal = await readOnlyRefusal(email)
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { id?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!(await driveConnected(email))) return NextResponse.json({ error: 'not connected', connect: true }, { status: 409 })
  const s = await getSession(email, b.id)
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!s.notes?.summary && !s.notes?.actions?.length) return NextResponse.json({ error: 'There are no notes to send yet.' }, { status: 400 })
  try {
    return NextResponse.json(await sendNotesToDocs(email, s, await userLang(email)))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
