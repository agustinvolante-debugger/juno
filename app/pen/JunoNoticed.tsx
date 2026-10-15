'use client'

// What Juno heard that it can help with, on the web (critique 15 Oct, P1).
//
//   JunoNoticed    on a recording, right under the AI summary: its ≤3 open offers.
//   WaitingOnYou   the top of Home: every open offer across recordings, and what Juno did after
//                  a yes in the last two weeks (events added, reminders set, pages created).
//   DateChip       a dated to-do's date, which is also its "add to calendar".
//
// Same rows as WhatsApp (pen_suggestions) through /api/pen/suggestions, which runs the same
// accept logic (lib/pen/offer-accept.ts): a yes here is a yes there, and an offer answered on
// WhatsApp is gone from here on the next load. Nothing acts until the button is clicked: the
// click is the yes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon, { type IconName } from './Icon'
import { useCopy, useLang } from './LangContext'
import { getJson, postJson, errMessage } from '@/lib/pen/http'
import { fmtDate, shortDate, type Copy } from '@/lib/pen/i18n'
import type { AcceptOutcome, WebSuggestion } from '@/lib/pen/suggestion-view'
import type { SuggestionKind } from '@/lib/pen/suggestions-types'

const EASE_OUT = [0.16, 1, 0.3, 1] as const

/* ================================================================== copy */

const JN_EN = {
  noticed: 'Juno noticed',
  waiting: 'Juno is waiting on you',
  waitingSub: 'From your recordings. Nothing happens until you say yes.',
  did: 'What Juno did',
  didSub: 'Last 14 days',
  didEmpty: 'Nothing yet. When you say yes to something, it shows up here.',
  addCalendar: 'Add to calendar',
  remindMe: 'Remind me',
  createNotion: 'Create the page',
  markHandled: 'Mark handled',
  dismiss: 'Dismiss',
  dismissed: 'Dismissed',
  working: 'Working…',
  heard: (q: string) => `“${q}”`,
  from: (t: string) => `From ${t}`,
  whatTime: 'No time was said. What time?',
  add: 'Add',
  cancel: 'Cancel',
  notionOff: 'Notion isn’t connected yet.',
  connectNotion: 'Connect Notion',
  pageOff: 'Connect Notion or Google Docs, and Juno makes the page there.',
  connectGdocs: 'Connect Google Docs',
  chooseDest: 'Where should Juno make the page? It remembers for next time.',
  gdocCreated: 'Doc created in Google Docs',
  didGdoc: 'Google Doc created',
  plainInstead: 'Make it to-dos instead',
  addedGoogle: 'Added to Google Calendar',
  addedFile: 'Calendar file opened',
  openEvent: 'Open event',
  appleCal: 'Apple Calendar',
  googleCal: 'Google Calendar',
  reminderAt: (w: string) => `Reminder set for ${w}`,
  onTodos: (d: string | null) => (d ? `On your to-dos for ${d}` : 'Added to your to-dos'),
  pageCreated: 'Page created in Notion',
  openPage: 'Open page',
  planAdded: (n: number) => `${n} step${n === 1 ? '' : 's'} added to your to-dos`,
  handled: 'Marked handled',
  didMeeting: 'Added to your calendar',
  didReminder: 'Reminder set',
  didTodo: 'Saved as a to-do',
  didNotion: 'Notion page created',
  didPlan: 'Plan added to your to-dos',
  didOther: 'You said yes',
  kind: { meeting: 'Meeting', followup: 'Follow-up', notion: 'Page', other: 'Help' } as Record<SuggestionKind, string>,
  dateAdd: (d: string) => `${d}: add to calendar`,
  dateAdded: 'Added to your calendar',
  dateFailed: 'Could not add it to your calendar. Try again.',
}

