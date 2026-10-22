'use client'

// One recording, two meetings → split (22 Oct). The recording page's pieces:
//
//   SplitCard      "This looks like two conversations: 10:00–10:38 with Ana · 10:45–11:20 with
//                  Robert. Split into two?" The suggestion from lib/pen/split-server.ts detectSplit;
//                  nothing is cut until Split is pressed, and "No, it's one" is for good.
//   SplitDone      after a split: "Split into 2 recordings ✓", a link to each part, Join back.
//   SplitHere      the quiet per-line action in the transcript, and its confirm under the line,
//                  with the two time ranges, before anything changes.
//   JoinBackLine   on a part of a split recording: where it came from, and Join back.
//
// All of it goes through /api/pen/split. Times are clock times where the browser is when the
// recording's start is known, else minutes into it.

import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useCopy, useLang } from './LangContext'
import { getJson, postJson, errMessage } from '@/lib/pen/http'
import { LOCALE, type Copy } from '@/lib/pen/i18n'
import type { Lang } from '@/lib/pen/currency'
import type { SplitHint, SplitPart } from '@/lib/pen/split'

export type SplitResult = { parts: { id: string; from_sec: number; to_sec: number; title: string | null }[] }

type C = {
  looksLike: (n: number) => string
  split: (n: number) => string
  splitShort: string
  no: string
  with: (names: string) => string
  why: string
  splitting: string
  done: (n: number) => string
  doneSub: string
  part: (i: number) => string
  open: string
  joinBack: string
  joining: string
  splitHere: string
  splitHereTitle: string
  confirmHead: string
  confirmBody: string
  cancel: string
  fromSplit: (i: number, n: number) => string
  failed: string
}

const SPLIT_COPY: Copy<C> = {
  en: {
    looksLike: (n) => (n === 2 ? 'This looks like two conversations' : `This looks like ${n} conversations`),
    split: (n) => (n === 2 ? 'Split into two' : `Split into ${n}`),
    splitShort: 'Split',
    no: 'No, it’s one',
    with: (x) => `with ${x}`,
    why: 'Each part becomes its own recording, with its own notes, to-dos and people. The notes are written again for each part.',
    splitting: 'Splitting…',
    done: (n) => `Split into ${n} recordings`,
    doneSub: 'Each part’s notes are being written. It takes a minute.',
    part: (i) => `Part ${i}`,
    open: 'Open',
    joinBack: 'Join back',
    joining: 'Joining…',
    splitHere: 'Split here',
    splitHereTitle: 'Split the recording here, into two',
    confirmHead: 'Split into two recordings here?',
    confirmBody: 'Each part gets its own notes, to-dos and people. The notes are written again for each part.',
    cancel: 'Cancel',
    fromSplit: (i, n) => `Part ${i} of ${n} of a recording you split.`,
    failed: 'That didn’t work. Nothing was changed; try again.',
  },
  es: {
    looksLike: (n) => (n === 2 ? 'Parecen dos conversaciones' : `Parecen ${n} conversaciones`),
    split: (n) => (n === 2 ? 'Dividir en dos' : `Dividir en ${n}`),
    splitShort: 'Dividir',
    no: 'No, es una',
    with: (x) => `con ${x}`,
    why: 'Cada parte pasa a ser su propia grabación, con sus notas, pendientes y personas. Las notas se escriben de nuevo para cada parte.',
    splitting: 'Dividiendo…',
    done: (n) => `Dividida en ${n} grabaciones`,
    doneSub: 'Se están escribiendo las notas de cada parte. Tarda un minuto.',
    part: (i) => `Parte ${i}`,
    open: 'Abrir',
    joinBack: 'Volver a unir',
    joining: 'Uniendo…',
    splitHere: 'Dividir aquí',
    splitHereTitle: 'Dividir la grabación aquí, en dos',
    confirmHead: '¿Dividir aquí en dos grabaciones?',
    confirmBody: 'Cada parte tiene sus propias notas, pendientes y personas. Las notas se escriben de nuevo para cada parte.',
    cancel: 'Cancelar',
    fromSplit: (i, n) => `Parte ${i} de ${n} de una grabación que dividiste.`,
    failed: 'No funcionó. No se cambió nada; inténtalo de nuevo.',
  },
  pt: {
    looksLike: (n) => (n === 2 ? 'Parecem duas conversas' : `Parecem ${n} conversas`),
    split: (n) => (n === 2 ? 'Dividir em duas' : `Dividir em ${n}`),
    splitShort: 'Dividir',
    no: 'Não, é uma só',
    with: (x) => `com ${x}`,
    why: 'Cada parte vira uma gravação própria, com suas notas, tarefas e pessoas. As notas são escritas de novo para cada parte.',
    splitting: 'Dividindo…',
    done: (n) => `Dividida em ${n} gravações`,
    doneSub: 'As notas de cada parte estão sendo escritas. Leva um minuto.',
    part: (i) => `Parte ${i}`,
    open: 'Abrir',
    joinBack: 'Juntar de novo',
    joining: 'Juntando…',
    splitHere: 'Dividir aqui',
    splitHereTitle: 'Dividir a gravação aqui, em duas',
    confirmHead: 'Dividir aqui em duas gravações?',
    confirmBody: 'Cada parte tem suas próprias notas, tarefas e pessoas. As notas são escritas de novo para cada parte.',
    cancel: 'Cancelar',
    fromSplit: (i, n) => `Parte ${i} de ${n} de uma gravação que você dividiu.`,
    failed: 'Não funcionou. Nada foi alterado; tente de novo.',
  },
}

