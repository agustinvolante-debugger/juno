'use client'

// The Calendar page (22 Oct): every connected Google and Outlook calendar in one place, with
// Juno's own layer on its meetings (the notes of a past meeting, the brief before the next one).
// Meetings only: to-dos and reminders live elsewhere (founder, 20 Oct). Desktop: week (default)
// and month. Phone: Apple-Calendar-style day view, month and list (PhoneCalendar.tsx).
//
// Events are read live for the range on screen (GET /api/pen/calendar), refreshed every 90 s while
// the tab is visible, on focus, and after every change. Old data stays on screen while it
// refreshes. Changes are optimistic where it matters (drag), with a rollback and a quiet toast.
// Types and routes: lib/pen/calendar-view.ts.

import './calendar.css'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { CalBrief, CalCreate, CalPatch, CalRange, CalViewEvent } from '@/lib/pen/calendar-view'
import { liveApi, mockApi, type CalApi, type CalPerson, type MutResult } from './cal-api'
import { CAL } from './cal-copy'
import { monthTitle, weekTitle } from './cal-format'
import { addDays, browserZone, calLabel, evSpan, hueVars, huesFor, parseYmd, startOfDay, startOfMonth, startOfWeek, ymd } from './cal-utils'
import { ConfirmDialog, Floating, Sheet, Toast, type Anchor } from './CalPanels'
import WeekGrid from './WeekGrid'
import MonthGrid from './MonthGrid'
import Agenda from './Agenda'
import PhoneCalendar, { type PhoneView } from './PhoneCalendar'
import EventDetail from './EventDetail'
import EventForm, { type FormValues } from './EventForm'

export type CalendarViewProps = {
  phone?: boolean
  /** Open a recording (a past meeting's notes). */
  onOpenRecording: (sessionId: string) => void
  /** Settings → Connections, to connect or reconnect a calendar. */
  onOpenConnections: () => void
  /** Jump to the week holding this date (the sidebar's mini calendar). A new `n` jumps again,
   *  even to the same date. Desktop switches to week; phone scrolls the agenda to that day. */
  goTo?: { date: string /* 'YYYY-MM-DD' */; n: number }
  /** Dev preview only: answer from this range in memory instead of the API. */
  mock?: CalRange
  mockBrief?: (ref: string) => CalBrief
  /** Dev preview only: the saved people the guest box suggests. */
  mockPeople?: CalPerson[]
}

type Panel =
  | { k: 'detail'; ref: string; anchor: Anchor | null }
  | { k: 'edit'; ref: string; anchor: Anchor | null }
  | { k: 'create'; start: Date; end: Date; allDay: boolean; anchor: Anchor | null }

type Chunk = { from: Date; to: Date; key: string }
const chunk = (from: Date, to: Date): Chunk => ({ from, to, key: `${from.getTime()}-${to.getTime()}` })

const AGENDA_STEP = 28
const HIDDEN_KEY = 'pen-cal-hidden'
const VIEW_KEY = 'pen-cal-view'

function readLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLS(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v)
  } catch {
    /* private mode: per-visit only */
  }
}

function merge(parts: CalRange[]): CalRange | null {
  if (!parts.length) return null
  const ev = new Map<string, CalViewEvent>()
  const failed = new Set<string>()
  for (const p of parts) {
    p.events.forEach((e) => ev.set(e.ref, e))
    p.failed.forEach((f) => failed.add(f))
  }
  const last = parts[parts.length - 1]
  return { calendars: last.calendars, tz: last.tz, events: [...ev.values()], failed: [...failed] }
}