const JN: Copy<typeof JN_EN> = {
  en: JN_EN,
  es: {
    noticed: 'Juno notó',
    waiting: 'Juno espera tu respuesta',
    waitingSub: 'De tus grabaciones. No pasa nada hasta que digas que sí.',
    did: 'Lo que hizo Juno',
    didSub: 'Últimos 14 días',
    didEmpty: 'Nada todavía. Cuando digas que sí a algo, aparece aquí.',
    addCalendar: 'Agregar al calendario',
    remindMe: 'Recuérdamelo',
    createNotion: 'Crear la página',
    markHandled: 'Marcar como resuelto',
    dismiss: 'Descartar',
    dismissed: 'Descartado',
    working: 'Trabajando…',
    heard: (q) => `“${q}”`,
    from: (t) => `De ${t}`,
    whatTime: 'No se dijo la hora. ¿A qué hora?',
    add: 'Agregar',
    cancel: 'Cancelar',
    notionOff: 'Notion todavía no está conectado.',
    connectNotion: 'Conectar Notion',
    pageOff: 'Conecta Notion o Google Docs y Juno hace la página ahí.',
    connectGdocs: 'Conectar Google Docs',
    chooseDest: '¿Dónde hace Juno la página? Lo recuerda para la próxima.',
    gdocCreated: 'Documento creado en Google Docs',
    didGdoc: 'Google Doc creado',
    plainInstead: 'Mejor como tareas',
    addedGoogle: 'Agregado a Google Calendar',
    addedFile: 'Se abrió el archivo del calendario',
    openEvent: 'Ver evento',
    appleCal: 'Calendario de Apple',
    googleCal: 'Google Calendar',
    reminderAt: (w) => `Recordatorio para el ${w}`,
    onTodos: (d) => (d ? `En tus pendientes para el ${d}` : 'Agregado a tus pendientes'),
    pageCreated: 'Página creada en Notion',
    openPage: 'Abrir página',
    planAdded: (n) => `${n} ${n === 1 ? 'paso agregado' : 'pasos agregados'} a tus pendientes`,
    handled: 'Marcado como resuelto',
    didMeeting: 'Agregado a tu calendario',
    didReminder: 'Recordatorio listo',
    didTodo: 'Guardado como pendiente',
    didNotion: 'Página de Notion creada',
    didPlan: 'Plan agregado a tus pendientes',
    didOther: 'Dijiste que sí',
    kind: { meeting: 'Reunión', followup: 'Seguimiento', notion: 'Página', other: 'Ayuda' },
    dateAdd: (d) => `${d}: agregar al calendario`,
    dateAdded: 'Agregado a tu calendario',
    dateFailed: 'No se pudo agregar al calendario. Inténtalo de nuevo.',
  },
  pt: {
    noticed: 'Juno percebeu',
    waiting: 'Juno espera sua resposta',
    waitingSub: 'Das suas gravações. Nada acontece até você dizer sim.',
    did: 'O que o Juno fez',
    didSub: 'Últimos 14 dias',
    didEmpty: 'Nada ainda. Quando você disser sim a algo, aparece aqui.',
    addCalendar: 'Adicionar à agenda',
    remindMe: 'Me lembre',
    createNotion: 'Criar a página',
    markHandled: 'Marcar como resolvido',
    dismiss: 'Dispensar',
    dismissed: 'Dispensado',
    working: 'Trabalhando…',
    heard: (q) => `“${q}”`,
    from: (t) => `De ${t}`,
    whatTime: 'Ninguém disse o horário. Que horas?',
    add: 'Adicionar',
    cancel: 'Cancelar',
    notionOff: 'O Notion ainda não está conectado.',
    connectNotion: 'Conectar o Notion',
    pageOff: 'Conecte o Notion ou o Google Docs, e o Juno cria a página lá.',
    connectGdocs: 'Conectar o Google Docs',
    chooseDest: 'Onde o Juno cria a página? Ele lembra da próxima vez.',
    gdocCreated: 'Documento criado no Google Docs',
    didGdoc: 'Google Doc criado',
    plainInstead: 'Prefiro como tarefas',
    addedGoogle: 'Adicionado ao Google Agenda',
    addedFile: 'Arquivo da agenda aberto',
    openEvent: 'Ver evento',
    appleCal: 'Calendário da Apple',
    googleCal: 'Google Agenda',
    reminderAt: (w) => `Lembrete para ${w}`,
    onTodos: (d) => (d ? `Nas suas tarefas para ${d}` : 'Adicionado às suas tarefas'),
    pageCreated: 'Página criada no Notion',
    openPage: 'Abrir página',
    planAdded: (n) => `${n} ${n === 1 ? 'passo adicionado' : 'passos adicionados'} às suas tarefas`,
    handled: 'Marcado como resolvido',
    didMeeting: 'Adicionado à sua agenda',
    didReminder: 'Lembrete criado',
    didTodo: 'Salvo como tarefa',
    didNotion: 'Página do Notion criada',
    didPlan: 'Plano adicionado às suas tarefas',
    didOther: 'Você disse sim',
    kind: { meeting: 'Reunião', followup: 'Acompanhamento', notion: 'Página', other: 'Ajuda' },
    dateAdd: (d) => `${d}: adicionar à agenda`,
    dateAdded: 'Adicionado à sua agenda',
    dateFailed: 'Não foi possível adicionar à agenda. Tente de novo.',
  },
}

