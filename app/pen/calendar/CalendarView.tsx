'use client'

// The Calendar page (22 Oct): every connected Google and Outlook calendar in one place, with
// Juno's own things on it (the notes of a past meeting, the brief before the next one, dated
// to-dos, WhatsApp reminders). Desktop: week (default) and month. Phone: an agenda.
//
// Events are read live for the range on screen (GET /api/pen/calendar), refreshed every 90 s while
// the tab is visible, on focus, and after every change. Old data stays on screen while it
// refreshes. Changes are optimistic where it matters (drag), with a rollback and a quiet toast.
// Types and routes: lib/pen/calendar-view.ts.

import './calendar.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { CalBrief, CalCreate, CalPatch, CalRange, CalViewEvent } from '@/lib/pen/calendar-view'
import { liveApi, mockApi, type CalApi, type MutResult } from './cal-api'
import { CAL } from './cal-copy'
import { monthTitle, weekTitle } from './cal-format'
import { addDays, browserZone, calLabel, evSpan, hueVars, huesFor, startOfDay, startOfMonth, startOfWeek, ymd } from './cal-utils'
import { ConfirmDialog, Floating, Sheet, Toast, type Anchor } from './CalPanels'
import WeekGrid from './WeekGrid'
import MonthGrid from './MonthGrid'
import Agenda from './Agenda'
import EventDetail from './EventDetail'
import EventForm, { type FormValues } from './EventForm'

export type CalendarViewProps = {
  phone?: boolean
  /** Open a recording (a past meeting's notes). */
  onOpenRecording: (sessionId: string) => void
  /** Settings → Connections, to connect or reconnect a calendar. */
  onOpenConnections: () => void
  /** Dev preview only: answer from this range in memory instead of the API. */
  mock?: CalRange
  mockBrief?: (ref: string) => CalBrief
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
  const todos = new Map<string, CalRange['todos'][number]>()
  const rems = new Map<string, CalRange['reminders'][number]>()
  const failed = new Set<string>()
  for (const p of parts) {
    p.events.forEach((e) => ev.set(e.ref, e))
    p.todos.forEach((t) => todos.set(t.ref, t))
    p.reminders.forEach((r) => rems.set(r.id, r))
    p.failed.forEach((f) => failed.add(f))
  }
  const last = parts[parts.length - 1]
  return { calendars: last.calendars, tz: last.tz, events: [...ev.values()], todos: [...todos.values()], reminders: [...rems.values()], failed: [...failed] }
}