export default function CalendarView({ phone, onOpenRecording, onOpenConnections, goTo, mock, mockBrief, mockPeople }: CalendarViewProps) {
  const T = useCopy(CAL)
  const lang = useLang()
  const api: CalApi = useMemo(
    () => (mock ? mockApi(mock, mockBrief ?? (() => ({ people: [] })), mockPeople) : liveApi),
    // The preview's seed is fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!mock],
  )

  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [now, setNow] = useState(() => new Date())
  const [agendaSteps, setAgendaSteps] = useState(1)
  // Phone: the agenda starts today, or at the day the mini calendar jumped to.
  const [agendaFrom, setAgendaFrom] = useState<Date | null>(null)
  const pendingDay = useRef<string | null>(null)
  // Phone: day (default) / month / list; `anchor` is the selected day, pMonth the month shown,
  // agendaBack the four-week chunks loaded before agendaFrom, pScroll re-aims the timeline.
  const [pView, setPView] = useState<PhoneView>('day')
  const [pMonth, setPMonth] = useState(() => startOfMonth(new Date()))
  const [agendaBack, setAgendaBack] = useState(0)
  const [pScroll, setPScroll] = useState(0)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [cache, setCache] = useState<Record<string, CalRange>>({})
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [local, setLocal] = useState<Record<string, CalViewEvent | null>>({})
  const [panel, setPanel] = useState<Panel | null>(null)
  const [draft, setDraft] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null)
  const [confirm, setConfirm] = useState<{ guests: number; resolve: (ok: boolean) => void } | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; n: number } | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [calSheet, setCalSheet] = useState(false)
  // Desktop: the page fills the window below wherever the shell puts it (search bar or not).
  const rootRef = useRef<HTMLElement>(null)
  const [fitH, setFitH] = useState<number | null>(null)
  const inflight = useRef(0)
  const today = startOfDay(now)

  // Remembered per browser: which calendars are hidden, week or month.
  useEffect(() => {
    try {
      const h = JSON.parse(readLS(HIDDEN_KEY) || '[]')
      if (Array.isArray(h)) setHidden(new Set(h.filter((x) => typeof x === 'string')))
    } catch {
      /* ignore a bad value */
    }
    const v = readLS(VIEW_KEY)
    if (v === 'week' || v === 'month') setMode(v)
  }, [])

  // The sidebar's mini calendar: show the week (or agenda day) holding goTo.date.
  useEffect(() => {
    if (!goTo || !/^\d{4}-\d{2}-\d{2}$/.test(goTo.date)) return
    const d = parseYmd(goTo.date)
    if (!phone) {
      setAnchor(d)
      setMode('week')
      writeLS(VIEW_KEY, 'week')
      return
    }
    setAnchor(d)
    setPMonth(startOfMonth(d))
    setPView('day')
    setPScroll((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo?.n])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // ------------------------------------------------------------------ the range on screen
  const weekStart = startOfWeek(anchor)
  const monthStart = startOfWeek(startOfMonth(anchor))
  const agendaStart = agendaFrom ?? today
  const chunks: Chunk[] = useMemo(() => {
    if (phone) {
      // Day view: the strip's week. Month: its 6-week grid. List: four-week chunks.
      if (pView === 'day') return [chunk(weekStart, addDays(weekStart, 7))]
      if (pView === 'month') {
        const g = startOfWeek(pMonth)
        return [chunk(g, addDays(g, 42))]
      }
      return Array.from({ length: agendaBack + agendaSteps }, (_, i) => {
        const f = addDays(agendaStart, (i - agendaBack) * AGENDA_STEP)
        return chunk(f, addDays(f, AGENDA_STEP))
      })
    }
    return mode === 'week' ? [chunk(weekStart, addDays(weekStart, 7))] : [chunk(monthStart, addDays(monthStart, 42))]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, agendaSteps, mode, weekStart.getTime(), monthStart.getTime(), agendaStart.getTime(), pView, pMonth.getTime(), agendaBack])
  const chunkKeys = chunks.map((c) => c.key).join(',')

  const chunksRef = useRef(chunks)
  chunksRef.current = chunks
  const lastLoad = useRef(0)

  const refresh = useCallback(
    async (only?: Chunk[]) => {
      const list = only ?? chunksRef.current
      lastLoad.current = Date.now()
      inflight.current += 1
      setBusy(true)
      const res = await Promise.allSettled(list.map((c) => api.load(c.from, c.to)))
      const got: Record<string, CalRange> = {}
      let err: unknown = null
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') got[list[i].key] = r.value
        else err = r.reason
      })
      setCache((prev) => ({ ...prev, ...got }))
      setLoadErr(err ? errMessage(err, T.loadError) : null)
      if (Object.keys(got).length) setUpdatedAt(Date.now())
      inflight.current -= 1
      if (inflight.current <= 0) setBusy(false)
      return !err
    },
    [api, T.loadError],
  )
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  // New range on screen: show what's cached at once, then read it fresh.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkKeys])

  // Staying current: every 90 s while visible, and when the tab comes back.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshRef.current()
    }
    const back = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 5000) void refreshRef.current()
    }
    const id = window.setInterval(tick, 90_000)
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fresh = useMemo(() => merge(chunks.map((c) => cache[c.key]).filter(Boolean)), [cache, chunkKeys])
  // Phone: swiping into a week not read yet keeps the last answer (its calendars, its events) on
  // screen while the new week loads, instead of flashing a skeleton.
  const lastData = useRef<CalRange | null>(null)
  if (fresh) lastData.current = fresh
  const data = phone ? fresh ?? lastData.current : fresh

  /** Phone: bring the agenda's day (or the next day with something on it) to the top. */
  function scrollToDay(day: string) {
    const list = Array.from(document.querySelectorAll<HTMLElement>('.pen-cal-aday[data-day]'))
    const el = list.find((x) => (x.dataset.day ?? '') >= day) ?? list[list.length - 1]
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }
  // After a jump outside the loaded agenda, scroll once the new range is on screen.
  const agendaReady = !!(phone && data)
  useEffect(() => {
    if (!agendaReady || !pendingDay.current) return
    const day = pendingDay.current
    pendingDay.current = null
    requestAnimationFrame(() => scrollToDay(day))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaReady, chunkKeys, data?.events.length])
  const loadingFirst = !data && !loadErr
  const cals = data?.calendars ?? []
  const hues = useMemo(() => huesFor(cals), [cals.map((c) => c.key).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Every event with local changes laid over (a drag in flight, a new event, a deletion).
  const allEvents = useMemo(() => {
    const m = new Map<string, CalViewEvent>()
    for (const e of data?.events ?? []) m.set(e.ref, e)
    for (const [ref, e] of Object.entries(local)) {
      if (e === null) m.delete(ref)
      else m.set(ref, e)
    }
    return [...m.values()]
  }, [data, local])
  const events = useMemo(() => allEvents.filter((e) => (e.cals.length ? e.cals : [e.cal]).some((k) => !hidden.has(k))), [allEvents, hidden])

  const toggleCal = (key: string) => {
    setHidden((h) => {
      const n = new Set(h)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      writeLS(HIDDEN_KEY, JSON.stringify([...n]))
      return n
    })
  }

  // ------------------------------------------------------------------------ panels
  const open = (p: Panel) => {
    if (!panel) returnFocus.current = document.activeElement as HTMLElement | null
    setPanel(p)
    if (p.k === 'create') setDraft({ start: p.start, end: p.end, allDay: p.allDay })
    else setDraft(null)
  }
  const close = useCallback(() => {
    setPanel(null)
    setDraft(null)
    const el = returnFocus.current
    returnFocus.current = null
    if (el && document.contains(el)) el.focus({ preventScroll: true })
    // The event it came from is gone (deleted): land on "New event", not on the page's start.
    else requestAnimationFrame(() => document.querySelector<HTMLElement>('.pen-cal-new')?.focus({ preventScroll: true }))
  }, [])

  useEffect(() => {
    if (!panel && !calSheet) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (panel) close()
      else setCalSheet(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [panel, calSheet, close])

  const panelEv = panel && panel.k !== 'create' ? allEvents.find((e) => e.ref === panel.ref) ?? null : null
  // The event went away under an open panel (deleted elsewhere): close it.
  useEffect(() => {
    if (panel && panel.k !== 'create' && data && !panelEv) close()
  }, [panel, panelEv, data, close])

  const say = (text: string, tone: 'ok' | 'bad' = 'ok') => setToast({ text, tone, n: Date.now() })
  const clearToast = useCallback(() => setToast(null), [])

  // ---------------------------------------------------------------------- changes
  const ask = (guests: number) => new Promise<boolean>((resolve) => setConfirm({ guests, resolve }))

  async function run<V>(fn: (confirm: boolean) => Promise<MutResult<V>>): Promise<MutResult<V> | { cancelled: true }> {
    let r = await fn(false)
    if ('needsConfirm' in r) {
      if (!(await ask(r.guests))) return { cancelled: true }
      r = await fn(true)
      if ('needsConfirm' in r) return { cancelled: true }
    }
    return r
  }

  const unlocal = (ref: string) =>
    setLocal((l) => {
      const n = { ...l }
      delete n[ref]
      return n
    })
  const settle = async (...refs: string[]) => {
    await refresh()
    refs.forEach(unlocal)
  }

  const tz = browserZone()

  const moveEvent = async (ev: CalViewEvent, start: Date, end: Date) => {
    if (start.getTime() === evSpan(ev).s.getTime() && end.getTime() === evSpan(ev).e.getTime()) return
    setLocal((l) => ({ ...l, [ev.ref]: { ...ev, start: start.toISOString(), end: end.toISOString() } }))
    try {
      const r = await run((c) => api.patch({ ref: ev.ref, start: start.toISOString(), end: end.toISOString(), tz, ...(c ? { confirm: true } : {}) }))
      if ('cancelled' in r) return unlocal(ev.ref)
      if ('readOnly' in r) {
        unlocal(ev.ref)
        return say(T.readOnlyToast, 'bad')
      }
      if ('ok' in r) {
        const saved = r.value
        setLocal((l) => ({ ...l, [ev.ref]: saved }))
      }
      await settle(ev.ref)
    } catch (e) {
      unlocal(ev.ref)
      say(T.failedSave(errMessage(e)), 'bad')
    }
  }

  const createEvent = async (v: FormValues): Promise<string | null> => {
    const body: CalCreate = {
      cal: v.cal || undefined,
      title: v.title,
      start: v.allDay ? ymd(v.start) : v.start.toISOString(),
      end: v.allDay ? ymd(v.end) : v.end.toISOString(),
      allDay: v.allDay || undefined,
      location: v.location || undefined,
      description: v.description || undefined,
      guests: v.guests.length ? v.guests : undefined,
      video: v.video || undefined,
      tz,
    }
    try {
      const r = await run((c) => api.create(c ? { ...body, confirm: true } : body))
      if ('cancelled' in r) return ''
      if (!('ok' in r)) return T.readOnlyToast
      const made = r.value
      setLocal((l) => ({ ...l, [made.ref]: made }))
      close()
      say(T.created)
      void settle(made.ref)
      return null
    } catch (e) {
      return T.failedSave(errMessage(e))
    }
  }

  const editEvent = async (ev: CalViewEvent, v: FormValues): Promise<string | null> => {
    // Only what changed: the server asks before emailing guests, and a move is create + delete.
    const sp = evSpan(ev)
    const start = ev.allDay ? ymd(v.start) : v.start.toISOString()
    const end = ev.allDay ? ymd(v.end) : v.end.toISOString()
    const timeChanged = v.start.getTime() !== sp.s.getTime() || v.end.getTime() !== sp.e.getTime()
    const mails = (g: { email: string }[]) => g.map((x) => x.email.toLowerCase()).sort().join(',')
    const move = !!v.cal && v.cal !== ev.cal
    const body: CalPatch = {
      ref: ev.ref,
      ...(v.title !== ev.title ? { title: v.title } : {}),
      ...(timeChanged ? { start, end } : {}),
      ...(v.location !== (ev.location ?? '') ? { location: v.location || null } : {}),
      ...(v.description !== (ev.description ?? '') ? { description: v.description || null } : {}),
      ...(mails(v.guests) !== mails(ev.guests) ? { guests: v.guests } : {}),
      ...(v.video && !ev.meet ? { video: true } : {}),
      ...(move ? { cal: v.cal } : {}),
      tz,
    }
    try {
      const r = Object.keys(body).length > 2 ? await run((c) => api.patch(c ? { ...body, confirm: true } : body)) : { ok: true as const, value: ev }
      if ('cancelled' in r) return ''
      if (!('ok' in r)) return T.readOnlyToast
      const saved = r.value
      // A move comes back with a new ref: the panel follows it.
      setLocal((l) => (saved.ref === ev.ref ? { ...l, [ev.ref]: saved } : { ...l, [ev.ref]: null, [saved.ref]: saved }))
      setPanel({ k: 'detail', ref: saved.ref, anchor: panel?.anchor ?? null })
      // The form (and the focus inside it) is gone; keep focus in the panel.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.pen-cal-float, .pen-cal-sheet')?.focus({ preventScroll: true }))
      say(saved.ref !== ev.ref ? T.moved(calLabel(cals.find((c) => c.key === saved.cal))) : T.saved)
      void settle(ev.ref, saved.ref)
      return null
    } catch (e) {
      return T.failedSave(errMessage(e))
    }
  }

  const deleteEvent = async (ev: CalViewEvent) => {
    try {
      const r = await run((c) => api.remove(ev.ref, c))
      if ('cancelled' in r) return
      if ('readOnly' in r) return say(T.readOnlyToast, 'bad')
      setLocal((l) => ({ ...l, [ev.ref]: null }))
      close()
      say(T.deleted)
      void settle(ev.ref)
    } catch (e) {
      say(T.failedDelete(errMessage(e)), 'bad')
    }
  }

  const defaultCal = cals.find((c) => c.isDefault && !c.broken)?.key ?? cals.find((c) => !c.broken)?.key ?? ''
  const newEventAt = (): { start: Date; end: Date } => {
    const base = phone || mode === 'month' || (now >= weekStart && now < addDays(weekStart, 7)) ? now : addDays(weekStart, 0)
    const start = new Date(base)
    if (base === now) {
      start.setMinutes(Math.ceil((start.getMinutes() + 1) / 30) * 30, 0, 0)
    } else start.setHours(9, 0, 0, 0)
    return { start, end: new Date(start.getTime() + 3_600_000) }
  }

  // ------------------------------------------------------------------------ header
  const step = (dir: 1 | -1) => {
    if (mode === 'week') setAnchor((a) => addDays(a, dir * 7))
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1))
  }
  const setView = (m: 'week' | 'month') => {
    setMode(m)
    writeLS(VIEW_KEY, m)
  }
  const goToday = () => {
    setAnchor(startOfDay(new Date()))
    if (!phone) return
    const t = startOfDay(new Date())
    setPMonth(startOfMonth(t))
    setPScroll((n) => n + 1)
    if (pView !== 'list') return
    const loadedFrom = addDays(agendaStart, -agendaBack * AGENDA_STEP)
    if (t >= loadedFrom && t < addDays(agendaStart, agendaSteps * AGENDA_STEP)) scrollToDay(ymd(t))
    else {
      pendingDay.current = ymd(t)
      setAgendaFrom(t)
      setAgendaBack(0)
      setAgendaSteps(1)
    }
  }

  const wt = weekTitle(weekStart, lang)
  const title = mode === 'week' ? wt.main : monthTitle(anchor, lang)
  const ageMin = updatedAt ? Math.floor((now.getTime() - updatedAt) / 60_000) : null
  const failedNames = (data?.failed ?? []).map((k) => calLabel(cals.find((c) => c.key === k)) || k)

  const status = (
    <span className="pen-cal-status">
      {busy ? (
        <>
          <span className="pen-cal-spin" aria-hidden />
          {T.updating}
        </>
      ) : ageMin === null ? null : ageMin < 1 ? (
        T.updatedNow
      ) : (
        T.updatedMin(ageMin)
      )}
    </span>
  )

  const legend = cals.length > 0 && (
    <div className="pen-cal-legend" role="group" aria-label={T.calendars}>
      {cals.map((c) => {
        const off = hidden.has(c.key)
        return (
          <span key={c.key} className="pen-cal-leg" data-broken={c.broken || undefined} style={hueVars(hues[c.key])}>
            <button
              type="button"
              className="pen-cal-leg-btn"
              aria-pressed={!off}
              aria-label={off ? T.show(calLabel(c)) : T.hide(calLabel(c))}
              onClick={() => toggleCal(c.key)}
              data-off={off || undefined}
            >
              <span className="pen-cal-leg-box" aria-hidden>
                {!off && (
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.6 10.4 8 13.8l7-7.6" />
                  </svg>
                )}
              </span>
              <span className="pen-cal-leg-name">{calLabel(c)}</span>
            </button>
            {c.broken && (
              <button
                type="button"
                className="pen-cal-reconnect"
                onClick={() => {
                  setCalSheet(false)
                  onOpenConnections()
                }}
              >
                <Icon name="alert" size={13} />
                {T.reconnect}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )

  const warn = (failedNames.length > 0 || (loadErr && data)) && (
    <p className="pen-cal-warn" role="status">
      <Icon name="alert" size={14} />
      {failedNames.length > 0 ? T.failed(failedNames.join(', ')) : loadErr}
    </p>
  )

  useLayoutEffect(() => {
    if (phone) return
    const fit = () => {
      const el = rootRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      setFitH(Math.max(540, Math.round(window.innerHeight - top - 24)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [phone, !!data])

  // Desktop keys, when nothing else has them: T today, ← → previous/next, W week, M month,
  // N new event.
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keysRef.current = (e: KeyboardEvent) => {
    if (phone || panel || confirm || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
    if (!rootRef.current || !document.contains(rootRef.current)) return
    const k = e.key.toLowerCase()
    if (k === 't') goToday()
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
    else if (k === 'w') setView('week')
    else if (k === 'm') setView('month')
    else if (k === 'n' && defaultCal) document.querySelector<HTMLButtonElement>('.pen-cal-new')?.click()
    else return
    e.preventDefault()
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => keysRef.current(e)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // --------------------------------------------------------------------- empty / error
  if (data && cals.length === 0) {
    return (
      <section className="pen-cal" data-phone={phone || undefined} aria-label={T.calendar}>
        <div className="pen-cal-empty">
          <span className="pen-cal-empty-ic" aria-hidden><Icon name="calendar" size={26} /></span>
          <h2 className="pen-cal-empty-t">{T.emptyTitle}</h2>
          <p className="pen-cal-empty-b">{T.emptyBody}</p>
          <button type="button" className="pen-btn pen-btn-accent" onClick={onOpenConnections}>{T.emptyBtn}</button>
        </div>
      </section>
    )
  }
  if (!data && loadErr) {
    return (
      <section className="pen-cal" data-phone={phone || undefined} aria-label={T.calendar}>
        <div className="pen-cal-empty">
          <span className="pen-cal-empty-ic" data-k="bad" aria-hidden><Icon name="alert" size={24} /></span>
          <h2 className="pen-cal-empty-t">{T.loadError}</h2>
          <p className="pen-cal-empty-b">{loadErr}</p>
          <button type="button" className="pen-btn" onClick={() => void refresh()}>{T.retry}</button>
        </div>
      </section>
    )
  }

  // --------------------------------------------------------------------- panels
  const panelBody = (() => {
    if (!panel) return null
    if (panel.k === 'create') {
      return (
        <EventForm
          key={`c-${panel.start.getTime()}-${panel.end.getTime()}`}
          mode="create"
          initial={{ title: '', allDay: panel.allDay, start: panel.start, end: panel.end, cal: defaultCal, location: '', description: '', guests: [], video: false }}
          cals={cals}
          hues={hues}
          onSubmit={createEvent}
          onCancel={close}
          people={api.people}
          onDraftChange={phone ? undefined : (start, end, allDay) => setDraft({ start, end, allDay })}
        />
      )
    }
    if (!panelEv) return null
    if (panel.k === 'edit') {
      const sp = evSpan(panelEv)
      return (
        <EventForm
          key={`e-${panelEv.ref}`}
          mode="edit"
          readOnlyAllDay
          initial={{ title: panelEv.title, allDay: panelEv.allDay, start: sp.s, end: sp.e, cal: panelEv.cal, location: panelEv.location ?? '', description: panelEv.description ?? '', guests: panelEv.guests, video: false }}
          meet={panelEv.meet}
          recurring={!!panelEv.recurring}
          cals={cals}
          hues={hues}
          onSubmit={(v) => editEvent(panelEv, v)}
          people={api.people}
          onCancel={() => setPanel({ k: 'detail', ref: panelEv.ref, anchor: panel.anchor })}
        />
      )
    }
    return (
      <EventDetail
        key={panelEv.ref}
        ev={panelEv}
        cals={cals}
        hues={hues}
        api={api}
        onClose={close}
        onEdit={() => setPanel({ k: 'edit', ref: panelEv.ref, anchor: panel.anchor })}
        onDelete={() => deleteEvent(panelEv)}
        onOpenRecording={onOpenRecording}
        onOpenSession={onOpenRecording}
      />
    )
  })()
  const panelLabel = panel?.k === 'create' ? T.newTitle : panel?.k === 'edit' ? T.editTitle : panelEv?.title || T.calendar

  const overlays = (
    <>
      {panelBody &&
        (phone ? (
          <Sheet label={panelLabel} onClose={close}>{panelBody}</Sheet>
        ) : (
          <Floating anchor={panel?.anchor ?? null} label={panelLabel} onClose={close} wide={panel?.k !== 'detail'}>
            {panelBody}
          </Floating>
        ))}
      {confirm && (
        <ConfirmDialog
          title={T.confirmSend(confirm.guests)}
          body={T.confirmSendBody}
          yes={T.send}
          no={T.dontSend}
          onAnswer={(ok) => {
            confirm.resolve(ok)
            setConfirm(null)
          }}
        />
      )}
      {toast && <Toast key={toast.n} text={toast.text} tone={toast.tone} onDone={clearToast} />}
    </>
  )

  const newBtn = (
    <button
      type="button"
      className="pen-btn pen-btn-accent pen-cal-new"
      disabled={!defaultCal}
      title={phone ? undefined : `${T.newEvent} (N)`}
      aria-keyshortcuts={phone ? undefined : 'n'}
      onClick={(e) => {
        const { start, end } = newEventAt()
        open({ k: 'create', start, end, allDay: false, anchor: phone ? null : (e.currentTarget as HTMLElement).getBoundingClientRect() })
      }}
    >
      <Icon name="plus" size={16} />
      {T.newEvent}
    </button>
  )

  // ------------------------------------------------------------------------ phone
  if (phone) {
    const end = addDays(agendaStart, agendaSteps * AGENDA_STEP)
    const from = addDays(agendaStart, -agendaBack * AGENDA_STEP)
    const openList = () => {
      if (pView === 'list') return setPView('day')
      pendingDay.current = ymd(anchor)
      setAgendaFrom(anchor)
      setAgendaBack(0)
      setAgendaSteps(1)
      setPView('list')
    }
    const list = loadingFirst ? (
      <div className="pen-cal-skel pen-cal-skel-agenda" aria-label={T.loading}>
        <span /><span /><span /><span />
      </div>
    ) : (
      <Agenda
        from={from}
        to={end}
        focusDay={agendaStart}
        events={events}
        hues={hues}
        now={now}
        loading={busy}
        onOpenEvent={(ev) => open({ k: 'detail', ref: ev.ref, anchor: null })}
        onLoadMore={() => {
          if (!busy && agendaSteps < 13) setAgendaSteps((n) => n + 1)
        }}
        onLoadEarlier={agendaBack < 13 ? () => !busy && setAgendaBack((n) => n + 1) : undefined}
      />
    )
    return (
      <section className="pen-cal" data-phone data-pview={pView} aria-label={T.calendar} aria-busy={loadingFirst || undefined}>
        <PhoneCalendar
          view={pView}
          now={now}
          selected={anchor}
          month={pMonth}
          events={events}
          hues={hues}
          cals={cals}
          hidden={hidden}
          busy={busy}
          loadingFirst={loadingFirst}
          warn={warn}
          list={list}
          canCreate={!!defaultCal}
          scrollTo={pScroll}
          onSelect={(d) => {
            setAnchor(startOfDay(d))
            if (pView === 'month') setPView('day')
          }}
          onMonth={(dir) => setPMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1))}
          onOpenMonth={() => {
            setPMonth(startOfMonth(anchor))
            setPView('month')
          }}
          onToggleList={openList}
          onToday={goToday}
          onCreate={(start, end) => open({ k: 'create', start, end, allDay: false, anchor: null })}
          onOpenEvent={(ev) => open({ k: 'detail', ref: ev.ref, anchor: null })}
          onOpenCalendars={() => setCalSheet(true)}
        />
        {calSheet && (
          <Sheet label={T.calendars} onClose={() => setCalSheet(false)}>
            <div className="pen-cal-calsheet">
              <header className="pen-cal-form-head">
                <h2 className="pen-cal-calsheet-h">{T.calendars}</h2>
                <button type="button" className="pen-cal-x" onClick={() => setCalSheet(false)} aria-label={T.close}>
                  <Icon name="close" size={18} />
                </button>
              </header>
              {legend}
            </div>
          </Sheet>
        )}
        {overlays}
      </section>
    )
  }

  // ---------------------------------------------------------------------- desktop
  const activeRef = panel && panel.k !== 'create' ? panel.ref : null
  return (
    <section ref={rootRef} className="pen-cal" aria-label={T.calendar} style={fitH ? { height: fitH } : undefined}>
      <header className="pen-cal-bar">
        <div className="pen-cal-bar-l">
          <h2 className="pen-cal-h">
            {title}
            {mode === 'week' && <span className="pen-cal-h-sub">{wt.sub}</span>}
          </h2>
          {status}
        </div>
        <div className="pen-cal-bar-r">
          <button type="button" className="pen-btn pen-cal-today" onClick={goToday} title={`${T.today} (T)`} aria-keyshortcuts="t">{T.today}</button>
          <span className="pen-cal-nav">
            <button type="button" className="pen-cal-navbtn" onClick={() => step(-1)} aria-label={T.prev} title={`${T.prev} (←)`} aria-keyshortcuts="ArrowLeft">
              <Icon name="chevron" size={16} className="pen-cal-flip" />
            </button>
            <button type="button" className="pen-cal-navbtn" onClick={() => step(1)} aria-label={T.next} title={`${T.next} (→)`} aria-keyshortcuts="ArrowRight">
              <Icon name="chevron" size={16} />
            </button>
          </span>
          <span className="pen-cal-seg" role="group" aria-label={T.view}>
            <button type="button" aria-pressed={mode === 'week'} onClick={() => setView('week')} title={`${T.week} (W)`} aria-keyshortcuts="w">{T.week}</button>
            <button type="button" aria-pressed={mode === 'month'} onClick={() => setView('month')} title={`${T.month} (M)`} aria-keyshortcuts="m">{T.month}</button>
          </span>
          {newBtn}
        </div>
      </header>
      {(legend || warn) && (
        <div className="pen-cal-sub">
          {legend}
          {warn}
        </div>
      )}
      <div className="pen-cal-surface" aria-busy={loadingFirst || undefined}>
        {loadingFirst && (
          <div className="pen-cal-loading" role="status">
            <span className="pen-cal-spin" aria-hidden />
            {T.loading}
          </div>
        )}
        {mode === 'week' ? (
          <WeekGrid
            days={Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))}
            events={events}
            hues={hues}
            now={now}
            draft={draft}
            activeRef={activeRef}
            onOpenEvent={(ev, a) => open({ k: 'detail', ref: ev.ref, anchor: a })}
            onCreate={(start, end, a) => open({ k: 'create', start, end, allDay: false, anchor: a })}
            onChange={(ev, s, e) => void moveEvent(ev, s, e)}
          />
        ) : (
          <MonthGrid
            start={monthStart}
            month={anchor.getMonth()}
            events={events}
            hues={hues}
            now={now}
            activeRef={activeRef}
            onPickDay={(d) => {
              setAnchor(d)
              setView('week')
            }}
            onOpenEvent={(ev, a) => open({ k: 'detail', ref: ev.ref, anchor: a })}
          />
        )}
      </div>
      {overlays}
    </section>
  )
}
