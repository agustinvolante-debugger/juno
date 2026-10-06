import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { listMeetings } from '@/lib/pen/notion-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// "Import from Notion": the AI Meeting Notes Juno can see, newest first.
export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ meetings: await listMeetings(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}
