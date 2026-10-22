import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { setMailApp } from '@/lib/pen/mail-pref'
import { setCalendarPref, type CalendarApp } from '@/lib/pen/calendar-pref'
import type { MailApp } from '@/lib/pen/mail-compose'

export const dynamic = 'force-dynamic'

// Settings → Connections → "One-tap links open in": the same choices as saying "I use Outlook"
// in the chat (set_mail_app / set_calendar_app), stored as 'said' so they beat any guess.
const MAIL: MailApp[] = ['gmail', 'outlook', 'yahoo', 'other']
const CAL: CalendarApp[] = ['google', 'apple', 'outlook', 'yahoo']

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { mail?: unknown; calendar?: unknown }
  const mail = MAIL.find((m) => m === b.mail)
  const calendar = CAL.find((c) => c === b.calendar)
  if (!mail && !calendar) return NextResponse.json({ error: 'mail or calendar required' }, { status: 400 })
  try {
    if (mail) await setMailApp(email, mail)
    if (calendar) await setCalendarPref(email, calendar)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
