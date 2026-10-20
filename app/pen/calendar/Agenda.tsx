'use client'

// The phone calendar: an agenda from today forward, one block per day that has something in it.
// Scrolling to the end loads the next four weeks.

import { useEffect, useRef } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import type { CalReminder, CalTodo, CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { agendaDay, timeLabel } from './cal-format'
import { addDays, evSpan, hueVars, overlaps, sameDay, startOfDay, ymd, type Hue } from './cal-utils'
import { PinIcon, VideoIcon } from './EventDetail'

type Item =
  | { k: 'ev'; ev: CalViewEvent; t: number }
  | { k: 'todo'; todo: CalTodo; t: number }
  | { k: 'rem'; rem: CalReminder; t: number }

export default function Agenda({
  from,
  to,
  events,
  todos,
  reminders,
  hues,
  now,
  loading,
  onOpenEvent,
  onOpenTodo,
  onLoadMore,
}: {
  from: Date
  to: Date
  events: CalViewEvent[]
  todos: CalTodo[]
  reminders: CalReminder[]
  hues: Record<string, Hue>
  now: Date
  loading: boolean
  onOpenEvent: (ev: CalViewEvent) => void
  onOpenTodo: (sessionId: string) => void
  onLoadMore: () => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const sentinel = useRef<HTMLDivElement>(null)
  const more = useRef(onLoadMore)
  more.current = onLoadMore

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
      ...events.filter((e) => overlaps(evSpan(e), d, d1)).map((ev): Item => ({ k: 'ev', ev, t: ev.allDay ? -2 : Math.max(-1, evSpan(ev).s.getTime() - d.getTime()) })),
      ...todos.filter((x) => x.date === ymd(d)).map((todo): Item => ({ k: 'todo', todo, t: -1.5 })),
      ...reminders.filter((r) => sameDay(new Date(r.dueAt), d)).map((rem): Item => ({ k: 'rem', rem, t: new Date(rem.dueAt).getTime() - d.getTime() })),
    ].sort((a, b) => a.t - b.t)
    if (items.length || sameDay(d, now)) days.push({ d, items })
  }

  return (
    <div className="pen-cal-agenda">
      {days.map(({ d, items }) => {
        const today = sameDay(d, now)
        return (
          <section key={d.getTime()} className="pen-cal-aday" data-today={today || undefined} aria-label={agendaDay(d, lang, T, now)}>
            <h3 className="pen-cal-aday-h">
              <span>{agendaDay(d, lang, T, now)}</span>
              {today && <span className="pen-cal-aday-date">{d.toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'short' }).replace(/\./g, '')}</span>}
            </h3>
            {!items.length && <p className="pen-cal-aday-empty">{T.noEvents}</p>}
            <ul className="pen-cal-alist">
              {items.map((it) => {
                if (it.k === 'todo') {
                  return (
                    <li key={it.todo.ref}>
                      <button type="button" className="pen-cal-arow pen-cal-arow-todo" data-done={it.todo.done || undefined} onClick={() => onOpenTodo(it.todo.sessionId)}>
                        <span className="pen-cal-arow-time"><span className="pen-cal-todo-box" aria-hidden>{it.todo.done && <Icon name="check" size={10} />}</span></span>
                        <span className="pen-cal-arow-main">
                          <span className="pen-cal-sr">{T.todo}: </span>
                          <span className="pen-cal-arow-t">{it.todo.text}</span>
                        </span>
                      </button>
                    </li>
                  )
                }
                if (it.k === 'rem') {
                  const due = new Date(it.rem.dueAt)
                  return (
                    <li key={it.rem.id} className="pen-cal-arem" data-sent={it.rem.sent || undefined}>
                      <span className="pen-cal-arow-time">{timeLabel(due, lang)}</span>
                      <span className="pen-cal-arem-body">
                        <Icon name="bell" size={13} />
                        <span className="pen-cal-sr">{T.reminder}: </span>
                        {it.rem.text}
                      </span>
                    </li>
                  )
                }
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
