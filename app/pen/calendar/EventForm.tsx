'use client'

// Create or edit an event. The week grid prefills the time from the slot that was dragged; the
// phone prefills the next half hour and uses the native date and time pickers.

import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy } from '../LangContext'
import type { CalAccount } from '@/lib/pen/calendar-view'
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
  guests: string[]
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
  const [guests, setGuests] = useState(initial.guests.join(', '))
  const [video, setVideo] = useState(initial.video)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const usable = cals.filter((c) => !c.broken)

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
    const s = span()
    setBusy(true)
    setErr(null)
    const msg = await onSubmit({
      title: title.trim(), allDay, start: s.start, end: s.end, cal, location: location.trim(),
      description: description.trim(), guests: parseEmails(guests), video,
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

      {mode === 'create' && usable.length > 1 && (
        <label className="pen-cal-row-in">
          <span className="pen-cal-fact-ic" style={hueVars(hues[cal])}><span className="pen-cal-dot" aria-hidden /></span>
          <span className="pen-cal-sr">{T.cal}</span>
          <select value={cal} onChange={(e) => setCal(e.target.value)}>
            {usable.map((c) => (
              <option key={c.key} value={c.key}>{calLabel(c)}</option>
            ))}
          </select>
        </label>
      )}

      <label className="pen-cal-row-in">
        <span className="pen-cal-fact-ic"><PinIcon /></span>
        <span className="pen-cal-sr">{T.location}</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={T.locationPh} autoComplete="off" />
      </label>

      {mode === 'create' && (
        <>
          <label className="pen-cal-row-in">
            <span className="pen-cal-fact-ic"><Icon name="people" size={16} /></span>
            <span className="pen-cal-sr">{T.guestsLabel}</span>
            <input value={guests} onChange={(e) => setGuests(e.target.value)} placeholder={T.guestsPh} inputMode="email" autoComplete="off" />
          </label>
          <label className="pen-cal-check pen-cal-check-row">
            <span className="pen-cal-fact-ic"><VideoIcon /></span>
            <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />
            <span>{T.addVideo}</span>
          </label>
        </>
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
