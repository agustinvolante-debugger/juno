// Labels for the Calendar page, in the app language, in the browser's time zone.

import { LOCALE, type Lang } from '@/lib/pen/i18n'
import type { CalViewEvent } from '@/lib/pen/calendar-view'
import { addDays, evSpan, sameDay, startOfDay } from './cal-utils'
import type { CalCopy } from './cal-copy'

export function timeLabel(d: Date, lang: Lang): string {
  return d.toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' })
}

/** "9 AM" in English; in 24-hour locales the same shape as the events' times ("7:00", "07:00"). */
export function hourLabel(h: number, lang: Lang): string {
  const d = new Date(2000, 0, 1, h)
  const twelve = new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric' }).resolvedOptions().hour12
  return twelve ? d.toLocaleTimeString(LOCALE[lang], { hour: 'numeric' }) : timeLabel(d, lang)
}

function fmtRange(a: Date, b: Date, lang: Lang, opts: Intl.DateTimeFormatOptions): string {
  const f = new Intl.DateTimeFormat(LOCALE[lang], opts)
  try {
    return f.formatRange(a, b)
  } catch {
    return `${f.format(a)} – ${f.format(b)}`
  }
}

export function weekTitle(start: Date, lang: Lang): { main: string; sub: string } {
  const end = addDays(start, 6)
  return {
    main: fmtRange(start, end, lang, { month: 'short', day: 'numeric' }).replace(/\./g, ''),
    sub: String(end.getFullYear()),
  }
}

export function monthTitle(anchor: Date, lang: Lang): string {
  const s = anchor.toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function dayHead(d: Date, lang: Lang): { dow: string; num: string } {
  return {
    dow: d.toLocaleDateString(LOCALE[lang], { weekday: 'short' }).replace(/\.$/, ''),
    num: String(d.getDate()),
  }
}

/** "Today" / "Tomorrow" / "Wed 23 Oct". */
export function agendaDay(d: Date, lang: Lang, T: CalCopy, now: Date): string {
  if (sameDay(d, now)) return T.today
  if (sameDay(d, addDays(startOfDay(now), 1))) return T.tomorrow
  const s = d.toLocaleDateString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(/,/g, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The detail panel's time line: "Tuesday, Oct 20 · 9:30 – 10:15 AM" or "Oct 20 – 22 · All day". */
export function eventWhen(ev: CalViewEvent, lang: Lang, T: CalCopy): string {
  const { s, e } = evSpan(ev)
  const long: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' }
  if (ev.allDay) {
    const last = addDays(e, -1)
    const days = sameDay(s, last) ? s.toLocaleDateString(LOCALE[lang], long) : fmtRange(s, last, lang, { month: 'short', day: 'numeric' })
    return `${cap(days)} · ${T.allDay}`
  }
  if (sameDay(s, new Date(e.getTime() - 1))) {
    return `${cap(s.toLocaleDateString(LOCALE[lang], long))} · ${fmtRange(s, e, lang, { hour: 'numeric', minute: '2-digit' })}`
  }
  return fmtRange(s, e, lang, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function shortSpan(ev: CalViewEvent, lang: Lang): string {
  const { s, e } = evSpan(ev)
  return fmtRange(s, e, lang, { hour: 'numeric', minute: '2-digit' })
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The browser zone's short name ("PDT", "GMT-3") for the grid's corner. */
export function zoneShort(lang: Lang): string {
  try {
    const p = new Intl.DateTimeFormat(LOCALE[lang], { timeZoneName: 'short' }).formatToParts(new Date())
    return p.find((x) => x.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** One occurrence of a repeating event: the server's flag (Google recurringEventId, Outlook type
 *  occurrence/exception); older payloads without it fall back to Google's instance id ("abc_20261021T160000Z"). */
export function looksRecurring(ev: CalViewEvent): boolean {
  if (typeof ev.recurring === 'boolean') return ev.recurring
  const id = ev.ref.split('|')[0] ?? ''
  return /_\d{8}(T\d{6}Z?)?$/.test(id)
}
