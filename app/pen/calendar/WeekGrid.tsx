'use client'

// The desktop week: seven day columns on a 24-hour grid, an all-day row (all-day events and the
// day's to-dos) above it, reminders as hairline markers, and the current-time line in today's
// column. Drag an empty slot to create, drag an event to move it, drag its foot to resize; all on
// a 15-minute snap.

import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import type { CalReminder, CalTodo, CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { dayHead, hourLabel, shortSpan, timeLabel, zoneShort } from './cal-format'
import { addDays, DAY_MS, evSpan, HOUR_PX, hueVars, layoutDay, minutesOfDay, sameDay, snap, startOfDay, SNAP_MIN, ymd, type Hue } from './cal-utils'
import type { Anchor } from './CalPanels'

type Drag =
  | { k: 'create'; day: number; a: number; b: number; moved: boolean }
  | { k: 'move'; ev: CalViewEvent; day: number; start: number; dur: number; moved: boolean }
  | { k: 'resize'; ev: CalViewEvent; day: number; start: number; end: number; moved: boolean }

export default function WeekGrid({
  days,
  events,
  todos,
  reminders,
  hues,
  now,
  draft,
  activeRef,
  onOpenEvent,
  onCreate,
  onChange,
  onOpenTodo,
}: {
  days: Date[]
  events: CalViewEvent[]
  todos: CalTodo[]
  reminders: CalReminder[]
  hues: Record<string, Hue>
  now: Date
  draft: { start: Date; end: Date; allDay: boolean } | null
  activeRef: string | null
  onOpenEvent: (ev: CalViewEvent, anchor: Anchor) => void
  onCreate: (start: Date, end: Date, anchor: Anchor) => void
  onChange: (ev: CalViewEvent, start: Date, end: Date) => void
  onOpenTodo: (sessionId: string) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const scrollRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const suppressClick = useRef(false)
  const offsetRef = useRef(0)
  const weekKey = ymd(days[0])

  // Open on the morning (or the week's first event, if it starts earlier): once per week, and
  // again when that week's events first arrive.
  const scrolled = useRef<{ key: string; withEvents: boolean } | null>(null)
  const hasEvents = events.some((e) => !e.allDay)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const done = scrolled.current
    if (done && done.key === weekKey && (done.withEvents || !hasEvents)) return
    const firsts = events.filter((e) => !e.allDay).map((e) => evSpan(e).s).filter((s) => s >= days[0] && s < addDays(days[0], 7)).map(minutesOfDay)
    const first = firsts.length ? Math.min(...firsts) : 450
    const target = Math.min(first, 450) - 20
    el.scrollTop = Math.max(0, (target / 60) * HOUR_PX)
    scrolled.current = { key: weekKey, withEvents: hasEvents }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, hasEvents])

  const point = (x: number, y: number) => {
    const r = colsRef.current!.getBoundingClientRect()
    const day = Math.max(0, Math.min(6, Math.floor(((x - r.left) / r.width) * 7)))
    const min = Math.max(0, Math.min(1440, ((y - r.top) / HOUR_PX) * 60))
    return { day, min }
  }

  const anchorFor = (day: number, a: number, b: number): Anchor => {
    const r = colsRef.current!.getBoundingClientRect()
    const w = r.width / 7
    return { left: r.left + day * w, right: r.left + (day + 1) * w, top: r.top + (a / 60) * HOUR_PX, bottom: r.top + (b / 60) * HOUR_PX }
  }

  const at = (day: number, min: number) => new Date(days[day].getFullYear(), days[day].getMonth(), days[day].getDate(), 0, min)

  const begin = (d: Drag, x0: number, y0: number) => {
    dragRef.current = d
    const move = (e: PointerEvent) => {
      const cur = dragRef.current
      if (!cur) return
      const moved = cur.moved || Math.abs(e.clientX - x0) > 4 || Math.abs(e.clientY - y0) > 4
      const p = point(e.clientX, e.clientY)
      let next: Drag
      if (cur.k === 'create') next = { ...cur, b: p.min, moved }
      else if (cur.k === 'move') {
        const start = Math.max(0, Math.min(1440 - cur.dur, snap(p.min - offsetRef.current)))
        next = { ...cur, day: p.day, start, moved }
      } else next = { ...cur, end: Math.max(cur.start + SNAP_MIN, Math.min(1440, snap(p.min))), moved }
      dragRef.current = next
      setDrag(next)
    }
    const up = () => {
      cleanup()
      const cur = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!cur) return
      if (cur.k === 'create') {
        let a: number, b: number
        if (!cur.moved) {
          a = Math.floor(cur.a / SNAP_MIN) * SNAP_MIN
          b = Math.min(1440, a + 30)
        } else {
          a = snap(Math.min(cur.a, cur.b))
          b = Math.max(a + SNAP_MIN, snap(Math.max(cur.a, cur.b)))
        }
        onCreate(at(cur.day, a), at(cur.day, b), anchorFor(cur.day, a, b))
        return
      }
      if (!cur.moved) return
      suppressClick.current = true
      window.setTimeout(() => (suppressClick.current = false), 0)
      if (cur.k === 'move') onChange(cur.ev, at(cur.day, cur.start), at(cur.day, cur.start + cur.dur))
      else onChange(cur.ev, at(cur.day, cur.start), at(cur.day, cur.end))
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      cleanup()
      dragRef.current = null
      setDrag(null)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key, true)
  }

  const onColsDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('.pen-cal-ev')) return
    e.preventDefault()
    const p = point(e.clientX, e.clientY)
    const d: Drag = { k: 'create', day: p.day, a: p.min, b: p.min, moved: false }
    setDrag(d)
    begin(d, e.clientX, e.clientY)
  }

  const onEvDown = (e: React.PointerEvent, ev: CalViewEvent, day: number, resize: boolean) => {
    if (e.button !== 0 || !ev.editable) return
    const { s, e: end } = evSpan(ev)
    // An event that crosses midnight is changed in the form, not by dragging.
    if (!sameDay(s, new Date(end.getTime() - 1))) return
    e.stopPropagation()
    const sm = minutesOfDay(s)
    const em = sm + Math.round((end.getTime() - s.getTime()) / 60_000)
    if (resize) {
      e.preventDefault()
      begin({ k: 'resize', ev, day, start: sm, end: em, moved: false }, e.clientX, e.clientY)
    } else {
      offsetRef.current = point(e.clientX, e.clientY).min - sm
      begin({ k: 'move', ev, day, start: sm, dur: em - sm, moved: false }, e.clientX, e.clientY)
    }
  }

  // While dragging, the event is drawn where it would land.
  const shown = useMemo(() => {
    if (!drag || drag.k === 'create' || !drag.moved) return events
    const s = at(drag.day, drag.start)
    const en = drag.k === 'move' ? at(drag.day, drag.start + drag.dur) : at(drag.day, drag.end)
    return events.map((e) => (e.ref === drag.ev.ref ? { ...e, start: s.toISOString(), end: en.toISOString() } : e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, drag])

  const week0 = days[0]
  const week1 = addDays(week0, 7)
  const allDay = shown
    .filter((e) => e.allDay)
    .map((ev) => {
      const { s, e } = evSpan(ev)
      if (!(s < week1 && e > week0)) return null
      const a = Math.max(0, Math.round((startOfDay(s).getTime() - week0.getTime()) / DAY_MS))
      const b = Math.min(7, Math.round((startOfDay(e).getTime() - week0.getTime()) / DAY_MS))
      return { ev, a, b: Math.max(b, a + 1) }
    })
    .filter(Boolean) as { ev: CalViewEvent; a: number; b: number }[]
  const weekTodos = todos.filter((t) => t.date >= ymd(week0) && t.date < ymd(week1))
  const hasAllDay = allDay.length > 0 || weekTodos.length > 0

  const ghost = drag?.k === 'create'
    ? { day: drag.day, a: Math.min(drag.a, drag.b), b: drag.moved ? Math.max(drag.a, drag.b) : Math.min(drag.a, drag.b) + 30 }
    : draft && !draft.allDay
      ? (() => {
          const i = days.findIndex((d) => sameDay(d, draft.start))
          return i < 0 ? null : { day: i, a: minutesOfDay(draft.start), b: Math.max(minutesOfDay(draft.start) + 15, sameDay(draft.start, draft.end) ? minutesOfDay(draft.end) : 1440) }
        })()
      : null

  return (
    <div className="pen-cal-week" data-dragging={drag?.moved || undefined}>
      <div className="pen-cal-week-head">
        <span className="pen-cal-zone" title={Intl.DateTimeFormat().resolvedOptions().timeZone}>{zoneShort(lang)}</span>
        {days.map((d) => {
          const h = dayHead(d, lang)
          const today = sameDay(d, now)
          return (
            <div key={d.getTime()} className="pen-cal-dayhead" data-today={today || undefined} aria-current={today ? 'date' : undefined}>
              <span className="pen-cal-dow">{h.dow}</span>
              <span className="pen-cal-dnum">{h.num}</span>
            </div>
          )
        })}
      </div>

      {hasAllDay && (
        <div className="pen-cal-allday">
          <span className="pen-cal-allday-k">{T.allDay}</span>
          <div className="pen-cal-allday-grid">
            {allDay.map(({ ev, a, b }) => (
              <button
                key={ev.ref}
                type="button"
                className="pen-cal-chip"
                data-active={activeRef === ev.ref || undefined}
                data-declined={ev.declined || undefined}
                style={{ ...hueVars(hues[ev.cal]), gridColumn: `${a + 1} / ${b + 1}` }}
                onClick={(e) => onOpenEvent(ev, (e.currentTarget as HTMLElement).getBoundingClientRect())}
              >
                <span className="pen-cal-chip-t">{ev.title || T.untitled}</span>
              </button>
            ))}
            {weekTodos.map((t) => {
              const i = days.findIndex((d) => ymd(d) === t.date)
              return (
                <button
                  key={t.ref}
                  type="button"
                  className="pen-cal-todo"
                  data-done={t.done || undefined}
                  style={{ gridColumn: `${i + 1} / ${i + 2}` }}
                  onClick={() => onOpenTodo(t.sessionId)}
                  title={t.text}
                >
                  <span className="pen-cal-todo-box" aria-hidden>{t.done && <Icon name="check" size={10} />}</span>
                  <span className="pen-cal-sr">{T.todo}: </span>
                  <span className="pen-cal-todo-t">{t.text}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="pen-cal-scroll" ref={scrollRef}>
        <div className="pen-cal-body" style={{ height: 24 * HOUR_PX }}>
          <div className="pen-cal-gutter" aria-hidden>
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className="pen-cal-hour" style={{ top: (i + 1) * HOUR_PX }}>{hourLabel(i + 1, lang)}</span>
            ))}
          </div>
          <div className="pen-cal-cols" ref={colsRef} onPointerDown={onColsDown} style={{ ['--hour' as string]: `${HOUR_PX}px` }}>
            {days.map((d, di) => {
              const placed = layoutDay(shown, d)
              const today = sameDay(d, now)
              const wkend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div key={d.getTime()} className="pen-cal-col" data-today={today || undefined} data-weekend={wkend || undefined}>
                  {placed.map((p) => {
                    const { ev } = p
                    const short = p.height < 34
                    const mid = !short && p.height < 58
                    const past = evSpan(ev).e < now
                    const dragging = drag && drag.k !== 'create' && drag.moved && drag.ev.ref === ev.ref
                    const canDrag = ev.editable && !p.startsBefore && !p.endsAfter
                    return (
                      <button
                        key={ev.ref}
                        type="button"
                        className="pen-cal-ev"
                        data-short={short || undefined}
                        data-mid={mid || undefined}
                        data-past={past || undefined}
                        data-declined={ev.declined || undefined}
                        data-active={activeRef === ev.ref || undefined}
                        data-dragging={dragging || undefined}
                        data-ro={!ev.editable || undefined}
                        style={{
                          ...hueVars(hues[ev.cal]),
                          top: p.top + 1,
                          height: Math.max(18, p.height - 2),
                          // Overlaps cascade: each event is wider than its share and the later
                          // one sits on top, so titles stay readable (Google/Apple do the same).
                          left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                          width: `calc(${(p.col === p.cols - 1 ? 1 / p.cols : Math.min(1.7 / p.cols, 1 - p.col / p.cols)) * 100}% - ${p.cols > 1 ? 3 : 6}px)`,
                          zIndex: p.cols > 1 ? 1 + p.col : undefined,
                        }}
                        onPointerDown={canDrag ? (e) => onEvDown(e, ev, di, false) : undefined}
                        onClick={(e) => {
                          if (suppressClick.current) return
                          onOpenEvent(ev, (e.currentTarget as HTMLElement).getBoundingClientRect())
                        }}
                      >
                        <span className="pen-cal-ev-t">
                          {ev.title || T.untitled}
                          {short && <span className="pen-cal-ev-time-inline">, {timeLabel(evSpan(ev).s, lang)}</span>}
                        </span>
                        {!short && <span className="pen-cal-ev-time">{shortSpan(ev, lang)}</span>}
                        {!short && p.height > 70 && ev.location && <span className="pen-cal-ev-loc">{ev.location}</span>}
                        {(ev.recording || ev.hasBrief) && (
                          <span className="pen-cal-ev-mark" aria-label={ev.recording ? T.recorded : T.briefReady} title={ev.recording ? T.recorded : T.briefReady}>
                            <Icon name={ev.recording ? 'mic' : 'sparkle'} size={11} />
                          </span>
                        )}
                        {canDrag && !short && (
                          <span className="pen-cal-ev-resize" aria-hidden onPointerDown={(e) => onEvDown(e, ev, di, true)} />
                        )}
                      </button>
                    )
                  })}

                  {reminders
                    .filter((r) => sameDay(new Date(r.dueAt), d))
                    .map((r) => {
                      const due = new Date(r.dueAt)
                      return (
                        <div
                          key={r.id}
                          className="pen-cal-rem"
                          data-sent={r.sent || undefined}
                          style={{ top: (minutesOfDay(due) / 60) * HOUR_PX }}
                          role="note"
                          aria-label={`${T.reminder} ${timeLabel(due, lang)}: ${r.text}`}
                        >
                          <span className="pen-cal-rem-pill">
                            <Icon name="bell" size={11} />
                            <span className="pen-cal-rem-t">{r.text}</span>
                          </span>
                        </div>
                      )
                    })}

                  {ghost && ghost.day === di && (
                    <div
                      className="pen-cal-ghost"
                      style={{ top: (ghost.a / 60) * HOUR_PX, height: Math.max(12, ((ghost.b - ghost.a) / 60) * HOUR_PX) }}
                      aria-hidden
                    >
                      <span>{timeLabel(at(di, snap(ghost.a)), lang)}</span>
                    </div>
                  )}

                  {today && (
                    <div className="pen-cal-now" style={{ top: (minutesOfDay(now) / 60) * HOUR_PX }} aria-hidden />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
