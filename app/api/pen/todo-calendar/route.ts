import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession } from '@/lib/pen/store'
import { calendarLinks, type CalEvent } from '@/lib/pen/calendar'
import { createEvent, gcalConnected } from '@/lib/pen/google-calendar'
import { userZone, validZone, zonedToUtc } from '@/lib/pen/suggestions'

export const dynamic = 'force-dynamic'

// The date chip on a dated to-do is its "add to calendar" (Home and the recording page). Only
// dated to-dos (action_meta.due_date) have one. Google Calendar connected: the event goes there
// on the click (the click is the yes). Otherwise the signed .ics link, which the browser hands
// to Apple Calendar / Outlook, plus the Google template link.
//
// A to-do has a day, not a time: 9:00 in the user's zone (saved, else the browser's), 30
// minutes, alert at the start.

const START = '09:00'

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { sessionId?: string; index?: number; tz?: string }
  const index = Number(b.index)
  if (!b.sessionId || !Number.isInteger(index) || index < 0) return NextResponse.json({ error: 'sessionId and index required' }, { status: 400 })
  const s = await getSession(email, b.sessionId)
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const action = s.notes?.actions?.[index]
  const due = Array.isArray(s.action_meta) ? s.action_meta[index]?.due_date : null
  if (!action || !due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return NextResponse.json({ error: 'this to-do has no date' }, { status: 400 })

  const tz = (await userZone(email)) ?? (validZone(b.tz) ? b.tz : 'UTC')
  const ev: CalEvent = {
    title: action.action.slice(0, 200),
    start: zonedToUtc(`${due}T${START}`, tz).toISOString(),
    durationMin: 30,
    tz,
    description: s.title ? `From “${s.title}” (Juno Pen)` : undefined,
    alarmMin: 0,
  }
  if (await gcalConnected(email)) {
    try {
      const e = await createEvent(email, ev, { ref: `todo:${s.id}:${index}` })
      return NextResponse.json({ added: 'google', link: e.link })
    } catch (err) {
      // Revoked or down: the links still work.
      console.warn(`pen todo-calendar: google for ${s.id}#${index}: ${(err as Error).message}`)
    }
  }
  try {
    return NextResponse.json({ added: 'links', ...calendarLinks(ev) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
