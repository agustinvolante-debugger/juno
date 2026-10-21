'use client'

// Create or edit an event. The week grid prefills the time from the slot that was dragged; the
// phone prefills the next half hour and uses the native date and time pickers.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy } from '../LangContext'
import type { CalAccount, CalGuest } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import type { CalPerson } from './cal-api'
import { addDays, calLabel, hm, hueVars, parseEmails, parseYmd, suggestPeople, withTime, ymd, type Hue } from './cal-utils'
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
  people: loadPeople,
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
  /** The saved people to suggest as guests (CalApi.people). */
  people?: () => Promise<CalPerson[]>
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
  const people = useSavedPeople(loadPeople)
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
    const named = new Map(people.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p.name]))
    const allGuests = [...guests, ...typed.map((email) => ({ email, name: named.get(email) ?? null }))]
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
          people={people}
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

// The saved people, loaded once per page life and refreshed at most every 5 minutes. A failed
// read means no suggestions; typing addresses works as before.
const PEOPLE_TTL = 5 * 60_000
let peopleCache: { load: () => Promise<CalPerson[]>; at: number; list: CalPerson[] } | null = null
let peopleInFlight: Promise<CalPerson[]> | null = null

function useSavedPeople(load?: () => Promise<CalPerson[]>): CalPerson[] {
  const fresh = peopleCache && peopleCache.load === load ? peopleCache.list : []
  const [list, setList] = useState<CalPerson[]>(fresh)
  useEffect(() => {
    if (!load) return
    if (peopleCache && peopleCache.load === load && Date.now() - peopleCache.at < PEOPLE_TTL) {
      setList(peopleCache.list)
      return
    }
    let live = true
    peopleInFlight ??= load()
      .then((l) => {
        peopleCache = { load, at: Date.now(), list: l }
        return l
      })
      .finally(() => {
        peopleInFlight = null
      })
    peopleInFlight.then((l) => live && setList(l)).catch(() => {})
    return () => {
      live = false
    }
  }, [load])
  return list
}

/**
 * Guests as chips. Type a saved person's name (or part of it, or their email) and pick them from
 * the list, or type or paste addresses (Enter, comma, space or leaving the box adds them);
 * × or Backspace removes. A combobox: the list is in the flow under the box, so neither the
 * desktop panel nor the phone sheet can clip it.
 */