export default function CalendarView({ phone, onOpenRecording, onOpenConnections, mock, mockBrief }: CalendarViewProps) {
  const T = useCopy(CAL)
  const lang = useLang()
  const api: CalApi = useMemo(
    () => (mock ? mockApi(mock, mockBrief ?? (() => ({ people: [] }))) : liveApi),
    // The preview's seed is fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!mock],
  )

  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [now, setNow] = useState(() => new Date())
  const [agendaSteps, setAgendaSteps] = useState(1)
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // ------------------------------------------------------------------ the range on screen
  const weekStart = startOfWeek(anchor)
  const monthStart = startOfWeek(startOfMonth(anchor))
  const chunks: Chunk[] = useMemo(() => {
    if (phone) return Array.from({ length: agendaSteps }, (_, i) => chunk(addDays(today, i * AGENDA_STEP), addDays(today, (i + 1) * AGENDA_STEP)))
    return mode === 'week' ? [chunk(weekStart, addDays(weekStart, 7))] : [chunk(monthStart, addDays(monthStart, 42))]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, agendaSteps, mode, weekStart.getTime(), monthStart.getTime(), today.getTime()])
  const chunkKeys = chunks.map((c) => c.key).join(',')

  const chunksRef = useRef(chunks)
  chunksRef.current = chunks
  const lastLoad = useRef(0)

  const refresh = useCallback(
    async (only?: Chunk[]) => {
      const list = only ?? chunksRef.current
      lastLoad.current = Date.now()
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
      setBusy(false)
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

  const data = merge(chunks.map((c) => cache[c.key]).filter(Boolean))
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
  const events = allEvents.filter((e) => (e.cals.length ? e.cals : [e.cal]).some((k) => !hidden.has(k)))

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
  }, [])

  useEffect(() => {
    if (!panel) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [panel, close])

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
      guests: v.guests.length ? v.guests.map((email) => ({ email, name: null })) : undefined,
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
    const body: CalPatch = {
      ref: ev.ref,
      title: v.title,
      start: ev.allDay ? ymd(v.start) : v.start.toISOString(),
      end: ev.allDay ? ymd(v.end) : v.end.toISOString(),
      location: v.location || null,
      description: v.description || null,
      tz,
    }
    try {
      const r = await run((c) => api.patch(c ? { ...body, confirm: true } : body))
      if ('cancelled' in r) return ''
      if (!('ok' in r)) return T.readOnlyToast
      const saved = r.value
      setLocal((l) => ({ ...l, [ev.ref]: saved }))
      setPanel({ k: 'detail', ref: ev.ref, anchor: panel?.anchor ?? null })
      say(T.saved)
      void settle(ev.ref)
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
    if (phone) document.querySelector('.pen-cal-aday[data-today]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const wt = weekTitle(weekStart, lang)
  const title = mode === 'week' ? wt.main : monthTitle(anchor, lang)
  const ageMin = updatedAt ? Math.floor((now.getTime() - updatedAt) / 60_000) : null
  const failedNames = (data?.failed ?? []).map((k) => calLabel(cals.find((c) => c.key === k)) || k)

  const status = (
    <span className="pen-cal-status" aria-live="polite">
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
              <button type="button" className="pen-cal-reconnect" onClick={onOpenConnections}>
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
          initial={{ title: panelEv.title, allDay: panelEv.allDay, start: sp.s, end: sp.e, cal: panelEv.cal, location: panelEv.location ?? '', description: panelEv.description ?? '', guests: [], video: false }}
          cals={cals}
          hues={hues}
          onSubmit={(v) => editEvent(panelEv, v)}
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
    const end = addDays(today, agendaSteps * AGENDA_STEP)
    return (
      <section className="pen-cal" data-phone aria-label={T.calendar}>
        <div className="pen-cal-pbar">
          <button type="button" className="pen-btn pen-cal-today" onClick={goToday}>{T.today}</button>
          {status}
          {newBtn}
        </div>
        {legend}
        {warn}
        {loadingFirst ? (
          <div className="pen-cal-skel pen-cal-skel-agenda" aria-label={T.loading}>
            <span /><span /><span /><span />
          </div>
        ) : (
          <Agenda
            from={today}
            to={end}
            events={events}
            todos={data?.todos ?? []}
            reminders={data?.reminders ?? []}
            hues={hues}
            now={now}
            loading={busy}
            onOpenEvent={(ev) => open({ k: 'detail', ref: ev.ref, anchor: null })}
            onOpenTodo={onOpenRecording}
            onLoadMore={() => {
              if (!busy && agendaSteps < 13) setAgendaSteps((n) => n + 1)
            }}
          />
        )}
        {overlays}
      </section>
    )
  }

  // ---------------------------------------------------------------------- desktop
  const activeRef = panel && panel.k !== 'create' ? panel.ref : null
  return (
    <section className="pen-cal" aria-label={T.calendar}>
      <header className="pen-cal-bar">
        <div className="pen-cal-bar-l">
          <h2 className="pen-cal-h">
            {title}
            {mode === 'week' && <span className="pen-cal-h-sub">{wt.sub}</span>}
          </h2>
          {status}
        </div>
        <div className="pen-cal-bar-r">
          <button type="button" className="pen-btn pen-cal-today" onClick={goToday}>{T.today}</button>
          <span className="pen-cal-nav">
            <button type="button" className="pen-cal-navbtn" onClick={() => step(-1)} aria-label={T.prev}>
              <Icon name="chevron" size={16} className="pen-cal-flip" />
            </button>
            <button type="button" className="pen-cal-navbtn" onClick={() => step(1)} aria-label={T.next}>
              <Icon name="chevron" size={16} />
            </button>
          </span>
          <span className="pen-cal-seg" role="group" aria-label={T.view}>
            <button type="button" aria-pressed={mode === 'week'} onClick={() => setView('week')}>{T.week}</button>
            <button type="button" aria-pressed={mode === 'month'} onClick={() => setView('month')}>{T.month}</button>
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
        {mode === 'week' ? (
          <WeekGrid
            days={Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))}
            events={events}
            todos={data?.todos ?? []}
            reminders={data?.reminders ?? []}
            hues={hues}
            now={now}
            draft={draft}
            activeRef={activeRef}
            onOpenEvent={(ev, a) => open({ k: 'detail', ref: ev.ref, anchor: a })}
            onCreate={(start, end, a) => open({ k: 'create', start, end, allDay: false, anchor: a })}
            onChange={(ev, s, e) => void moveEvent(ev, s, e)}
            onOpenTodo={onOpenRecording}
          />
        ) : (
          <MonthGrid
            start={monthStart}
            month={anchor.getMonth()}
            events={events}
            todos={data?.todos ?? []}
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