/** "10:00–10:38" (clock, when the start is known) or "0:00–38:12" (into the recording). */
export function rangeText(fromSec: number, toSec: number, startIso: string | null, lang: Lang): string {
  const start = startIso ? Date.parse(startIso) : NaN
  if (Number.isFinite(start)) {
    const f = (s: number) => new Date(start + s * 1000).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' })
    return `${f(fromSec)}–${f(toSec)}`
  }
  const m = (s: number) => {
    const t = Math.max(0, Math.round(s)), h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60
    return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`
  }
  return `${m(fromSec)}–${m(toSec)}`
}

const partLabel = (p: SplitPart, T: C) => p.title || (p.people.length ? T.with(p.people.join(', ')) : null)

/* ------------------------------------------------------------------ the suggestion */

export function SplitCard({ sessionId, startIso, onSplit }: { sessionId: string; startIso: string | null; onSplit: (r: SplitResult) => void }) {
  const T = useCopy(SPLIT_COPY)
  const lang = useLang()
  const [s, setS] = useState<{ id: string; hint: SplitHint } | null>(null)
  const [busy, setBusy] = useState<'split' | 'no' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setS(null)
    getJson<{ suggestion: { id: string; hint: SplitHint } | null }>(`/api/pen/split?session=${sessionId}`)
      .then((j) => { if (live) setS(j.suggestion) })
      .catch(() => {})
    return () => { live = false }
  }, [sessionId])

  if (!s) return null
  const n = s.hint.parts.length
  const go = async (action: 'accept' | 'dismiss') => {
    setBusy(action === 'accept' ? 'split' : 'no')
    setErr(null)
    try {
      if (action === 'dismiss') {
        await postJson('/api/pen/split', { action: 'dismiss', id: s.id })
        setS(null)
        return
      }
      const r = await postJson<SplitResult>('/api/pen/split', { action: 'accept', id: s.id, session: sessionId })
      setS(null)
      onSplit(r)
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="pen-split" aria-labelledby={`pen-split-h-${sessionId}`}>
      <h3 className="pen-split-h" id={`pen-split-h-${sessionId}`}>
        <Icon name="scissors" size={17} />
        {T.looksLike(n)}
      </h3>
      <ol className="pen-split-parts">
        {s.hint.parts.map((p, i) => (
          <li key={i}>
            <span className="pen-split-time">{rangeText(p.from_sec, p.to_sec, s.hint.recorded_at ?? startIso, lang)}</span>
            {partLabel(p, T) && <span className="pen-split-who">{partLabel(p, T)}</span>}
          </li>
        ))}
      </ol>
      <p className="pen-split-why">{T.why}</p>
      {err && <p className="pen-split-err" role="alert">{err}</p>}
      <div className="pen-split-acts">
        <button type="button" className="pen-btn pen-btn-accent" disabled={!!busy} onClick={() => void go('accept')}>
          <Icon name="scissors" size={15} />
          {busy === 'split' ? T.splitting : T.split(n)}
        </button>
        <button type="button" className="pen-btn" disabled={!!busy} onClick={() => void go('dismiss')}>{T.no}</button>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ after a split */

export function SplitDone({ result, titles, startIso, onOpen, onJoinBack, joining }: {
  result: SplitResult
  /** Each part's current title, once the notes have named it. */
  titles: (string | null)[]
  startIso: string | null
  onOpen: (id: string) => void
  onJoinBack: () => void
  joining: boolean
}) {
  const T = useCopy(SPLIT_COPY)
  const lang = useLang()
  return (
    <div className="pen-split pen-split-done" role="status">
      <p className="pen-split-h">
        <Icon name="check" size={17} />
        {T.done(result.parts.length)}
      </p>
      <ol className="pen-split-parts">
        {result.parts.map((p, i) => (
          <li key={p.id}>
            <span className="pen-split-time">{rangeText(p.from_sec, p.to_sec, startIso, lang)}</span>
            <span className="pen-split-who">{titles[i] || p.title || T.part(i + 1)}</span>
            <button type="button" className="pen-split-open" onClick={() => onOpen(p.id)}>
              {T.open}<Icon name="chevron" size={14} />
            </button>
          </li>
        ))}
      </ol>
      <p className="pen-split-why">
        {T.doneSub}{' '}
        <button type="button" className="pen-split-undo" disabled={joining} onClick={onJoinBack}>{joining ? T.joining : T.joinBack}</button>
      </p>
    </div>
  )
}

/** On a part of a split recording (not joined back): where it came from, and Join back. */
export function JoinBackLine({ part, parts, busy, onJoinBack }: { part: number; parts: number; busy: boolean; onJoinBack: () => void }) {
  const T = useCopy(SPLIT_COPY)
  return (
    <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
      {T.fromSplit(part, parts)}{' '}
      <button type="button" className="underline" disabled={busy} onClick={onJoinBack} style={{ color: 'var(--soft)' }}>
        {busy ? T.joining : T.joinBack}
      </button>
    </p>
  )
}

/* ------------------------------------------------------------------ "Split here" */

/** The quiet per-line action: shown on hover or focus on a desktop, always on a phone. */
export function SplitHereButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  const T = useCopy(SPLIT_COPY)
  return (
    <button type="button" className="pen-utt-split" aria-expanded={open} aria-label={T.splitHereTitle} title={T.splitHereTitle} onClick={onClick}>
      <Icon name="scissors" size={15} />
      <span>{T.splitHere}</span>
    </button>
  )
}

/** The confirm under the line: both time ranges, then Split here / Cancel. */
export function SplitHereConfirm({ ranges, busy, error, onYes, onNo }: { ranges: [string, string]; busy: boolean; error: string | null; onYes: () => void; onNo: () => void }) {
  const T = useCopy(SPLIT_COPY)
  const yes = useRef<HTMLButtonElement>(null)
  useEffect(() => { yes.current?.focus() }, [])
  return (
    <div className="pen-split pen-split-here" role="group" aria-label={T.confirmHead} onKeyDown={(e) => { if (e.key === 'Escape') onNo() }}>
      <p className="pen-split-h">
        <Icon name="scissors" size={17} />
        {T.confirmHead}
      </p>
      <ol className="pen-split-parts">
        {ranges.map((r, i) => (
          <li key={i}>
            <span className="pen-split-who">{T.part(i + 1)}</span>
            <span className="pen-split-time">{r}</span>
          </li>
        ))}
      </ol>
      <p className="pen-split-why">{T.confirmBody}</p>
      {error && <p className="pen-split-err" role="alert">{error}</p>}
      <div className="pen-split-acts">
        <button ref={yes} type="button" className="pen-btn pen-btn-accent" disabled={busy} onClick={onYes}>
          <Icon name="scissors" size={15} />
          {busy ? T.splitting : T.splitHere}
        </button>
        <button type="button" className="pen-btn" disabled={busy} onClick={onNo}>{T.cancel}</button>
      </div>
    </div>
  )
}
