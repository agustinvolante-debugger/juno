'use client'

// One event, opened: when, which calendars, place, video, guests, notes, and Juno's extras (the
// recording of a past meeting, the brief before an upcoming one). Same body on desktop (floating
// panel) and phone (bottom sheet).

import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import { useCopy, useLang } from '../LangContext'
import { shortDate } from '@/lib/pen/i18n'
import type { CalAccount, CalBrief, CalViewEvent } from '@/lib/pen/calendar-view'
import { CAL } from './cal-copy'
import { eventWhen, looksRecurring } from './cal-format'
import { calLabel, evSpan, hueVars, type Hue } from './cal-utils'
import type { CalApi } from './cal-api'

export function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 17.2s5.4-4.9 5.4-9.1a5.4 5.4 0 0 0-10.8 0c0 4.2 5.4 9.1 5.4 9.1Z" />
      <circle cx="10" cy="8.1" r="1.9" />
    </svg>
  )
}
export function VideoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.6" y="5.4" width="10.4" height="9.2" rx="2" />
      <path d="m13 8.6 4.4-2.4v7.6L13 11.4" />
    </svg>
  )
}
function TextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M3.6 5.4h12.8M3.6 10h12.8M3.6 14.6h8" />
    </svg>
  )
}
function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11.4 3.6h5v5M16.2 3.8 9.4 10.6" />
      <path d="M14.6 11.6v3.6a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2V6.6a1.2 1.2 0 0 1 1.2-1.2h3.6" />
    </svg>
  )
}

