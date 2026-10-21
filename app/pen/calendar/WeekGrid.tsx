'use client'

// The desktop week: seven day columns on a 24-hour grid, an all-day row above it, and the
// current-time line in today's column. Drag an empty slot to create, drag an event to move it,
// drag its foot to resize; all on a 15-minute snap.

import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import type { CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { dayHead, hourLabel, shortSpan, timeLabel, zoneShort } from './cal-format'
import { addDays, DAY_MS, evSpan, HOUR_PX, hueVars, layoutDay, minutesOfDay, sameDay, snap, startOfDay, SNAP_MIN, ymd, type Hue, type Placed } from './cal-utils'
import type { Anchor } from './CalPanels'

/** Two overlapping events that start closer than this (px) sit side by side; further apart, the
 *  later one cascades over the earlier, whose title is already visible above it. */
const NEAR_PX = 24
/** All-day rows shown before "+N more". */
const ALLDAY_ROWS = 3

type Drag =
  | { k: 'create'; day: number; a: number; b: number; moved: boolean }
  | { k: 'move'; ev: CalViewEvent; day: number; start: number; dur: number; moved: boolean }
  | { k: 'resize'; ev: CalViewEvent; day: number; start: number; end: number; moved: boolean }

export default function WeekGrid({
  days,
  events,
  hues,
  now,
  draft,
  activeRef,
  onOpenEvent,
  onCreate,
  onChange,
}: {
  days: Date[]
  events: CalViewEvent[]
  hues: Record<string, Hue>
  now: Date
  draft: { start: Date; end: Date; allDay: boolean } | null
  activeRef: string | null
  onOpenEvent: (ev: CalViewEvent, anchor: Anchor) => void
  onCreate: (start: Date, end: Date, anchor: Anchor) => void
  onChange: (ev: CalViewEvent, start: Date, end: Date) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const scrollRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [allDayOpen, setAllDayOpen] = useState(false)
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
    // Open at the hour of the week's first event, never later than 8:00; and if now is in this
    // week, in the working day, and would sit below the fold, far enough down that the now line
    // shows. (In the evening the day's meetings matter more than the empty hours left.)
    const firsts = events.filter((e) => !e.allDay).map((e) => evSpan(e).s).filter((s) => s >= days[0] && s < addDays(days[0], 7)).map(minutesOfDay)
    let target = Math.floor(Math.min(firsts.length ? Math.min(...firsts) : 480, 480) / 60) * 60
    const viewMin = (el.clientHeight / HOUR_PX) * 60
    if (now >= days[0] && now < addDays(days[0], 7)) {
      const nm = minutesOfDay(now)
      if (nm < 19 * 60 && nm > target + viewMin - 60) target = Math.floor((nm - viewMin + 120) / 60) * 60
    }
    el.scrollTop = Math.max(0, (target / 60) * HOUR_PX - 8)
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
    // Esc, or the browser taking the pointer (a touch scroll): drop the drag, change nothing.
    const cancel = () => {
      cleanup()
      dragRef.current = null
      setDrag(null)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      cancel()
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
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
  const hasAllDay = allDay.length > 0

  // The all-day row, packed into lines (an event spanning days keeps one line). Past three lines,
  // the third becomes "+N more" per day until it is opened.
  type Slot = { key: string; a: number; b: number; row: number; ev: CalViewEvent }
  const slots: Slot[] = []
  {
    const raw = allDay
      .map((x) => ({ key: x.ev.ref, a: x.a, b: x.b, row: 0, ev: x.ev }))
      .sort((x, y) => x.a - y.a || y.b - y.a - (x.b - x.a))
    const ends: number[] = []
    for (const r of raw) {
      let row = ends.findIndex((end) => end <= r.a)
      if (row < 0) row = ends.length
      ends[row] = r.b
      slots.push({ ...r, row })
    }
  }
  const allDayRows = slots.reduce((m, x) => Math.max(m, x.row + 1), 0)
  const folded = allDayRows > ALLDAY_ROWS && !allDayOpen
  const hiddenPerDay = days.map((_, i) => (folded ? slots.filter((x) => x.row >= ALLDAY_ROWS - 1 && x.a <= i && x.b > i).length : 0))
  const dayName = (d: Date) => d.toLocaleDateString(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' })

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
        <div className="pen-cal-allday" data-open={allDayOpen && allDayRows > ALLDAY_ROWS ? true : undefined}>
          <span className="pen-cal-allday-k">
            {T.allDay}
            {allDayOpen && allDayRows > ALLDAY_ROWS && (
              <button type="button" className="pen-cal-allday-less" onClick={() => setAllDayOpen(false)}>{T.showLess}</button>
            )}
          </span>
          <div className="pen-cal-allday-grid">
            {slots
              .filter((x) => !folded || x.row < ALLDAY_ROWS - 1)
              .map((x) => (
                <button
                  key={x.key}
                  type="button"
                  className="pen-cal-chip"
                  data-active={activeRef === x.ev.ref || undefined}
                  data-declined={x.ev.declined || undefined}
                  style={{ ...hueVars(hues[x.ev.cal]), gridColumn: `${x.a + 1} / ${x.b + 1}`, gridRow: x.row + 1 }}
                  title={x.ev.title || T.untitled}
                  onClick={(e) => onOpenEvent(x.ev, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                >
                  <span className="pen-cal-chip-t">{x.ev.title || T.untitled}</span>
                  {x.ev.declined && <span className="pen-cal-sr">, {T.declined}</span>}
                </button>
              ))}
            {hiddenPerDay.map((n, i) =>
              n > 0 ? (
                <button
                  key={`more-${i}`}
                  type="button"
                  className="pen-cal-allday-more"
                  style={{ gridColumn: `${i + 1} / ${i + 2}`, gridRow: ALLDAY_ROWS }}
                  aria-label={`${T.more(n)} · ${dayName(days[i])}`}
                  onClick={() => setAllDayOpen(true)}
                >
                  {T.more(n)}
                </button>
              ) : null,
            )}
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
              const geo = placeOverlaps(placed)
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
                    const g = geo.get(ev.ref)!
                    const label = [
                      ev.title || T.untitled,
                      `${dayName(d)}, ${shortSpan(ev, lang)}`,
                      ev.declined ? T.declined : '',
                      ev.recording ? T.recorded : ev.hasBrief ? T.briefReady : '',
                    ].filter(Boolean).join(', ')
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
                          left: `calc(${g.left * 100}% + 2px)`,
                          width: `calc(${g.width * 100}% - ${p.cols > 1 ? 4 : 6}px)`,
                          zIndex: p.cols > 1 ? 1 + p.col : undefined,
                        }}
                        aria-label={label}
                        onPointerDown={canDrag ? (e) => onEvDown(e, ev, di, false) : undefined}
                        onClick={(e) => {
                          if (suppressClick.current) return
                          onOpenEvent(ev, (e.currentTarget as HTMLElement).getBoundingClientRect())
                        }}
                      >
                        <span className="pen-cal-ev-t">{ev.title || T.untitled}</span>
                        {short && <span className="pen-cal-ev-time-inline">{timeLabel(evSpan(ev).s, lang)}</span>}
                        {!short && <span className="pen-cal-ev-time">{shortSpan(ev, lang)}</span>}
                        {!short && p.height > 70 && ev.location && <span className="pen-cal-ev-loc">{ev.location}</span>}
                        {(ev.recording || ev.hasBrief) && (
                          <span className="pen-cal-ev-mark" aria-hidden title={ev.recording ? T.recorded : T.briefReady}>
                            <Icon name={ev.recording ? 'mic' : 'sparkle'} size={11} />
                          </span>
                        )}
                        {canDrag && !short && (
                          <span className="pen-cal-ev-resize" aria-hidden onPointerDown={(e) => onEvDown(e, ev, di, true)} />
                        )}
                      </button>
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

/** Where each overlapping event sits across its day column, as fractions of the column. Events
 *  that start within NEAR_PX of each other share the width; a later one cascades over an earlier
 *  one, indented, so both titles stay readable. */
function placeOverlaps(placed: Placed[]): Map<string, { left: number; width: number }> {
  const out = new Map<string, { left: number; width: number }>()
  const over = (a: Placed, b: Placed) => a.top < b.top + b.height && b.top < a.top + a.height
  for (const p of [...placed].sort((a, b) => a.col - b.col)) {
    if (p.cols === 1) {
      out.set(p.ev.ref, { left: 0, width: 1 })
      continue
    }
    const share = 1 / p.cols
    const lower = placed.filter((q) => q.cols === p.cols && q.col < p.col && over(p, q))
    const higher = placed.filter((q) => q.cols === p.cols && q.col > p.col && over(p, q))
    const split = lower.some((q) => p.top - q.top < NEAR_PX)
    const left = Math.min(1 - share, split || !lower.length ? p.col * share : Math.max(...lower.map((q) => (out.get(q.ev.ref)?.left ?? 0) + Math.min(0.25, share * 0.44))))
    const nextNear = higher.filter((q) => q.top - p.top < NEAR_PX).reduce((m, q) => Math.min(m, q.col), Infinity)
    const right = Number.isFinite(nextNear) ? nextNear * share : 1
    out.set(p.ev.ref, { left, width: Math.min(1 - left, Math.max(share, right - left)) })
  }
  return out
}
