'use client'

// The sidebar's mini month (founder, 22 Oct: "a mini calendar below the recent chats with grey
// dots where there are events"). Desktop, expanded sidebar only; PenApp decides when it mounts.
// Reads the same GET /api/pen/calendar as the Calendar page, for the 6-week grid on screen, and
// marks each day with at least one event the user hasn't declined. Clicking a day opens the
// Calendar page on that day's week.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LOCALE } from '@/lib/pen/i18n'
import { useCopy, useLang } from '../LangContext'
import { APP_COPY } from '../PenApp.copy'
import Icon from '../Icon'
import { liveApi } from './cal-api'
import { DAY_MS, addDays, evSpan, sameDay, startOfMonth, startOfWeek, ymd } from './cal-utils'
import { monthTitle } from './cal-format'
import './mini-calendar.css'

const REFRESH_MS = 5 * 60_000
const FOCUS_GAP_MS = 60_000

// Last dots per grid (keyed by its first day), so collapsing and reopening the sidebar or a
// remount shows the dots at once while the fresh read is on its way.
const dotCache = new Map<string, Set<string>>()

export default function MiniCalendar({ onPick }: { onPick: (date: string) => void }) {
  const lang = useLang()
  const T = useCopy(APP_COPY)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [today, setToday] = useState(() => new Date())
  // Day keys ('YYYY-MM-DD') with an event, kept while the next month loads.
  const gridStart = useMemo(() => startOfWeek(month), [month])
  const [dots, setDots] = useState<Set<string>>(() => dotCache.get(ymd(gridStart)) ?? new Set())
  const lastLoad = useRef(0)
  const seq = useRef(0)
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])

  const load = useCallback(async () => {
    const id = ++seq.current
    lastLoad.current = Date.now()
    const from = gridStart
    // Dots are keyed by date, so the previous grid's stay right on the days both grids share.
    const cached = dotCache.get(ymd(from))
    if (cached) setDots(cached)
    // The API takes at most 42 days; a grid crossing a DST change is 42 days ± 1 hour.
    const to = new Date(Math.min(addDays(gridStart, 42).getTime(), from.getTime() + 42 * DAY_MS))
    try {
      const r = await liveApi.load(from, to)
      if (id !== seq.current) return
      const next = new Set<string>()
      for (const ev of r.events) {
        if (ev.declined) continue
        const { s, e } = evSpan(ev)
        // Every local day the event touches; all-day ends are exclusive, so is a timed end at 00:00.
        for (let d = s < from ? from : new Date(s.getFullYear(), s.getMonth(), s.getDate()); d < e && d < to; d = addDays(d, 1)) {
          next.add(ymd(d))
        }
      }
      dotCache.set(ymd(from), next)
      setDots(next)
    } catch {
      if (id === seq.current) {
        dotCache.delete(ymd(from))
        setDots(new Set())
      }
    }
    setToday(new Date())
  }, [gridStart])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const again = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoad.current >= FOCUS_GAP_MS) void load()
    }
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, REFRESH_MS)
    window.addEventListener('focus', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('focus', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [load])

  const loc = LOCALE[lang]
  const dows = useMemo(() => {
    const f = new Intl.DateTimeFormat(loc, { weekday: 'narrow' })
    return days.slice(0, 7).map((d) => ({ short: f.format(d), long: d.toLocaleDateString(loc, { weekday: 'long' }) }))
  }, [days, loc])
  const fullDate = useMemo(() => new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), [loc])

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  return (
    <section className="pen-mcal" aria-label={T.miniCalAria}>
      <div className="pen-mcal-head">
        <h2 className="pen-mcal-title" aria-live="polite">{monthTitle(month, lang)}</h2>
        <button type="button" className="pen-mcal-nav pen-mcal-prev" aria-label={T.miniCalPrev} onClick={() => shift(-1)}>
          <Icon name="chevron" size={14} />
        </button>
        <button type="button" className="pen-mcal-nav" aria-label={T.miniCalNext} onClick={() => shift(1)}>
          <Icon name="chevron" size={14} />
        </button>
      </div>
      <div className="pen-mcal-grid" role="grid" aria-label={monthTitle(month, lang)}>
        <div className="pen-mcal-row" role="row">
          {dows.map((d, i) => (
            <span key={i} className="pen-mcal-dow" role="columnheader" aria-label={d.long}>
              {d.short}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, w) => (
          <div key={w} className="pen-mcal-row" role="row">
            {days.slice(w * 7, w * 7 + 7).map((d) => {
              const key = ymd(d)
              const has = dots.has(key)
              const isToday = sameDay(d, today)
              return (
                <span key={key} role="gridcell">
                  <button
                    type="button"
                    className="pen-mcal-day"
                    data-out={d.getMonth() !== month.getMonth() || undefined}
                    data-today={isToday || undefined}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${fullDate.format(d)}${has ? `, ${T.miniCalHasEvents}` : ''}`}
                    onClick={() => onPick(key)}
                  >
                    <span className="pen-mcal-n">{d.getDate()}</span>
                    {has && <span className="pen-mcal-dot" aria-hidden="true" />}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
