'use client'

// Create or edit an event. The week grid prefills the time from the slot that was dragged; the
// phone prefills the next half hour and uses the native date and time pickers.

import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy } from '../LangContext'
import type { CalAccount, CalGuest } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { addDays, calLabel, hm, hueVars, parseEmails, parseYmd, withTime, ymd, type Hue } from './cal-utils'
import { VideoIcon, PinIcon } from './EventDetail'

export type FormValues = {
  title: string
  allDay: boolean
  start: Date
  /** Timed: the end instant. All-day: the exclusive end date. */
  end: Date
  cal: string
  location: string
  description: string
  guests: CalGuest[]
  video: boolean
}

export default function EventForm({
  mode,
  initial,
  cals,
  hues,
  onSubmit,
  onCancel,
  onDraftChange,
  readOnlyAllDay,
  meet,
  recurring,
}: {
  mode: 'create' | 'edit'
  initial: FormValues
  cals: CalAccount[]
  hues: Record<string, Hue>
  onSubmit: (v: FormValues) => Promise<string | null>
  onCancel: () => void
  /** The week grid redraws its ghost as the times change. */
  onDraftChange?: (start: Date, end: Date, allDay: boolean) => void
  readOnlyAllDay?: boolean
  /** Edit: the event's video link, if it has one (shown instead of the toggle). */
  meet?: string | null
  /** Edit: one time of a repeating event (it can't move to another calendar). */
  recurring?: boolean
}) {
  const T = useCopy(CAL)
  const id = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(initial.title)
  const [allDay, setAllDay] = useState(initial.allDay)
  const [date, setDate] = useState(ymd(initial.start))
  const [endDate, setEndDate] = useState(ymd(initial.allDay ? addDays(initial.end, -1) : initial.end))
  const [t0, setT0] = useState(hm(initial.start))
  const [t1, setT1] = useState(hm(initial.end))
  const [cal, setCal] = useState(initial.cal)
  const [location, setLocation] = useState(initial.location)
  const [description, setDescription] = useState(initial.description)
  const [guests, setGuests] = useState<CalGuest[]>(initial.guests)
  const [guestText, setGuestText] = useState('')
  const [video, setVideo] = useState(initial.video)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const usable = cals.filter((c) => !c.broken)
  // Edit: a meeting with guests (or one time of a repeating event) stays on its calendar.
  const calLock = mode !== 'edit' ? null : guests.length || guestText.trim() ? T.calLockedGuests : recurring ? T.calLockedRecurring : null

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const span = (): { start: Date; end: Date } => {
    const d = parseYmd(date)
    if (allDay) {
      const last = endDate && endDate >= date ? parseYmd(endDate) : d
      return { start: d, end: addDays(last, 1) }
    }
    const start = withTime(d, t0 || '09:00')
    let end = withTime(d, t1 || '10:00')
    if (end <= start) end = addDays(end, 1)
    return { start, end }
  }

  useEffect(() => {
    if (!onDraftChange) return
    const s = span()
    onDraftChange(s.start, s.end, allDay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, endDate, t0, t1, allDay])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setErr(T.needTitle)
      titleRef.current?.focus()
      return
    }
    // Whatever is still typed in the guest box counts, when it is an address.
    const typed = parseEmails(guestText).filter((m) => !guests.some((g) => g.email === m))
    if (guestText.trim() && !typed.length) {
      setErr(T.badEmail(guestText.trim()))
      return
    }
    const allGuests = [...guests, ...typed.map((email) => ({ email, name: null }))]
    if (typed.length) {
      setGuests(allGuests)
      setGuestText('')
    }
    const s = span()
    setBusy(true)
    setErr(null)
    const msg = await onSubmit({
      title: title.trim(), allDay, start: s.start, end: s.end, cal, location: location.trim(),
      description: description.trim(), guests: allGuests, video,
    })
    setBusy(false)
    if (msg) setErr(msg)
  }

  return (
    <form className="pen-cal-form" onSubmit={submit} noValidate>
      <header className="pen-cal-form-head">
        <h2 className="pen-cal-form-h">{mode === 'create' ? T.newTitle : T.editTitle}</h2>
        <button type="button" className="pen-cal-x" onClick={onCancel} aria-label={T.close}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <label className="pen-cal-sr" htmlFor={`${id}-t`}>{T.title}</label>
      <input
        id={`${id}-t`}
        ref={titleRef}
        className="pen-cal-title-in"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={T.titlePh}
        autoComplete="off"
        aria-invalid={err === T.needTitle || undefined}
        aria-describedby={err === T.needTitle ? `${id}-err` : undefined}
      />

      <div className="pen-cal-when">
        <span className="pen-cal-fact-ic"><Icon name="clock" size={16} /></span>
        <div className="pen-cal-when-fields">
          <div className="pen-cal-when-row" data-timed={!allDay || undefined}>
            <label className="pen-cal-field">
              <span className="pen-cal-field-k">{allDay ? T.starts : T.date}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            {allDay ? (
              <label className="pen-cal-field">
                <span className="pen-cal-field-k">{T.ends}</span>
                <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            ) : (
              <>
                <label className="pen-cal-field pen-cal-field-time">
                  <span className="pen-cal-field-k">{T.starts}</span>
                  <input type="time" step={900} value={t0} onChange={(e) => setT0(e.target.value)} required />
                </label>
                <label className="pen-cal-field pen-cal-field-time">
                  <span className="pen-cal-field-k">{T.ends}</span>
                  <input type="time" step={900} value={t1} onChange={(e) => setT1(e.target.value)} required />
                </label>
              </>
            )}
          </div>
          {!readOnlyAllDay && (
            <label className="pen-cal-check">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>{T.allDay}</span>
            </label>
          )}
        </div>
      </div>

      {usable.length > 1 && (
        <div className="pen-cal-row-in pen-cal-row-top">
          <span className="pen-cal-fact-ic" style={hueVars(hues[cal])}><span className="pen-cal-dot" aria-hidden /></span>
          <span className="pen-cal-calpick">
            <label className="pen-cal-sr" htmlFor={`${id}-c`}>{T.cal}</label>
            <select id={`${id}-c`} value={cal} onChange={(e) => setCal(e.target.value)} disabled={!!calLock} aria-describedby={calLock ? `${id}-cl` : undefined}>
              {(usable.some((c) => c.key === cal) ? usable : [...cals.filter((c) => c.key === cal), ...usable]).map((c) => (
                <option key={c.key} value={c.key}>{calLabel(c)}</option>
              ))}
            </select>
            {calLock && <span id={`${id}-cl`} className="pen-cal-form-hint">{calLock}</span>}
          </span>
        </div>
      )}

      <label className="pen-cal-row-in">
        <span className="pen-cal-fact-ic"><PinIcon /></span>
        <span className="pen-cal-sr">{T.location}</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={T.locationPh} autoComplete="off" />
      </label>

      <div className="pen-cal-row-in pen-cal-row-top">
        <span className="pen-cal-fact-ic"><Icon name="people" size={16} /></span>
        <GuestsEditor
          id={`${id}-g`}
          guests={guests}
          text={guestText}
          onText={setGuestText}
          onChange={(g) => {
            setGuests(g)
            if (err && err !== T.needTitle) setErr(null)
          }}
        />
      </div>
      {mode === 'edit' && meet ? (
        <div className="pen-cal-row-in pen-cal-hasvideo">
          <span className="pen-cal-fact-ic"><VideoIcon /></span>
          <span className="pen-cal-hasvideo-body">
            <span>{T.hasVideo}</span>
            <a href={meet} target="_blank" rel="noreferrer">{linkLabel(meet)}</a>
          </span>
        </div>
      ) : (
        <label className="pen-cal-check pen-cal-check-row">
          <span className="pen-cal-fact-ic"><VideoIcon /></span>
          <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />
          <span>{T.addVideo}</span>
        </label>
      )}

      <label className="pen-cal-row-in pen-cal-row-area">
        <span className="pen-cal-sr">{T.description}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={T.descriptionPh} rows={2} />
      </label>

      {err && <p id={`${id}-err`} className="pen-cal-form-err" role="alert">{err}</p>}

      <footer className="pen-cal-form-foot">
        <button type="button" className="pen-btn pen-cal-sm" onClick={onCancel}>{T.cancel}</button>
        <button type="submit" className="pen-btn pen-btn-accent pen-cal-sm" disabled={busy}>
          {busy ? T.saving : mode === 'create' ? T.create : T.save}
        </button>
      </footer>
    </form>
  )
}