export default function EventDetail({
  ev,
  cals,
  hues,
  api,
  onClose,
  onEdit,
  onDelete,
  onOpenRecording,
  onOpenSession,
}: {
  ev: CalViewEvent
  cals: CalAccount[]
  hues: Record<string, Hue>
  api: CalApi
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  onOpenRecording: (id: string) => void
  onOpenSession: (id: string) => void
}) {
  const T = useCopy(CAL)
  const lang = useLang()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  // The trash button goes away when it asks; keep the keyboard on the question (and back on the
  // trash button if the answer is no).
  const cancelRef = useRef<HTMLButtonElement>(null)
  const trashRef = useRef<HTMLButtonElement>(null)
  const askedOnce = useRef(false)
  useEffect(() => {
    if (asking) {
      askedOnce.current = true
      cancelRef.current?.focus()
    } else if (askedOnce.current) trashRef.current?.focus()
  }, [asking])
  const cal = cals.find((c) => c.key === ev.cal)
  const provider = cal?.provider ?? 'google'
  const onCals = (ev.cals.length ? ev.cals : [ev.cal]).map((k) => cals.find((c) => c.key === k)).filter(Boolean) as CalAccount[]
  const upcoming = evSpan(ev).e.getTime() > Date.now()
  const host = ev.organizer?.name || ev.organizer?.email || T.someoneElse

  return (
    <div className="pen-cal-detail" style={hueVars(hues[ev.cal])}>
      <header className="pen-cal-detail-head">
        <span className="pen-cal-swatch" aria-hidden />
        <div className="pen-cal-detail-titles">
          <h2 className="pen-cal-detail-title" data-declined={ev.declined || undefined}>{ev.title || T.untitled}</h2>
          <p className="pen-cal-detail-when">{eventWhen(ev, lang, T)}</p>
          {(ev.declined || ev.recording || (ev.hasBrief && upcoming)) && (
            <p className="pen-cal-detail-tags">
              {ev.declined && <span className="pen-cal-tag">{T.declined}</span>}
              {ev.recording && <span className="pen-cal-tag" data-k="rec"><Icon name="mic" size={12} />{T.recorded}</span>}
              {ev.hasBrief && upcoming && <span className="pen-cal-tag" data-k="brief"><Icon name="sparkle" size={12} />{T.briefReady}</span>}
            </p>
          )}
        </div>
        <button type="button" className="pen-cal-x" onClick={onClose} aria-label={T.close}>
          <Icon name="close" size={18} />
        </button>
      </header>

      {ev.recording && (
        <div className="pen-cal-detail-rec">
          <button type="button" className="pen-btn pen-btn-accent pen-cal-rec-btn" onClick={() => onOpenRecording(ev.recording!.id)}>
            <Icon name="doc" size={16} />
            {T.openNotes}
          </button>
          <span className="pen-cal-rec-title">{ev.recording.title}</span>
        </div>
      )}

      <ul className="pen-cal-facts">
        <li>
          <span className="pen-cal-fact-ic"><Icon name="calendar" size={16} /></span>
          <span className="pen-cal-fact-body pen-cal-onlist">
            {onCals.map((c) => (
              <span key={c.key} className="pen-cal-on" style={hueVars(hues[c.key])}>
                <span className="pen-cal-dot" aria-hidden />
                {calLabel(c)}
              </span>
            ))}
          </span>
        </li>
        {ev.meet && upcoming && (
          <li>
            <span className="pen-cal-fact-ic"><VideoIcon /></span>
            <span className="pen-cal-fact-body pen-cal-fact-row">
              <span>{T.video}</span>
              <a className="pen-btn pen-btn-accent pen-cal-join" href={ev.meet} target="_blank" rel="noreferrer">{T.join}</a>
            </span>
          </li>
        )}
        {ev.location && (
          <li>
            <span className="pen-cal-fact-ic"><PinIcon /></span>
            <span className="pen-cal-fact-body">{ev.location}</span>
          </li>
        )}
        {ev.guests.length > 0 && (
          <li>
            <span className="pen-cal-fact-ic"><Icon name="people" size={16} /></span>
            <span className="pen-cal-fact-body">
              <span className="pen-cal-fact-label">{T.guests} · {ev.guests.length}</span>
              <ul className="pen-cal-guests">
                {ev.guests.map((g) => {
                  const org = ev.organizer?.email && g.email.toLowerCase() === ev.organizer.email.toLowerCase()
                  return (
                    <li key={g.email}>
                      <span className="pen-cal-avatar" aria-hidden>{(g.name || g.email).charAt(0).toUpperCase()}</span>
                      <span className="pen-cal-guest">
                        <span className="pen-cal-guest-name">{g.name || g.email}</span>
                        {org ? <span className="pen-cal-guest-org">{T.organiser}</span> : g.name ? <span className="pen-cal-guest-mail">{g.email}</span> : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </span>
          </li>
        )}
        {ev.description && (
          <li>
            <span className="pen-cal-fact-ic"><TextIcon /></span>
            <span className="pen-cal-fact-body pen-cal-desc">{ev.description}</span>
          </li>
        )}
      </ul>

      {ev.hasBrief && upcoming && <Brief evRef={ev.ref} api={api} onOpenSession={onOpenSession} />}

      {looksRecurring(ev) && ev.editable && <p className="pen-cal-note">{T.recurring}</p>}
      {!ev.editable && <p className="pen-cal-note" data-k="ro"><Icon name="lock" size={14} />{T.readOnly(host, provider)}</p>}

      <footer className="pen-cal-detail-foot">
        {ev.link ? (
          <a className="pen-cal-extlink" href={ev.link} target="_blank" rel="noreferrer">
            {T.openIn(provider)}
            <ExternalIcon />
          </a>
        ) : <span />}
        {ev.editable && !asking && (
          <span className="pen-cal-foot-acts">
            <button type="button" className="pen-btn pen-cal-sm" onClick={onEdit}>
              <Icon name="pen" size={15} />
              {T.edit}
            </button>
            <button ref={trashRef} type="button" className="pen-btn pen-btn-quiet pen-cal-sm" onClick={() => setAsking(true)} aria-label={T.del} title={T.del}>
              <Icon name="trash" size={15} />
            </button>
          </span>
        )}
        {asking && (
          <span className="pen-cal-delask" role="group" aria-label={T.deleteAsk}>
            <span>{T.deleteAsk}</span>
            <button ref={cancelRef} type="button" className="pen-btn pen-cal-sm" onClick={() => setAsking(false)} disabled={busy}>{T.cancel}</button>
            <button
              type="button"
              className="pen-btn pen-cal-sm pen-cal-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onDelete()
                } finally {
                  setBusy(false)
                  setAsking(false)
                }
              }}
            >
              {T.del}
            </button>
          </span>
        )}
      </footer>
    </div>
  )
}

function Brief({ evRef, api, onOpenSession }: { evRef: string; api: CalApi; onOpenSession: (id: string) => void }) {
  const T = useCopy(CAL)
  const lang = useLang()
  const [state, setState] = useState<{ k: 'loading' } | { k: 'error' } | { k: 'ok'; brief: CalBrief }>({ k: 'loading' })
  useEffect(() => {
    let live = true
    setState({ k: 'loading' })
    api.brief(evRef).then(
      (brief) => live && setState({ k: 'ok', brief }),
      () => live && setState({ k: 'error' }),
    )
    return () => {
      live = false
    }
  }, [evRef, api])

  return (
    <section className="pen-cal-brief" aria-labelledby="pen-cal-brief-t" aria-busy={state.k === 'loading'}>
      <h3 id="pen-cal-brief-t" className="pen-cal-brief-t">
        <Icon name="sparkle" size={14} />
        {T.brief}
      </h3>
      {state.k === 'loading' && (
        <div className="pen-cal-skel" aria-label={T.loading}>
          <span style={{ width: '42%' }} />
          <span style={{ width: '92%' }} />
          <span style={{ width: '74%' }} />
        </div>
      )}
      {state.k === 'error' && <p className="pen-cal-brief-empty">{T.briefError}</p>}
      {state.k === 'ok' && !state.brief.people.some((p) => p.lastCall || p.youOwe.length || p.theyOwe.length) && (
        <p className="pen-cal-brief-empty">{T.noPast}</p>
      )}
      {state.k === 'ok' &&
        state.brief.people
          .filter((p) => p.lastCall || p.youOwe.length || p.theyOwe.length)
          .map((p) => (
            <div key={p.email ?? p.name} className="pen-cal-person">
              <p className="pen-cal-person-name">{p.name}</p>
              {p.lastCall && (
                <button type="button" className="pen-cal-lastcall" onClick={() => onOpenSession(p.lastCall!.sessionId)}>
                  <span className="pen-cal-lastcall-meta">
                    {T.lastCall} · {shortDate(p.lastCall.date, lang)} · <span className="pen-cal-lastcall-title">{p.lastCall.title}</span>
                  </span>
                  <span className="pen-cal-lastcall-sum">{p.lastCall.summary}</span>
                </button>
              )}
              {p.youOwe.length > 0 && (
                <div className="pen-cal-owe">
                  <span className="pen-cal-owe-k">{T.youOwe}</span>
                  <ul>{p.youOwe.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              {p.theyOwe.length > 0 && (
                <div className="pen-cal-owe" data-k="they">
                  <span className="pen-cal-owe-k">{T.theyOwe}</span>
                  <ul>{p.theyOwe.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
            </div>
          ))}
    </section>
  )
}