const KIND_ICON: Record<SuggestionKind, IconName> = { meeting: 'calendar', followup: 'bell', notion: 'doc', other: 'sparkle' }

/** The browser's zone: on the web, the device already knows where the user is. */
function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

/* ================================================================== data */

export type Lists = { open: WebSuggestion[]; did: WebSuggestion[] }

/** `initial` (Home's server render) shows at once; a fresh copy is still fetched on mount, since
 *  coming back to Home after answering an offer elsewhere remounts this with the page-load copy. */
export function useSuggestions(sessionId?: string | null, initial?: Lists | null): Lists & { loaded: boolean; reload: () => Promise<void> } {
  const [lists, setLists] = useState<Lists>(initial ?? { open: [], did: [] })
  const [loaded, setLoaded] = useState(!!initial)
  const reload = useCallback(async () => {
    try {
      const j = await getJson<{ open: WebSuggestion[]; did?: WebSuggestion[] }>(`/api/pen/suggestions${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''}`)
      setLists({ open: j.open ?? [], did: j.did ?? [] })
    } catch {
      // Offers are extra: a failed load shows nothing rather than an error over the notes.
    } finally {
      setLoaded(true)
    }
  }, [sessionId])
  // Cleared only when the recording changes (never on a re-run of the same effect, which would
  // blank a server-rendered list until the fetch lands).
  const shownFor = useRef<string | null | undefined>(initial ? sessionId : undefined)
  useEffect(() => {
    if (shownFor.current !== sessionId) {
      setLoaded(false)
      setLists({ open: [], did: [] })
      shownFor.current = sessionId
    }
    void reload()
  }, [reload, sessionId])
  return { ...lists, loaded, reload }
}

/* ================================================================== one offer */

type Settled = { kind: 'done'; out: Extract<AcceptOutcome, { status: 'done' }> } | { kind: 'dismissed' }

function primaryLabel(k: SuggestionKind, T: typeof JN_EN): string {
  return k === 'meeting' ? T.addCalendar : k === 'followup' ? T.remindMe : k === 'notion' ? T.createNotion : T.markHandled
}

