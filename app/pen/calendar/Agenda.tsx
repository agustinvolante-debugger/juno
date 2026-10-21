'use client'

// The phone calendar's list: an agenda from the selected day forward, one block per day that has
// something in it. Scrolling to the end loads the next four weeks; "Show earlier days" at the top
// loads the four before, keeping what's on screen where it was (past meetings and their notes).

import { useEffect, useLayoutEffect, useRef } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import type { CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { agendaDay, timeLabel } from './cal-format'
import { addDays, evSpan, hueVars, overlaps, sameDay, startOfDay, ymd, type Hue } from './cal-utils'
import { PinIcon, VideoIcon } from './EventDetail'

type Item = { ev: CalViewEvent; t: number }

export default function Agenda({
  from,
  to,
  events,
  hues,
  now,
  loading,
  focusDay,
  onOpenEvent,
  onLoadMore,
  onLoadEarlier,
}: {
  from: Date
  to: Date
  /** Always shown, even with nothing on it (the day the list was opened from). */
  focusDay?: Date
  /** Load the weeks before `from`. */
  onLoadEarlier?: () => void
  events: CalViewEvent[]
  hues: Record<string, Hue>
  now: Date
  loading: boolean
  onOpenEvent: (ev: CalViewEvent) => void
  onLoadMore: () => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const sentinel = useRef<HTMLDivElement>(null)
  const more = useRef(onLoadMore)
  more.current = onLoadMore
  const rootRef = useRef<HTMLDivElement>(null)
  // Earlier days go in above what's on screen: hold the distance from the bottom, so the list
  // doesn't jump.
  const keep = useRef<number | null>(null)
  const scroller = () => rootRef.current?.closest<HTMLElement>('.pen-cal-pscroll, .pen-m-body') ?? null
  const earlier = () => {
    const el = scroller()
    if (el) keep.current = el.scrollHeight - el.scrollTop
    onLoadEarlier?.()
  }
  const fromKey = from.getTime()
  useLayoutEffect(() => {
    const el = scroller()
    if (el && keep.current !== null) el.scrollTop = el.scrollHeight - keep.current
    // Hold on until the new days have actually arrived (they render empty until then).
  }, [fromKey, events.length])
  useEffect(() => {
    if (!loading) keep.current = null
  }, [loading])

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more.current(), { rootMargin: '400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const days: { d: Date; items: Item[] }[] = []
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const d1 = addDays(d, 1)
    const items: Item[] = [
      ...events.filter((e) => overlaps(evSpan(e), d, d1)).map((ev): Item => ({ ev, t: ev.allDay ? -2 : Math.max(-1, evSpan(ev).s.getTime() - d.getTime()) })),
    ].sort((a, b) => a.t - b.t)
    if (items.length || sameDay(d, now) || sameDay(d, focusDay ?? from)) days.push({ d, items })
  }

  return (
    <div className="pen-cal-agenda" ref={rootRef}>
      {onLoadEarlier && (
        <button type="button" className="pen-btn pen-cal-more pen-cal-earlier" onClick={earlier} disabled={loading}>
          {loading && keep.current !== null ? T.loading : T.showEarlier}
        </button>
      )}
      {days.map(({ d, items }) => {
        const today = sameDay(d, now)
        return (
          <section key={d.getTime()} className="pen-cal-aday" data-day={ymd(d)} data-today={today || undefined} aria-label={agendaDay(d, lang, T, now)}>
            <h3 className="pen-cal-aday-h">
              <span>{agendaDay(d, lang, T, now)}</span>
              {today && <span className="pen-cal-aday-date">{d.toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'short' }).replace(/\./g, '')}</span>}
            </h3>
            {!items.length && <p className="pen-cal-aday-empty">{T.noEvents}</p>}
            <ul className="pen-cal-alist">
              {items.map((it) => {
                const ev = it.ev
                const { s, e } = evSpan(ev)
                const past = e < now
                const startsToday = sameDay(s, d)
                return (
                  <li key={ev.ref}>
                    <button
                      type="button"
                      className="pen-cal-arow"
                      data-past={past || undefined}
                      data-declined={ev.declined || undefined}
                      style={hueVars(hues[ev.cal])}
                      onClick={() => onOpenEvent(ev)}
                    >
                      <span className="pen-cal-arow-time">
                        {ev.allDay ? (
                          <span>{T.allDayShort}</span>
                        ) : (
                          <>
                            <span>{startsToday ? timeLabel(s, lang) : '…'}</span>
                            <span className="pen-cal-arow-end">{sameDay(e, d) ? timeLabel(e, lang) : ''}</span>
                          </>
                        )}
                      </span>
                      <span className="pen-cal-arow-bar" aria-hidden />
                      <span className="pen-cal-arow-main">
                        <span className="pen-cal-arow-t">{ev.title || T.untitled}</span>
                        {(ev.location || ev.meet || ev.recording || ev.hasBrief) && (
                          <span className="pen-cal-arow-sub">
                            {ev.recording && <span className="pen-cal-tag" data-k="rec"><Icon name="mic" size={11} />{T.recorded}</span>}
                            {ev.hasBrief && !past && <span className="pen-cal-tag" data-k="brief"><Icon name="sparkle" size={11} />{T.briefReady}</span>}
                            {ev.meet && <span className="pen-cal-arow-meta"><VideoIcon size={14} />{T.video}</span>}
                            {ev.location && <span className="pen-cal-arow-meta"><PinIcon />{ev.location}</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <div ref={sentinel} className="pen-cal-sentinel" />
      <button type="button" className="pen-btn pen-cal-more" onClick={onLoadMore} disabled={loading}>
        {loading ? T.loading : T.loadMore}
      </button>
    </div>
  )
}
