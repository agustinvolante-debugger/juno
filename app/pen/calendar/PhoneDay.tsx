'use client'

// Phone: one day on a full-width hour timeline (Apple Calendar's day view, in Pen's light skin).
// Hour labels on the left, long hairlines, events as tinted blocks in their calendar's hue,
// overlapping events side by side, the current time as a blue line with a dot. Tap an event to
// open it; tap an empty spot to create one there (15-minute snap, one hour long). Swipe sideways
// for the previous / next day. No dragging on a phone.

import { useLayoutEffect, useRef } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import type { CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { hourLabel, shortSpan, timeLabel } from './cal-format'
import { evSpan, HOUR_PX, hueVars, layoutDay, minutesOfDay, sameDay, snap, ymd, type Hue } from './cal-utils'
import { useSwipe } from './swipe'

/** One hour on the phone timeline, in px (roomier than the desktop week for thumbs). */
export const PHONE_HOUR = 56
/** Space above midnight so the "12 AM" label isn't clipped. */
const TOP_PAD = 12

export default function PhoneDay({
  day,
  events,
  hues,
  now,
  slide,
  scrollTo,
  onOpenEvent,
  onCreate,
  onDay,
}: {
  day: Date
  events: CalViewEvent[]
  hues: Record<string, Hue>
  now: Date
  slide: { dir: 'next' | 'prev'; n: number } | null
  /** A new `n` scrolls again (Today, a jump), even to the same day. */
  scrollTo: number
  onOpenEvent: (ev: CalViewEvent) => void
  onCreate: (start: Date, end: Date) => void
  onDay: (dir: 1 | -1) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { handlers, offset } = useSwipe((dir) => onDay(dir), 'x')
  const dayKey = ymd(day)
  const isToday = sameDay(day, now)
  const twelve = new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric' }).resolvedOptions().hour12
  const dayName = day.toLocaleDateString(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' })

  const k = PHONE_HOUR / HOUR_PX
  const placed = layoutDay(events, day)
  const hasTimed = placed.length > 0

  // Open about an hour before now (today) or before the day's first event; once per day, again
  // when that day's events first arrive, and on every Today / jump.
  const scrolled = useRef<{ key: string; withEvents: boolean; n: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const done = scrolled.current
    if (done && done.key === dayKey && done.n === scrollTo && (done.withEvents || !hasTimed || isToday)) return
    let min: number
    if (isToday) min = minutesOfDay(now) - 60
    else if (hasTimed) min = Math.min(...placed.map((p) => (p.top / HOUR_PX) * 60)) - 60
    else min = 8 * 60
    el.scrollTop = Math.max(0, TOP_PAD + (min / 60) * PHONE_HOUR)
    scrolled.current = { key: dayKey, withEvents: hasTimed, n: scrollTo }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, hasTimed, scrollTo])

  const onTapEmpty = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('.pen-cal-pev')) return
    const r = e.currentTarget.getBoundingClientRect()
    const min = Math.max(0, Math.min(23 * 60, snap(((e.clientY - r.top) / PHONE_HOUR) * 60)))
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min)
    onCreate(start, new Date(start.getTime() + 3_600_000))
  }

  const nowMin = minutesOfDay(now)
  const label = (h: number) => (twelve && h === 12 ? T.noon : hourLabel(h % 24, lang))

  return (
    <div className="pen-cal-pday" ref={scrollRef} {...handlers}>
      <div
        key={dayKey}
        className="pen-cal-pday-body"
        data-slide={slide?.dir}
        style={{
          height: TOP_PAD + 24 * PHONE_HOUR,
          ...(offset.x ? { transform: `translateX(${offset.x * 0.85}px)`, transition: 'none' } : null),
        }}
      >
        <div className="pen-cal-pday-hours" aria-hidden style={{ top: TOP_PAD }}>
          {Array.from({ length: 25 }, (_, h) => {
            // The now pill takes the hour label's place when they'd touch.
            const hide = isToday && Math.abs(nowMin - h * 60) < 14
            return (
              <div key={h} className="pen-cal-pday-hour" style={{ top: h * PHONE_HOUR }}>
                <span data-hide={hide || undefined}>{h < 24 ? label(h) : label(0)}</span>
              </div>
            )
          })}
        </div>

        <div className="pen-cal-pday-grid" style={{ top: TOP_PAD, height: 24 * PHONE_HOUR }} onClick={onTapEmpty}>
          {placed.map((p) => {
            const { ev } = p
            const top = p.top * k
            const height = p.height * k
            const short = height < 40
            const past = evSpan(ev).e < now
            const aria = [
              ev.title || T.untitled,
              `${dayName}, ${shortSpan(ev, lang)}`,
              ev.location ?? '',
              ev.declined ? T.declined : '',
              ev.recording ? T.recorded : ev.hasBrief && !past ? T.briefReady : '',
            ].filter(Boolean).join(', ')
            return (
              <button
                key={ev.ref}
                type="button"
                className="pen-cal-pev"
                data-short={short || undefined}
                data-mid={(!short && height < 72) || undefined}
                data-past={past || undefined}
                data-declined={ev.declined || undefined}
                style={{
                  ...hueVars(hues[ev.cal]),
                  top: top + 1,
                  height: Math.max(22, height - 2),
                  left: `calc(${(p.col / p.cols) * 100}% + ${p.col ? 1 : 0}px)`,
                  width: `calc(${100 / p.cols}% - ${p.cols > 1 ? 3 : 2}px)`,
                }}
                aria-label={aria}
                onClick={() => onOpenEvent(ev)}
              >
                <span className="pen-cal-pev-t">{ev.title || T.untitled}</span>
                {short ? (
                  <span className="pen-cal-pev-inline">{timeLabel(evSpan(ev).s, lang)}</span>
                ) : (
                  <span className="pen-cal-pev-sub">
                    {shortSpan(ev, lang)}
                    {ev.location && height >= 64 ? <span className="pen-cal-pev-loc">{ev.location}</span> : null}
                  </span>
                )}
                {(ev.recording || (ev.hasBrief && !past)) && (
                  <span className="pen-cal-pev-mark" aria-hidden>
                    <Icon name={ev.recording ? 'mic' : 'sparkle'} size={11} />
                  </span>
                )}
              </button>
            )
          })}

          {isToday && (
            <div className="pen-cal-pnow" style={{ top: (nowMin / 60) * PHONE_HOUR }} aria-hidden>
              <span className="pen-cal-pnow-t">{timeLabel(now, lang).replace(/\s?[AP]\.?M\.?$/i, '')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
