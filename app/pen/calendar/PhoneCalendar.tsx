'use client'

// The phone Calendar, laid out like Apple Calendar on iOS but in Pen's own light skin (Inter, the
// glass pills, the app blue). Three views:
//   day (default)  "‹ October" · week strip · "Tuesday – Oct 20, 2026" · all-day row · timeline
//   month          "October 2026" with arrows · the month grid · tap a day → day view
//   list           the agenda (Agenda.tsx), from the selected day, with earlier days on demand
// Top right: a pill with the list toggle and "+". Floating at the bottom, above the app's tab
// bar: "Today" and the calendars button (the show/hide sheet). CalendarView owns the data, the
// panels and the sheets; this file is layout and gestures only.

import { useState } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import type { CalAccount, CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { cap, monthTitle } from './cal-format'
import { addDays, evSpan, hueVars, overlaps, sameDay, startOfDay, startOfWeek, ymd, type Hue } from './cal-utils'
import PhoneDay from './PhoneDay'
import PhoneMonth from './PhoneMonth'
import WeekStrip from './WeekStrip'

export type PhoneView = 'day' | 'month' | 'list'
type Slide = { dir: 'next' | 'prev'; n: number } | null

/** All-day chips shown before "+N more". */
const ALLDAY_SHOWN = 2

export default function PhoneCalendar({
  view,
  now,
  selected,
  month,
  events,
  hues,
  cals,
  hidden,
  busy,
  loadingFirst,
  warn,
  list,
  canCreate,
  scrollTo,
  onSelect,
  onMonth,
  onOpenMonth,
  onToggleList,
  onToday,
  onCreate,
  onOpenEvent,
  onOpenCalendars,
}: {
  view: PhoneView
  now: Date
  selected: Date
  month: Date
  events: CalViewEvent[]
  hues: Record<string, Hue>
  cals: CalAccount[]
  hidden: Set<string>
  busy: boolean
  loadingFirst: boolean
  warn: React.ReactNode
  list: React.ReactNode
  canCreate: boolean
  scrollTo: number
  onSelect: (d: Date) => void
  onMonth: (dir: 1 | -1) => void
  onOpenMonth: () => void
  onToggleList: () => void
  onToday: () => void
  onCreate: (start: Date, end: Date) => void
  onOpenEvent: (ev: CalViewEvent) => void
  onOpenCalendars: () => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const loc = LOCALE[lang]
  const today = startOfDay(now)
  const [daySlide, setDaySlide] = useState<Slide>(null)
  const [weekSlide, setWeekSlide] = useState<Slide>(null)
  const [monthSlide, setMonthSlide] = useState<Slide>(null)

  const weekStart = startOfWeek(selected)
  // Which way the day (and, across a week, the strip) slides in; none for view switches.
  const mark = (d: Date) => {
    if (sameDay(d, selected)) return
    const dir = d > selected ? 'next' : 'prev'
    const n = Date.now()
    setDaySlide({ dir, n })
    setWeekSlide(startOfWeek(d).getTime() !== weekStart.getTime() ? { dir, n } : null)
  }
  const still = () => {
    setDaySlide(null)
    setWeekSlide(null)
  }
  const go = (d: Date) => {
    if (sameDay(d, selected)) return
    mark(d)
    onSelect(d)
  }
  const stepMonth = (dir: 1 | -1) => {
    setMonthSlide({ dir: dir > 0 ? 'next' : 'prev', n: Date.now() })
    onMonth(dir)
  }

  const monthName = cap(selected.toLocaleDateString(loc, { month: 'long' }))
  const dayTitle = `${cap(selected.toLocaleDateString(loc, { weekday: 'long' }))} – ${selected
    .toLocaleDateString(loc, { month: 'short', day: 'numeric', year: 'numeric' })
    .replace(/\./g, '')}`

  const d1 = addDays(selected, 1)
  const allDay = events.filter((e) => e.allDay && overlaps(evSpan(e), selected, d1))
  const [allOpenDay, setAllOpenDay] = useState<string | null>(null)
  const allOpen = allOpenDay === ymd(selected)
  const shownAllDay = allOpen || allDay.length <= ALLDAY_SHOWN + 1 ? allDay : allDay.slice(0, ALLDAY_SHOWN)

  const nextHour = () => {
    const h = Math.min(23, now.getHours() + 1)
    const start = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h)
    return { start, end: new Date(start.getTime() + 3_600_000) }
  }

  const shown = cals.filter((c) => !hidden.has(c.key)).length
  const broken = cals.some((c) => c.broken)

  return (
    <>
      <header className="pen-cal-ph">
        {view === 'month' ? (
          <div className="pen-cal-ph-month">
            <h2 className="pen-cal-ph-title" aria-live="polite">{monthTitle(month, lang)}</h2>
            <button type="button" className="pen-cal-ph-arrow" onClick={() => stepMonth(-1)} aria-label={T.prevMonth}>
              <Icon name="chevron" size={18} className="pen-cal-flip" />
            </button>
            <button type="button" className="pen-cal-ph-arrow" onClick={() => stepMonth(1)} aria-label={T.nextMonth}>
              <Icon name="chevron" size={18} />
            </button>
          </div>
        ) : (
          <button type="button" className="pen-cal-ph-back" onClick={() => {
              setMonthSlide(null)
              onOpenMonth()
            }} aria-label={T.showMonth(monthName)}>
            <Icon name="chevron" size={20} className="pen-cal-flip" />
            <span>{monthName}</span>
          </button>
        )}
        <span className="pen-cal-ph-busy" role="status" aria-live="polite">
          {busy && (
            <>
              <span className="pen-cal-spin" aria-hidden />
              <span className="pen-cal-sr">{T.updating}</span>
            </>
          )}
        </span>
        <div className="pen-cal-ph-pill">
          <button type="button" className="pen-cal-ph-btn" aria-pressed={view === 'list'} aria-label={T.listView} onClick={() => {
            still()
            onToggleList()
          }}>
            <ListIcon />
          </button>
          <span className="pen-cal-ph-sep" aria-hidden />
          <button
            type="button"
            className="pen-cal-ph-btn pen-cal-new"
            disabled={!canCreate}
            aria-label={T.newOn(selected.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }))}
            onClick={() => {
              const { start, end } = nextHour()
              onCreate(start, end)
            }}
          >
            <Icon name="plus" size={20} />
          </button>
        </div>
      </header>

      {view === 'day' && (
        <>
          <WeekStrip weekStart={weekStart} selected={selected} today={today} slide={weekSlide} onPick={go} onWeek={(dir) => go(addDays(selected, dir * 7))} />
          <div className="pen-cal-pdate">
            <h3 className="pen-cal-pdate-t" aria-live="polite">{dayTitle}</h3>
            {allDay.length > 0 && (
              <ul className="pen-cal-pallday" aria-label={T.allDay}>
                {shownAllDay.map((ev) => (
                  <li key={ev.ref}>
                    <button
                      type="button"
                      className="pen-cal-pchip"
                      data-declined={ev.declined || undefined}
                      style={hueVars(hues[ev.cal])}
                      aria-label={[ev.title || T.untitled, T.allDay, ev.declined ? T.declined : ''].filter(Boolean).join(', ')}
                      onClick={() => onOpenEvent(ev)}
                    >
                      <span className="pen-cal-pchip-k" aria-hidden>{T.allDayShort}</span>
                      <span className="pen-cal-pchip-t">{ev.title || T.untitled}</span>
                    </button>
                  </li>
                ))}
                {allDay.length > shownAllDay.length && (
                  <li>
                    <button type="button" className="pen-cal-pchip-more" onClick={() => setAllOpenDay(ymd(selected))}>
                      {T.more(allDay.length - shownAllDay.length)}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </>
      )}

      {warn}

      {view === 'day' && (
        <PhoneDay
          day={selected}
          events={events}
          hues={hues}
          now={now}
          slide={daySlide}
          scrollTo={scrollTo}
          onOpenEvent={onOpenEvent}
          onCreate={onCreate}
          onDay={(dir) => go(addDays(selected, dir))}
        />
      )}
      {view === 'month' && (
        <PhoneMonth
          month={month}
          selected={selected}
          today={today}
          events={events}
          slide={monthSlide}
          onPick={(d) => {
            still()
            onSelect(d)
          }}
          onMonth={stepMonth}
        />
      )}
      {view === 'list' && <div className="pen-cal-pscroll" aria-busy={loadingFirst || undefined}>{list}</div>}

      <div className="pen-cal-pfloat">
        <button type="button" className="pen-cal-pfloat-btn pen-cal-pfloat-today" onClick={() => {
            if (view === 'day') mark(today)
            else if (view === 'month' && month.getMonth() !== today.getMonth()) setMonthSlide({ dir: month < today ? 'next' : 'prev', n: Date.now() })
            onToday()
          }} aria-label={T.goToday}>
          {T.today}
        </button>
        {cals.length > 0 && (
          <button
            type="button"
            className="pen-cal-pfloat-btn pen-cal-pfloat-cals"
            aria-haspopup="dialog"
            aria-label={`${T.calendarsShown(shown, cals.length)}${broken ? `, ${T.oneBroken}` : ''}`}
            onClick={onOpenCalendars}
          >
            <span className="pen-cal-calbtn-dots" aria-hidden>
              {cals.slice(0, 4).map((c) => (
                <span key={c.key} className="pen-cal-dot" data-off={hidden.has(c.key) || undefined} style={hueVars(hues[c.key])} />
              ))}
            </span>
            <Icon name="calendar" size={19} />
            {broken && (
              <span className="pen-cal-pfloat-warn" aria-hidden>
                <Icon name="alert" size={14} />
              </span>
            )}
          </button>
        )}
      </div>
    </>
  )
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7.4 5.4h9.2M7.4 10h9.2M7.4 14.6h9.2" />
      <circle cx="3.9" cy="5.4" r=".9" fill="currentColor" stroke="none" />
      <circle cx="3.9" cy="10" r=".9" fill="currentColor" stroke="none" />
      <circle cx="3.9" cy="14.6" r=".9" fill="currentColor" stroke="none" />
    </svg>
  )
}