/** "https://meet.google.com/abc-defg-hij" → "meet.google.com/abc-defg-hij" (long Teams links shortened). */
function linkLabel(url: string): string {
  try {
    const u = new URL(url)
    const t = `${u.host}${u.pathname === '/' ? '' : u.pathname}`
    return t.length > 42 ? `${t.slice(0, 40)}…` : t
  } catch {
    return url
  }
}

/** Guests as chips: type or paste addresses (Enter, comma, space or leaving the box adds them), × or Backspace removes. */
function GuestsEditor({ id, guests, text, onText, onChange }: { id: string; guests: CalGuest[]; text: string; onText: (s: string) => void; onChange: (g: CalGuest[]) => void }) {
  const T = useCopy(CAL)
  const inputRef = useRef<HTMLInputElement>(null)
  const [bad, setBad] = useState<string | null>(null)
  const take = (raw: string): boolean => {
    const found = parseEmails(raw).filter((m) => !guests.some((g) => g.email === m))
    if (!raw.trim()) return true
    if (!parseEmails(raw).length) {
      setBad(T.badEmail(raw.trim()))
      return false
    }
    onChange([...guests, ...found.map((email) => ({ email, name: null }))])
    onText('')
    setBad(null)
    return true
  }
  const remove = (email: string) => {
    onChange(guests.filter((g) => g.email !== email))
    inputRef.current?.focus()
  }
  return (
    <div className="pen-cal-guestbox-wrap">
      <div className="pen-cal-guestbox" data-bad={bad ? true : undefined} onClick={(e) => e.target === e.currentTarget && inputRef.current?.focus()}>
        {guests.length > 0 && (
          <ul className="pen-cal-chips" aria-label={T.guestsLabel}>
            {guests.map((g) => (
              <li key={g.email} className="pen-cal-chip" title={g.email}>
                <span className="pen-cal-chip-t">{g.name || g.email}</span>
                <button type="button" onClick={() => remove(g.email)} aria-label={T.removeGuest(g.name || g.email)}>
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="pen-cal-sr" htmlFor={id}>{T.guestsLabel}</label>
        <input
          id={id}
          ref={inputRef}
          className="pen-cal-guest-in"
          value={text}
          onChange={(e) => {
            const v = e.target.value
            if (bad) setBad(null)
            // A pasted list, or a separator after an address: turn it into chips.
            if (/[,;\s]$/.test(v) && parseEmails(v).length) take(v)
            else onText(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              e.preventDefault()
              take(text)
            } else if (e.key === 'Backspace' && !text && guests.length) {
              onChange(guests.slice(0, -1))
            }
          }}
          onBlur={() => text.trim() && take(text)}
          onPaste={(e) => {
            const p = e.clipboardData.getData('text')
            if (parseEmails(p).length > 1) {
              e.preventDefault()
              take(`${text} ${p}`)
            }
          }}
          placeholder={guests.length ? '' : T.addGuestPh}
          inputMode="email"
          autoComplete="off"
          aria-invalid={bad ? true : undefined}
          aria-describedby={bad ? `${id}-bad` : undefined}
        />
      </div>
      {bad && <span id={`${id}-bad`} className="pen-cal-form-hint" data-k="bad" role="alert">{bad}</span>}
    </div>
  )
}
