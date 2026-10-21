'use client'

// Phone: one month, full width (Apple Calendar's month view, in Pen's light skin). Weekday
// initials, the month's days (other months' days left blank, as Apple does), a neutral dot under
// days with something on them (the sidebar mini calendar's dot), today in blue, the selected day
// in a blue circle. Tap a day to open it in the day view. Swipe up / left for the next month,
// down / right for the previous one; the header has arrows too.

import { LOCALE } from '@/lib/pen/i18n'
import type { CalViewEvent } from '@/lib/pen/calendar-view'
import { useCopy, useLang } from '../LangContext'
import { CAL } from './cal-copy'
import { addDays, evSpan, sameDay, startOfWeek, ymd } from './cal-utils'
import { useSwipe } from './swipe'

export default function PhoneMonth({
  month,
  selected,
  today,
  events,
  slide,
  onPick,
  onMonth,
}: {
  month: Date // the 1st
  selected: Date
  today: Date
  events: CalViewEvent[]
  slide: { dir: 'next' | 'prev'; n: number } | null
  onPick: (d: Date) => void
  onMonth: (dir: 1 | -1) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const loc = LOCALE[lang]
  const start = startOfWeek(month)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks = Math.ceil((Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const { handlers, offset } = useSwipe((dir) => onMonth(dir), 'both')

  // Days touched by at least one event the user hasn't declined.
  const dots = new Set<string>()
  const end = addDays(start, weeks * 7)
  for (const ev of events) {
    if (ev.declined) continue
    const { s, e } = evSpan(ev)
    for (let d = s < start ? start : new Date(s.getFullYear(), s.getMonth(), s.getDate()); d < e && d < end; d = addDays(d, 1)) dots.add(ymd(d))
  }

  const narrow = new Intl.DateTimeFormat(loc, { weekday: 'narrow' })
  const long = new Intl.DateTimeFormat(loc, { weekday: 'long' })
  const full = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const moved = offset.x || offset.y ? { transform: `translate(${offset.x * 0.5}px, ${offset.y * 0.5}px)`, transition: 'none' } : undefined

  return (
    <div className="pen-cal-pmonth" {...handlers}>
      <div className="pen-cal-pmonth-dows" role="presentation">
        {days.slice(0, 7).map((d) => (
          <span key={d.getDay()} aria-label={long.format(d)} data-weekend={d.getDay() === 0 || d.getDay() === 6 || undefined}>
            {narrow.format(d)}
          </span>
        ))}
      </div>
      <div key={ymd(month)} className="pen-cal-pmonth-grid" data-slide={slide?.dir} style={{ ...moved, gridTemplateRows: `repeat(${weeks}, minmax(52px, 1fr))` }} role="grid" aria-label={month.toLocaleDateString(loc, { month: 'long', year: 'numeric' })}>
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="pen-cal-pmonth-row" role="row">
            {days.slice(w * 7, w * 7 + 7).map((d) => {
              const inMonth = d.getMonth() === month.getMonth()
              if (!inMonth) return <span key={d.getTime()} role="gridcell" className="pen-cal-pmonth-blank" />
              const key = ymd(d)
              const has = dots.has(key)
              const isToday = sameDay(d, today)
              const sel = sameDay(d, selected)
              return (
                <span key={key} role="gridcell" className="pen-cal-pmonth-cell">
                  <button
                    type="button"
                    className="pen-cal-pmonth-day"
                    data-today={isToday || undefined}
                    data-sel={sel || undefined}
                    data-weekend={d.getDay() === 0 || d.getDay() === 6 || undefined}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={sel}
                    aria-label={`${full.format(d)}${has ? `, ${T.miniHas}` : ''}`}
                    onClick={() => onPick(d)}
                  >
                    <span className="pen-cal-pmonth-n">{d.getDate()}</span>
                    <span className="pen-cal-pmonth-dot" data-on={has || undefined} aria-hidden />
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
