'use client'

// The desktop month: six weeks from the Monday on or before the 1st. A day shows its first few
// items; clicking the day opens that week, clicking an event opens it.

import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import type { CalTodo, CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { timeLabel } from './cal-format'
import { addDays, evSpan, hueVars, overlaps, sameDay, ymd, type Hue } from './cal-utils'
import type { Anchor } from './CalPanels'

const SHOW = 3

export default function MonthGrid({
  start,
  month,
  events,
  todos,
  hues,
  now,
  activeRef,
  onPickDay,
  onOpenEvent,
}: {
  start: Date
  month: number
  events: CalViewEvent[]
  todos: CalTodo[]
  hues: Record<string, Hue>
  now: Date
  activeRef: string | null
  onPickDay: (d: Date) => void
  onOpenEvent: (ev: CalViewEvent, anchor: Anchor) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const dows = days.slice(0, 7).map((d) => d.toLocaleDateString(LOCALE[lang], { weekday: 'short' }).replace(/\.$/, ''))

  return (
    <div className="pen-cal-month">
      <div className="pen-cal-month-dows" aria-hidden>
        {dows.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="pen-cal-month-grid">
        {days.map((d) => {
          const d1 = addDays(d, 1)
          const items = events
            .filter((e) => overlaps(evSpan(e), d, d1))
            .sort((a, b) => Number(b.allDay) - Number(a.allDay) || evSpan(a).s.getTime() - evSpan(b).s.getTime())
          const dayTodos = todos.filter((t) => t.date === ymd(d))
          const total = items.length + dayTodos.length
          const shown = items.slice(0, total > SHOW ? SHOW - 1 : SHOW)
          const room = Math.max(0, (total > SHOW ? SHOW - 1 : SHOW) - shown.length)
          const shownTodos = dayTodos.slice(0, room)
          const rest = total - shown.length - shownTodos.length
          const today = sameDay(d, now)
          const out = d.getMonth() !== month
          return (
            <div key={d.getTime()} className="pen-cal-mday" data-out={out || undefined} data-today={today || undefined} onClick={() => onPickDay(d)}>
              <button
                type="button"
                className="pen-cal-mnum"
                aria-label={d.toLocaleDateString(LOCALE[lang], { weekday: 'long', month: 'long', day: 'numeric' })}
                aria-current={today ? 'date' : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  onPickDay(d)
                }}
              >
                {d.getDate()}
              </button>
              <ul className="pen-cal-mlist">
                {shown.map((ev) => (
                  <li key={ev.ref}>
                    <button
                      type="button"
                      className="pen-cal-mev"
                      data-all={ev.allDay || undefined}
                      data-declined={ev.declined || undefined}
                      data-past={evSpan(ev).e < now || undefined}
                      data-active={activeRef === ev.ref || undefined}
                      style={hueVars(hues[ev.cal])}
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenEvent(ev, (e.currentTarget as HTMLElement).getBoundingClientRect())
                      }}
                    >
                      {!ev.allDay && <span className="pen-cal-dot" aria-hidden />}
                      {!ev.allDay && <span className="pen-cal-mev-time">{timeLabel(evSpan(ev).s, lang)}</span>}
                      <span className="pen-cal-mev-t">{ev.title || T.untitled}</span>
                      {ev.recording && <Icon name="mic" size={11} />}
                    </button>
                  </li>
                ))}
                {shownTodos.map((t) => (
                  <li key={t.ref} className="pen-cal-mtodo" data-done={t.done || undefined}>
                    <span className="pen-cal-todo-box" aria-hidden>{t.done && <Icon name="check" size={10} />}</span>
                    <span className="pen-cal-mev-t">{t.text}</span>
                  </li>
                ))}
                {rest > 0 && <li className="pen-cal-mmore">{T.more(rest)}</li>}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