function NoticedRow({
  s,
  showSource = false,
  onOpenRecording,
  onSettled,
}: {
  s: WebSuggestion
  /** Home: say which recording it came from (a link to it). */
  showSource?: boolean
  onOpenRecording?: (id: string) => void
  onSettled: (s: WebSuggestion, how: Settled) => void
}) {
  const T = useCopy(JN)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'idle' | 'time' | 'notion' | 'dest'>('idle')
  const [googleToo, setGoogleToo] = useState(false)
  const [time, setTime] = useState('09:00')
  const [day, setDay] = useState(s.day ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Settled | null>(null)

  async function accept(extra: { time_zone?: string; start_local?: string; plain?: boolean; destination?: 'notion' | 'google_docs' } = {}): Promise<void> {
    setBusy(true)
    setErr(null)
    try {
      const r = await postJson<AcceptOutcome>('/api/pen/suggestions', { id: s.id, action: 'accept', ...extra })
      if (r.status === 'needs_zone') {
        const tz = browserZone()
        if (tz && !extra.time_zone) return await accept({ ...extra, time_zone: tz })
        setErr(T.whatTime)
        return
      }
      if (r.status === 'needs_time') { setStep('time'); return }
      if (r.status === 'connect_notion') { setGoogleToo(Boolean(r.google)); setStep('notion'); return }
      if (r.status === 'choose_dest') { setStep('dest'); return }
      if (r.status === 'error') { setErr(r.error); return }
      const how: Settled = { kind: 'done', out: r }
      setResult(how)
      setStep('idle')
      // Not connected to Google: open the calendar file, as the WhatsApp link would.
      if (r.addedTo === 'links' && r.suggestion.done?.ics) window.location.assign(r.suggestion.done.ics)
      onSettled(s, how)
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    setBusy(true)
    setErr(null)
    try {
      await postJson('/api/pen/suggestions', { id: s.id, action: 'dismiss' })
      const how: Settled = { kind: 'dismissed' }
      setResult(how)
      onSettled(s, how)
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (result) return <SettledLine s={s} how={result} />

  return (
    <div className="pen-jn-row" data-kind={s.kind}>
      <span className="pen-jn-ic" data-kind={s.kind} aria-hidden><Icon name={KIND_ICON[s.kind]} size={17} /></span>
      <div className="pen-jn-main">
        <p className="pen-jn-title">
          {s.title}
          {s.when && <span className="pen-jn-when">{s.when}</span>}
        </p>
        {s.why && <p className="pen-jn-why">{T.heard(s.why)}</p>}
        {showSource && s.sessionId && s.sessionTitle && (
          <button type="button" className="pen-jn-src" onClick={() => onOpenRecording?.(s.sessionId!)}>
            {T.from(s.sessionTitle)}
          </button>
        )}

        {step === 'time' && (
          <form
            className="pen-jn-ask"
            onSubmit={(e) => {
              e.preventDefault()
              if (day && time) void accept({ start_local: `${day}T${time}` })
            }}
          >
            <label className="pen-jn-ask-label" htmlFor={`jn-t-${s.id}`}>{T.whatTime}</label>
            <span className="pen-jn-ask-row">
              {!s.day && <input type="date" className="pen-jn-input" value={day} onChange={(e) => setDay(e.target.value)} required />}
              <input id={`jn-t-${s.id}`} type="time" className="pen-jn-input" value={time} onChange={(e) => setTime(e.target.value)} required />
              <button type="submit" className="pen-btn pen-btn-accent pen-jn-btn" disabled={busy}>{busy ? T.working : T.add}</button>
              <button type="button" className="pen-jn-quiet" onClick={() => setStep('idle')}>{T.cancel}</button>
            </span>
          </form>
        )}

        {step === 'notion' && (
          <div className="pen-jn-ask" role="status">
            <span className="pen-jn-ask-label">{googleToo ? T.pageOff : T.notionOff}</span>
            <span className="pen-jn-ask-row">
              <a className="pen-btn pen-btn-accent pen-jn-btn" href="/pen/settings/notion">{T.connectNotion}</a>
              {googleToo && <a className="pen-btn pen-jn-btn" href="/pen/settings/google">{T.connectGdocs}</a>}
              <button type="button" className="pen-btn pen-jn-btn" disabled={busy} onClick={() => void accept({ plain: true })}>{T.plainInstead}</button>
            </span>
          </div>
        )}

        {step === 'dest' && (
          <div className="pen-jn-ask" role="group" aria-label={T.chooseDest}>
            <span className="pen-jn-ask-label">{T.chooseDest}</span>
            <span className="pen-jn-ask-row">
              <button type="button" className="pen-btn pen-jn-btn" disabled={busy} onClick={() => void accept({ destination: 'notion' })}>Notion</button>
              <button type="button" className="pen-btn pen-jn-btn" disabled={busy} onClick={() => void accept({ destination: 'google_docs' })}>Google Docs</button>
              <button type="button" className="pen-jn-quiet" onClick={() => setStep('idle')}>{T.cancel}</button>
            </span>
          </div>
        )}

        {err && <p className="pen-jn-err" role="alert">{err}</p>}
      </div>

      {step === 'idle' && (
        <div className="pen-jn-acts">
          <button type="button" className="pen-btn pen-btn-accent pen-jn-btn" disabled={busy} onClick={() => void accept()}>
            {busy ? T.working : primaryLabel(s.kind, T)}
          </button>
          <button type="button" className="pen-jn-quiet" disabled={busy} onClick={() => void dismiss()}>{T.dismiss}</button>
        </div>
      )}
    </div>
  )
}

/** After the click: one line that says what happened, with the link to it. */
function SettledLine({ s, how }: { s: WebSuggestion; how: Settled }) {
  const T = useCopy(JN)
  const lang = useLang()
  if (how.kind === 'dismissed') {
    return <p className="pen-jn-settled" data-tone="quiet"><span>{T.dismissed}</span><span className="pen-jn-settled-what">{s.title}</span></p>
  }
  const o = how.out
  const d = o.suggestion.done ?? {}
  let text = T.handled
  let links: { href: string; label: string }[] = []
  if (s.kind === 'meeting') {
    if (o.addedTo === 'google') { text = T.addedGoogle; if (d.gcalLink) links = [{ href: d.gcalLink, label: T.openEvent }] }
    else { text = T.addedFile; links = [d.ics && { href: d.ics, label: T.appleCal }, d.google && { href: d.google, label: T.googleCal }].filter(Boolean) as typeof links }
  } else if (s.kind === 'followup') {
    text = o.reminderAt ? T.reminderAt(o.reminderAt) : T.onTodos(o.dueDate ? shortDate(`${o.dueDate}T12:00:00Z`, lang, 'UTC') : null)
  } else if (s.kind === 'notion') {
    if (o.notionUrl) { text = o.docDest === 'google_docs' ? T.gdocCreated : T.pageCreated; links = [{ href: o.notionUrl, label: T.openPage }] }
    else text = T.planAdded(o.plan?.length ?? 0)
  }
  return (
    <p className="pen-jn-settled" role="status">
      <Icon name="check" size={15} />
      <span>{text}</span>
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="pen-jn-link">{l.label}</a>
      ))}
    </p>
  )
}

/* ================================================================== on a recording */

export function JunoNoticed({ sessionId }: { sessionId: string }) {
  const T = useCopy(JN)
  const { open, loaded } = useSuggestions(sessionId)
  if (!loaded || !open.length) return null
  // Fades in with CSS (pen-jn-in) from a visible default: if the animation never runs, it shows.
  return (
    <section className="pen-jn" aria-labelledby={`pen-jn-${sessionId}`}>
      <h3 id={`pen-jn-${sessionId}`} className="pen-jn-head">
        <Icon name="sparkle" size={16} filled />
        {T.noticed}
      </h3>
      <div className="pen-jn-list">
        {open.map((s) => <NoticedRow key={s.id} s={s} onSettled={() => {}} />)}
      </div>
    </section>
  )
}

/* ================================================================== on Home */

function didLine(s: WebSuggestion, T: typeof JN_EN): string {
  const d = s.done ?? {}
  if (s.kind === 'meeting') return T.didMeeting
  if (s.kind === 'followup') return d.remindAt ? T.didReminder : T.didTodo
  if (s.kind === 'notion') return d.notionUrl ? (d.docDest === 'google_docs' ? T.didGdoc : T.didNotion) : T.didPlan
  return T.didOther
}

function didLink(s: WebSuggestion): string | null {
  const d = s.done ?? {}
  return d.gcalLink ?? d.notionUrl ?? d.google ?? null
}

export function WaitingOnYou({ onOpenRecording, initial = null }: { onOpenRecording: (id: string) => void; initial?: Lists | null }) {
  const T = useCopy(JN)
  const lang = useLang()
  const { open, did, loaded } = useSuggestions(null, initial)
  // Answered here: kept in place (showing what happened) until the next load, then it moves to
  // "What Juno did" or goes away.
  const [settled, setSettled] = useState<string[]>([])
  if (!loaded || (!open.length && !did.length)) return null
  const waiting = open.length - settled.length
  return (
    <section className="pen-wait" aria-labelledby="pen-wait-title">
      <div className="pen-wait-col">
        <header className="pen-wait-head">
          <h3 id="pen-wait-title" className="pen-wait-title">
            <Icon name="sparkle" size={17} filled />
            {T.waiting}
            {waiting > 0 && <span className="pen-wait-n">{waiting}</span>}
          </h3>
          <p className="pen-wait-sub">{T.waitingSub}</p>
        </header>
        {open.length ? (
          <div className="pen-jn-list">
            <AnimatePresence initial={false}>
              {open.map((s) => (
                <motion.div key={s.id} layout="position" transition={{ duration: 0.22, ease: EASE_OUT }}>
                  <NoticedRow s={s} showSource onOpenRecording={onOpenRecording} onSettled={(x) => setSettled((xs) => [...xs, x.id])} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <p className="pen-card-empty">{T.didEmpty}</p>
        )}
      </div>
      {did.length > 0 && (
        <div className="pen-wait-col pen-wait-did">
          <header className="pen-wait-head">
            <h4 className="pen-today-sub">{T.did} · {T.didSub}</h4>
          </header>
          <ul className="pen-did-list">
            {did.map((s) => {
              const href = didLink(s)
              return (
                <li key={s.id} className="pen-did">
                  <span className="pen-did-ic" aria-hidden><Icon name="check" size={13} /></span>
                  <span className="pen-did-main">
                    <span className="pen-did-what">{didLine(s, T)}</span>
                    <span className="pen-did-title">
                      {href ? <a href={href} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
                    </span>
                  </span>
                  {s.decidedAt && <span className="pen-did-when">{fmtDate(s.decidedAt, lang, { month: 'short', day: 'numeric' })}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

/* ================================================================== dated to-dos */

/**
 * A dated to-do's date chip, which is also its "add to calendar": Google Calendar when it is
 * connected, the .ics file otherwise. Only rendered for to-dos with a real date.
 */
export function DateChip({ sessionId, index, label, late = false, className = '' }: { sessionId: string; index: number; label: string; late?: boolean; className?: string }) {
  const T = useCopy(JN)
  const [state, setState] = useState<'idle' | 'busy' | 'added' | 'failed'>('idle')
  const [link, setLink] = useState<string | null>(null)
  async function add() {
    if (state === 'busy') return
    if (state === 'added' && link) { window.open(link, '_blank', 'noopener'); return }
    setState('busy')
    try {
      const r = await postJson<{ added: 'google' | 'links'; link?: string | null; ics?: string; google?: string }>('/api/pen/todo-calendar', { sessionId, index, tz: browserZone() })
      if (r.added === 'google') { setLink(r.link ?? null); setState('added') }
      else { setLink(r.google ?? null); setState('added'); if (r.ics) window.location.assign(r.ics) }
    } catch {
      setState('failed')
    }
  }
  const title = state === 'added' ? T.dateAdded : state === 'failed' ? T.dateFailed : T.dateAdd(label)
  return (
    <button type="button" className={`pen-datechip ${className}`} data-late={late} data-state={state} onClick={() => void add()} title={title} aria-label={title}>
      <Icon name={state === 'added' ? 'check' : 'calendar'} size={13} />
      {label}
    </button>
  )
}
