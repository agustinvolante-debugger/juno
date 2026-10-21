'use client'

// Phone: the week strip under the header (Apple Calendar's day view). Weekday initials, then the
// seven day numbers; the selected day sits in a filled app-blue circle, today's number is blue
// when it isn't selected, weekends are dimmer. Swipe sideways for the previous / next week (the
// parent keeps the weekday); tap a day to show it. A tablist: arrows move between days.

import { useRef } from 'react'
import { LOCALE } from '@/lib/pen/i18n'
import { useCopy, useLang } from '../LangContext'
import { CAL } from './cal-copy'
import { addDays, sameDay, ymd } from './cal-utils'
import { useSwipe } from './swipe'

export default function WeekStrip({
  weekStart,
  selected,
  today,
  slide,
  onPick,
  onWeek,
}: {
  weekStart: Date
  selected: Date
  today: Date
  /** Which way the last change moved, for the slide-in ('next' | 'prev'). */
  slide: { dir: 'next' | 'prev'; n: number } | null
  onPick: (d: Date) => void
  onWeek: (dir: 1 | -1) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const loc = LOCALE[lang]
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const narrow = new Intl.DateTimeFormat(loc, { weekday: 'narrow' })
  const full = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' })
  const listRef = useRef<HTMLDivElement>(null)
  const { handlers, offset } = useSwipe((dir) => onWeek(dir), 'x')

  const onKey = (e: React.KeyboardEvent, i: number) => {
    let to: number | null = null
    if (e.key === 'ArrowRight') to = i + 1
    else if (e.key === 'ArrowLeft') to = i - 1
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = 6
    if (to === null) return
    e.preventDefault()
    // Past either end the strip moves a week, like the swipe.
    const d = addDays(weekStart, to)
    onPick(d)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }

  return (
    <div className="pen-cal-strip" {...handlers}>
      <div className="pen-cal-strip-dows" aria-hidden>
        {days.map((d) => (
          <span key={d.getTime()} data-weekend={d.getDay() === 0 || d.getDay() === 6 || undefined}>{narrow.format(d)}</span>
        ))}
      </div>
      <div
        ref={listRef}
        key={ymd(weekStart)}
        className="pen-cal-strip-days"
        role="tablist"
        aria-label={T.days}
        data-slide={slide?.dir}
        style={offset.x ? { transform: `translateX(${offset.x * 0.6}px)`, transition: 'none' } : undefined}
      >
        {days.map((d, i) => {
          const sel = sameDay(d, selected)
          const isToday = sameDay(d, today)
          return (
            <button
              key={d.getTime()}
              type="button"
              role="tab"
              className="pen-cal-strip-day"
              aria-selected={sel}
              tabIndex={sel ? 0 : -1}
              aria-current={isToday ? 'date' : undefined}
              aria-label={full.format(d)}
              data-today={isToday || undefined}
              data-weekend={d.getDay() === 0 || d.getDay() === 6 || undefined}
              onClick={() => onPick(d)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="pen-cal-strip-n">{d.getDate()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
