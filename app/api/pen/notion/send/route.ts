import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession } from '@/lib/pen/store'
import { getConnection, sendToNotion } from '@/lib/pen/notion'

export const dynamic = 'force-dynamic'

// "Send to Notion" on a note. Returns the Notion page (made now, or the one made before).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!(await getConnection(email))) return NextResponse.json({ error: 'not connected', connect: true }, { status: 409 })
  const s = await getSession(email, b.id)
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!s.notes?.summary && !s.notes?.actions?.length) return NextResponse.json({ error: 'There are no notes to send yet.' }, { status: 400 })
  try {
    return NextResponse.json(await sendToNotion(email, s))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
