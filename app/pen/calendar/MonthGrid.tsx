'use client'

// The desktop month: six weeks from the Monday on or before the 1st. A day shows its first few
// items; clicking the day opens that week, clicking an event opens it.

import { useLayoutEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import type { CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { timeLabel } from './cal-format'
import { addDays, evSpan, hueVars, overlaps, sameDay, type Hue } from './cal-utils'
import type { Anchor } from './CalPanels'

/** Item rows that fit a day cell: the cell height less the day number, at 24px a row. "+N more"
 *  sits beside the day number, so every row goes to an item. */
const ROW_PX = 24
const HEAD_PX = 36

export default function MonthGrid({
  start,
  month,
  events,
  hues,
  now,
  activeRef,
  onPickDay,
  onOpenEvent,
}: {
  start: Date
  month: number
  events: CalViewEvent[]
  hues: Record<string, Hue>
  now: Date
  activeRef: string | null
  onPickDay: (d: Date) => void
  onOpenEvent: (ev: CalViewEvent, anchor: Anchor) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const gridRef = useRef<HTMLDivElement>(null)
  const [SHOW, setShow] = useState(3)
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const fit = () => setShow(Math.max(1, Math.min(6, Math.floor((el.clientHeight / 6 - HEAD_PX) / ROW_PX))))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const dows = days.slice(0, 7).map((d) => d.toLocaleDateString(LOCALE[lang], { weekday: 'short' }).replace(/\.$/, ''))

  return (
    <div className="pen-cal-month">
      <div className="pen-cal-month-dows" aria-hidden>
        {dows.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="pen-cal-month-grid" ref={gridRef}>
        {days.map((d) => {
          const d1 = addDays(d, 1)
          const items = events
            .filter((e) => overlaps(evSpan(e), d, d1))
            .sort((a, b) => Number(b.allDay) - Number(a.allDay) || evSpan(a).s.getTime() - evSpan(b).s.getTime())
          const total = items.length
          const shown = items.slice(0, SHOW)
          const rest = total - shown.length
          const today = sameDay(d, now)
          const out = d.getMonth() !== month
          return (
            <div key={d.getTime()} className="pen-cal-mday" data-out={out || undefined} data-today={today || undefined} onClick={() => onPickDay(d)}>
              <div className="pen-cal-mhead">
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
                {rest > 0 && (
                  <button
                    type="button"
                    className="pen-cal-mmore"
                    aria-label={`${T.more(rest)} · ${d.toLocaleDateString(LOCALE[lang], { weekday: 'long', month: 'long', day: 'numeric' })}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPickDay(d)
                    }}
                  >
                    {T.more(rest)}
                  </button>
                )}
              </div>
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
                      {ev.recording && <span className="pen-cal-sr">, {T.recorded}</span>}
                      {ev.declined && <span className="pen-cal-sr">, {T.declined}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
