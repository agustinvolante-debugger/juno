import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { parseRange } from '@/lib/pen/calendar-page'
import { readRange } from '@/lib/pen/calendar-server'

export const dynamic = 'force-dynamic'

// The Calendar page (22 Oct): every connected Google and Outlook calendar's events for the weeks on
// screen, read live and never stored, plus the Juno extras (recording of a past meeting, dated
// to-dos, reminders). ?from=&to= ISO, at most 42 days; optional &tz= (the browser's zone, used only
// when the profile has none). Shapes: lib/pen/calendar-view.ts.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const r = parseRange(q.get('from'), q.get('to'))
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  try {
    return NextResponse.json(await readRange(email, r.from, r.to, q.get('tz')))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