function GuestsEditor({ id, guests, text, onText, onChange, people }: { id: string; guests: CalGuest[]; text: string; onText: (s: string) => void; onChange: (g: CalGuest[]) => void; people: CalPerson[] }) {
  const T = useCopy(CAL)
  const inputRef = useRef<HTMLInputElement>(null)
  const [bad, setBad] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = `${id}-list`

  const byEmail = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of people) if (p.email) m.set(p.email.toLowerCase(), p.name)
    return m
  }, [people])
  const added = useMemo(() => new Set(guests.map((g) => g.email.toLowerCase())), [guests])
  const matches = useMemo(() => suggestPeople(people, text, added), [people, text, added])
  const firstOk = matches.findIndex((p) => p.email)
  const typedEmails = parseEmails(text)
  // "Type an email address": something typed, nobody saved matches it, and it is not an address.
  const hint = !!text.trim() && !matches.length && !typedEmails.length && people.length > 0
  const shown = open && (matches.length > 0 || hint)
  const cur = matches[active]?.email ? active : firstOk
  const listRef = useRef<HTMLUListElement>(null)
  // Phone: the keyboard covers the bottom of the sheet; bring the list into view as it opens.
  useEffect(() => {
    if (shown) listRef.current?.scrollIntoView({ block: 'nearest' })
  }, [shown, matches.length])

  const guestFor = (email: string): CalGuest => ({ email, name: byEmail.get(email) ?? null })
  const take = (raw: string): boolean => {
    const found = parseEmails(raw).filter((m) => !added.has(m))
    if (!raw.trim()) return true
    if (!parseEmails(raw).length) {
      setBad(T.badEmail(raw.trim()))
      return false
    }
    onChange([...guests, ...found.map(guestFor)])
    onText('')
    setBad(null)
    return true
  }
  const pick = (p: CalPerson) => {
    if (!p.email) return
    const email = p.email.toLowerCase()
    if (!added.has(email)) onChange([...guests, { email, name: p.name }])
    onText('')
    setBad(null)
    setActive(0)
    inputRef.current?.focus()
  }
  const move = (dir: 1 | -1) => {
    const ok = matches.map((p, i) => (p.email ? i : -1)).filter((i) => i >= 0)
    if (!ok.length) return
    const at = ok.indexOf(cur)
    setActive(ok[(at + dir + ok.length) % ok.length])
  }
  const remove = (email: string) => {
    onChange(guests.filter((g) => g.email !== email))
    inputRef.current?.focus()
  }
  return (
    <div className="pen-cal-guestbox-wrap">
      <div className="pen-cal-guestbox" data-bad={bad ? true : undefined} data-open={shown || undefined} onClick={(e) => e.target === e.currentTarget && inputRef.current?.focus()}>
        {guests.length > 0 && (
          <ul className="pen-cal-chips" aria-label={T.guestsLabel}>
            {guests.map((g) => (
              <li key={g.email} className="pen-cal-chip" title={g.email}>
                <span className="pen-cal-chip-t">{g.name || g.email}</span>
                <button type="button" onClick={() => remove(g.email)} aria-label={T.removeGuest(g.name ? `${g.name} (${g.email})` : g.email)}>
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
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={listId}
          aria-activedescendant={shown && cur >= 0 ? `${listId}-${cur}` : undefined}
          onChange={(e) => {
            const v = e.target.value
            if (bad) setBad(null)
            setOpen(true)
            setActive(0)
            // A pasted list, or a separator after an address: turn it into chips.
            if (/[,;\s]$/.test(v) && parseEmails(v).length) take(v)
            else onText(v)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!matches.length) return
              e.preventDefault()
              if (!open) setOpen(true)
              else move(e.key === 'ArrowDown' ? 1 : -1)
            } else if (e.key === 'Escape' && shown) {
              // Close the list only; the panel stays open.
              e.stopPropagation()
              setOpen(false)
            } else if (e.key === 'Enter' && text.trim()) {
              e.preventDefault()
              // A full address typed out goes in as typed (named, when it is someone saved).
              const whole = typedEmails.length === 1 && typedEmails[0] === text.trim().toLowerCase()
              if (shown && cur >= 0 && !whole) pick(matches[cur])
              else take(text)
            } else if (e.key === 'Backspace' && !text && guests.length) {
              onChange(guests.slice(0, -1))
            }
          }}
          onBlur={() => {
            setOpen(false)
            // Leaving the box keeps an address; a half-typed name stays for the save check.
            if (typedEmails.length) take(text)
          }}
          onPaste={(e) => {
            const p = e.clipboardData.getData('text')
            if (parseEmails(p).length > 1) {
              e.preventDefault()
              take(`${text} ${p}`)
            }
          }}
          placeholder={guests.length ? '' : people.length ? T.addGuestPhPeople : T.addGuestPh}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="enter"
          aria-invalid={bad ? true : undefined}
          aria-describedby={bad ? `${id}-bad` : undefined}
        />
      </div>
      <ul ref={listRef} id={listId} className="pen-cal-sugg" role="listbox" aria-label={T.savedPeople} hidden={!shown}>
        {shown &&
          matches.map((p, i) => (
            <li
              key={`${p.name}|${p.email ?? ''}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === cur}
              aria-disabled={!p.email || undefined}
              data-active={i === cur || undefined}
              title={p.email ?? undefined}
              // Keep the caret in the box: a click picks without blurring it first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              onMouseMove={() => p.email && i !== cur && setActive(i)}
            >
              <span className="pen-cal-avatar" aria-hidden>{p.name.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase() || '?'}</span>
              <span className="pen-cal-sugg-t">
                <span className="pen-cal-sugg-name">{p.name}</span>
                <span className="pen-cal-sugg-mail">{p.email ?? T.noEmailSaved}</span>
              </span>
            </li>
          ))}
        {shown && hint && (
          <li className="pen-cal-sugg-hint" role="option" aria-disabled aria-selected={false} onMouseDown={(e) => e.preventDefault()}>
            {T.typeEmail}
          </li>
        )}
      </ul>
      {bad && <span id={`${id}-bad`} className="pen-cal-form-hint" data-k="bad" role="alert">{bad}</span>}
    </div>
  )
}
