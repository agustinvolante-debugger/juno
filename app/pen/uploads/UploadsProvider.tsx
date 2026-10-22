'use client'

// The upload queue, above the pages (22 Oct, founder: "keep the pop-up at the bottom always
// appearing even if the user goes to another recording or another page, and remind them not to
// disconnect the pen").
//
// It used to live inside PenApp, so opening Settings (its own Next route) unmounted it and every
// file still going up was lost. Now it lives in app/pen/layout.tsx, which every /pen page shares:
// the File objects, the lanes, the stall check and the card stay put across client-side
// navigation. PenApp hands files over with enqueue() and listens for what happened (a recording
// saved, sent for transcription, held for hours, a batch finished) to update its own list. When
// PenApp isn't on screen, the events that matter later wait in `missed` and reach it when it is.
//
// The pipeline below (uploadOne, sendOff, runUploads, retry) is the one PenApp ran, moved as is.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Icon from '../Icon'
import GetWhatsApp from '../GetWhatsApp'
import { LangProvider } from '../LangContext'
import { APP_COPY, type AppCopy } from '../PenApp.copy'
import type { Picked } from '../PeoplePicker'
import { PenSpaceHelp } from '../pen/PenDevice'
import { penStartOf, loadPick, permissionOf, listRecordings } from '../pen/pen-drive'
import type { PenSession } from '@/lib/pen/store'
import type { Allowance } from '@/lib/pen/allowance'
import type { Lang } from '@/lib/pen/i18n'
import { PEN_NAME_RE } from '@/lib/pen/pen-device'
import { prepareAudio, fmtMB, SOFT_SIZE_LIMIT, needsPiecedUpload, durationWithoutDecoding, pieceSizeFor, type Prepared } from '@/lib/pen/encode'
import { canStreamPrep, streamPrepare, PrepFailed, type PrepFallback, type StreamExtra } from '@/lib/pen/stream-prep-client'
import { postJsonRetry, UploadError, classifyUploadError, canRetry, isStalled, Lanes, runLanes, uploadReason, stillReadable, UPLOAD_RETRY_COPY, type UploadFailure } from '@/lib/pen/upload-retry'

/* ------------------------------------------------------------------- types */

export type UploadItem = {
  key: string; name: string; phase: string; pct: number; short?: string; state: 'waiting' | 'working' | 'done' | 'held' | 'error'; error?: string; sessionId?: string; tagged?: boolean
  /** Why it failed, in a word the tray says in plain language (lib/pen/upload-retry.ts). */
  kind?: UploadFailure
  /** 'prep' while the audio is prepared or waits its turn for that; 'upload' for the rest, the part that can stall. */
  stage?: 'prep' | 'upload'
  /** Last time anything moved, for the 90-second stall check. */
  movedAt?: number
  /** Came off the pen: the card asks to keep it plugged in, and an unreadable file means it came out. */
  fromPen?: boolean
}
type UploadJob = { key: string; file: File; people: Picked[]; event: boolean; fromPen: boolean }

/** One file to upload: who was on it, and whether it is being read off the pen right now. */
export type EnqueueFile = { file: File; people: Picked[]; fromPen?: boolean }
export type EnqueueOpts = {
  event?: boolean
  lang: Lang
  whatsapp: { number: string; linked: boolean } | null
  /** A browser that can't write to the pen (Safari, phones, Firefox): see UploadCard. */
  byHand: boolean
}

/**
 * What happened, for PenApp. `replay`: it happened while PenApp wasn't on screen and is handed
 * over now; the list it loaded since is newer than anything in the event, so only act on the
 * parts that are still news (the ready toast, a refresh).
 */
export type UploadEvent =
  | { type: 'saved'; session: PenSession; replay?: boolean }
  | { type: 'sent'; id: string; replay?: boolean }
  | { type: 'held'; id: string; allowance?: Allowance; replay?: boolean }
  | { type: 'batch'; files: File[]; replay?: boolean }
  | { type: 'who'; ids: string[]; replay?: boolean }

type UploadsApi = {
  items: UploadItem[]
  uploading: boolean
  enqueue: (files: EnqueueFile[], opts: EnqueueOpts) => void
  retry: (keys: string[]) => void
  /** Listen for what happened; returns the way to stop. Missed events arrive right after. */
  subscribe: (fn: (e: UploadEvent) => void) => () => void
}

const Ctx = createContext<UploadsApi | null>(null)

/** The upload queue. Outside the provider (never, under /pen) it does nothing. */
export function useUploads(): UploadsApi {
  return useContext(Ctx) ?? NOOP
}
const NOOP: UploadsApi = { items: [], uploading: false, enqueue: () => {}, retry: () => {}, subscribe: () => () => {} }

/* ---------------------------------------------------------------- strings */

// New with the move (22 Oct). The rest of the card's words are PenApp's (APP_COPY).
const COPY = {
  en: {
    pen: 'Keep your pen plugged in until this finishes.',
    pill: (done: number, total: number) => `Uploading ${done} of ${total}`,
    pillDone: (n: number) => (n === 1 ? 'Uploaded' : `All ${n} uploaded`),
    allDone: (n: number) => (n === 1 ? 'Recording uploaded' : `All ${n} recordings uploaded`),
    smaller: 'Make smaller',
    bigger: 'Show the upload',
    keepOpen: 'Keep using Juno as normal, even other pages. Leave this tab open until it finishes.',
  },
  es: {
    pen: 'Deja tu lápiz conectado hasta que termine.',
    pill: (done: number, total: number) => `Subiendo ${done} de ${total}`,
    pillDone: (n: number) => (n === 1 ? 'Subida' : `Las ${n} subidas`),
    allDone: (n: number) => (n === 1 ? 'Grabación subida' : `Las ${n} grabaciones se subieron`),
    smaller: 'Achicar',
    bigger: 'Ver la subida',
    keepOpen: 'Sigue usando Juno con normalidad, también otras páginas. Deja esta pestaña abierta hasta que termine.',
  },
  pt: {
    pen: 'Deixe sua caneta conectada até terminar.',
    pill: (done: number, total: number) => `Enviando ${done} de ${total}`,
    pillDone: (n: number) => (n === 1 ? 'Enviada' : `As ${n} enviadas`),
    allDone: (n: number) => (n === 1 ? 'Gravação enviada' : `As ${n} gravações foram enviadas`),
    smaller: 'Minimizar',
    bigger: 'Ver o envio',
    keepOpen: 'Continue usando o Juno normalmente, até outras páginas. Deixe esta aba aberta até terminar.',
  },
} satisfies Record<Lang, unknown>

/* --------------------------------------------------------------- provider */

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return phone
}

/** Home's address: "/" on tryjunoapp.com (where /pen redirects there), else /pen. */
function homePath(): string {
  const h = window.location.hostname
  return h === 'tryjunoapp.com' || h === 'www.tryjunoapp.com' ? '/' : '/pen'
}

export default function UploadsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const isPhone = useIsPhone()
  const phoneNow = useRef(isPhone)
  phoneNow.current = isPhone
  // The card's surroundings, from the latest enqueue: its language, WhatsApp, the browser kind.
  const [card, setCard] = useState<Omit<EnqueueOpts, 'event'>>({ lang: 'en', whatsapp: null, byHand: false })
  const langNow = useRef<Lang>('en')
  langNow.current = card.lang

  /* ------------------------------------------------------------ events */

  const listeners = useRef(new Set<(e: UploadEvent) => void>())
  const missed = useRef<UploadEvent[]>([])
  const emit = useCallback((e: UploadEvent) => {
    if (listeners.current.size) {
      for (const l of listeners.current) l(e)
      return
    }
    // Nobody's list to put a fresh recording in: the next list loaded from the server has it.
    if (e.type === 'saved') return
    missed.current.push({ ...e, replay: true })
  }, [])
  const subscribe = useCallback((fn: (e: UploadEvent) => void) => {
    listeners.current.add(fn)
    const queued = missed.current.splice(0)
    if (queued.length) {
      // After the subscriber's own mount has finished. Gone again by then: back in the queue.
      // (React's dev double-mount swaps the listener in between: hand them to whoever listens now.)
      window.setTimeout(() => {
        const to = listeners.current.has(fn) ? [fn] : [...listeners.current]
        if (!to.length) return void missed.current.unshift(...queued)
        for (const e of queued) for (const l of to) l(e)
      }, 0)
    }
    return () => { listeners.current.delete(fn) }
  }, [])

  /* ------------------------------------------------------------- state */

  // Uploads run in the background (Carlitos, 5 Oct: ten recordings one by one behind a window
  // that blocks the app is too slow). Import closes the sheet at once; a small card counts the
  // files up while the rest of the app stays usable; three go at a time (one on a phone, where
  // decoding a long recording already uses most of the memory). Transcription, notes and the
  // briefing email were always server-side, so once a file is up nothing waits on this tab.
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const uploading = uploads.some((u) => u.state === 'waiting' || u.state === 'working')
  const patchUpload = useCallback((key: string, patch: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }, [])
  // What each row needs to be retried (its file, people, event flag), the recording it already
  // saved if it got that far, and the handle the stall check stops it with.
  const uploadJobs = useRef(new Map<string, UploadJob>())
  const savedIds = useRef(new Map<string, string>())
  const uploadAborts = useRef(new Map<string, AbortController>())
  const uploadsNow = useRef(uploads)
  uploadsNow.current = uploads
  // Rows closed from the card let go of their files.
  useEffect(() => {
    const keep = new Set(uploads.map((u) => u.key))
    for (const k of [...uploadJobs.current.keys()]) if (!keep.has(k)) { uploadJobs.current.delete(k); savedIds.current.delete(k) }
  }, [uploads])
  // No progress for 90 s while uploading (not while preparing or waiting a turn): stop it, so the
  // row shows a reason and a Retry instead of sitting at 5% (22 Oct).
  useEffect(() => {
    if (!uploading) return
    const t = window.setInterval(() => {
      const now = Date.now()
      for (const u of uploadsNow.current) if (isStalled(u, now)) uploadAborts.current.get(u.key)?.abort()
    }, 5000)
    return () => window.clearInterval(t)
  }, [uploading])
  // Closing the tab mid-upload loses the files that haven't gone up: ask first. Moving between
  // Juno's own pages is a client-side change and keeps them, so it asks nothing.
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  // Localhost only: ?penmock=nofs&upcard=going|done shows the upload card as Safari sees it,
  // without uploading anything (for reviewing its wording, like ?ready=1). &uplang=es|pt for the
  // other languages.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const q = new URLSearchParams(window.location.search)
    const v = q.get('upcard')
    if (v !== 'going' && v !== 'done' && v !== 'unplugged') return
    const l = q.get('uplang')
    if (l === 'es' || l === 'pt') setCard((c) => ({ ...c, lang: l }))
    const names = ['R20261021-091202.WAV', 'R20261021-140202.WAV', 'R20261021-163015.WAV']
    setUploads(names.map((name, i) => ({
      key: name, name, phase: '', pct: v === 'done' ? 100 : 40, fromPen: true,
      state: v === 'done' || i === 0 ? 'done' as const : v === 'unplugged' && i === 2 ? 'error' as const : 'working' as const,
      kind: v === 'unplugged' && i === 2 ? 'unplugged' as const : undefined,
    })))
  }, [])

  /* ---------------------------------------------------------- pipeline */

  // Preparing audio is the memory-heavy step, so files take turns at it; uploads still overlap
  // (three at a time on a computer). A long recording no longer shares the tab with another.
  const prepQueue = useRef<Promise<unknown>>(Promise.resolve())
  function onePrepAtATime<R>(fn: () => Promise<R>): Promise<R> {
    const run = prepQueue.current.then(fn, fn)
    prepQueue.current = run.catch(() => {})
    return run
  }

  /** One file: prepare, upload, save, send for transcription. 'held' = saved, waiting for hours. */
  async function uploadOne(file: File, people: Picked[], step: (p: { phase: string; pct: number; short?: string; stage?: 'prep' | 'upload' }) => void, event = false, signal?: AbortSignal, onSaved?: (id: string) => void): Promise<{ state: 'done' | 'held'; id: string }> {
    const T = APP_COPY[langNow.current]
    const isPhone = phoneNow.current
    const callPeople = people
    // The two small calls (signed URL, save) try again on a busy or dropped answer (22 Oct: a
    // 14-file batch lost 4 files to one failed call each). Stopped by the stall check (signal).
    const RC = UPLOAD_RETRY_COPY[langNow.current]
    const post = <R,>(url: string, body: unknown, fallback: string, at: { phase: string; pct: number }) =>
      postJsonRetry<R>((u, init) => fetch(u, { ...init, signal }), url, body, fallback, {
        onRetry: () => step({ phase: `${at.phase} · ${RC.retrying}`, pct: at.pct }),
      })
    // What goes up, and where it lands. Normally the audio is prepared (compressed) in the
    // browser first. A file too big to prepare safely on this device (a long recording on a
    // phone) goes up exactly as it is, in pieces, and the server joins them for AssemblyAI.
    let up: { storage_path: string; mime: string; bytes: number; durationSec: number }

    // The original, as it is, in pieces; the server joins them for AssemblyAI. Phones without an
    // Opus encoder take this path for long files, and so does any file whose prep failed.
    const asIs = async () => {
      step({ phase: T.phaseSlot, pct: 5 })
      const durationSec = await durationWithoutDecoding(file)
      const pieceBytes = pieceSizeFor(file.size)
      const n = Math.ceil(file.size / pieceBytes)
      const { storage_path, parts } = await post<{ storage_path: string; parts: { path: string; signedUrl: string }[] }>(
        '/api/pen/upload-url', { name: file.name, parts: n }, T.uploadUrlFailed, { phase: T.phaseSlot, pct: 5 })
      const mime = file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'application/octet-stream')
      // Several pieces at once (one connection rarely fills an uplink); each lands at its own
      // path, and the server stitches them by index, so the order they finish in doesn't matter.
      const loaded = new Array<number>(parts.length).fill(0)
      let finished = 0
      const report = () => {
        const sent = loaded.reduce((a, b) => a + b, 0)
        step({ phase: T.phasePiece(Math.min(parts.length, finished + 1), parts.length, fmtMB(file.size)), pct: 5 + (sent / file.size) * 70 })
      }
      await pool(parts.map((_, i) => i), isPhone ? 2 : PIECE_CONCURRENCY, async (i) => {
        const piece = file.slice(i * pieceBytes, (i + 1) * pieceBytes)
        const put = () => putWithProgress(parts[i].signedUrl, piece, 'application/octet-stream', (pct) => {
          loaded[i] = (pct / 100) * piece.size
          report()
        }, signal)
        // Two retries per piece: a phone on the move drops a request now and then.
        await put().catch(() => { loaded[i] = 0; return put() }).catch(() => { loaded[i] = 0; return put() })
        loaded[i] = piece.size
        finished++
        report()
      })
      return { storage_path, mime, bytes: file.size, durationSec }
    }

    // Prepared (compressed) audio, one signed URL.
    const upPrepared = async (prep: Prepared, from = 15) => {
      step({ phase: T.phaseSlot, pct: from })
      const { path, signedUrl } = await post<{ path: string; signedUrl: string }>(
        '/api/pen/upload-url', { name: file.name.replace(/\.[^.]+$/, prep.mime === 'audio/wav' ? '.wav' : '') }, T.uploadUrlFailed, { phase: T.phaseSlot, pct: from })

      // Anything compressible has already been compressed by now, so reaching this means
      // either a genuinely enormous recording or a browser with no Opus encoder. Say which,
      // because "split the recording" is useless advice for the second one.
      if (prep.blob.size > SOFT_SIZE_LIMIT) {
        throw new UploadError(
          'too-big',
          prep.mime === 'audio/ogg' ? T.tooBigCompressed(fmtMB(prep.blob.size)) : T.tooBigNoCompress(fmtMB(prep.blob.size)),
        )
      }

      await putWithProgress(signedUrl, prep.blob, prep.mime, (pct) =>
        step({ phase: T.phaseUploading(prep.note), pct: from + (pct / 100) * (75 - from) }),
      signal)
      return { storage_path: path, mime: prep.mime, bytes: prep.blob.size, durationSec: prep.durationSec }
    }

    if (canStreamPrep(file)) {
      // A long WAV (22 Oct: Chris's hour-long pen files sat at "5%" forever). Prepared in a
      // worker a slice at a time with a moving percent, one file at a time. If the worker fails
      // or stops moving for 20 s, the page prepares it itself from the start; only if that fails
      // too does the original go up as it is (in parallel pieces). Fallbacks are logged.
      // Prep is the long part here (~20-30 s an hour), so it gets most of the bar: 2 → 45%.
      step({ phase: T.phasePrepQueue, pct: 2, short: T.upPrepQueue, stage: 'prep' })
      let prep: (Prepared & { extra?: StreamExtra }) | null = null
      try {
        prep = await onePrepAtATime(() => {
          step({ phase: T.phasePreparingPct(0), pct: 2, short: T.upPreparing(0), stage: 'prep' })
          return streamPrepare(file, (f) => {
            const p = Math.floor(f * 100)
            step({ phase: T.phasePreparingPct(p), pct: 2 + f * 43, short: T.upPreparing(p), stage: 'prep' })
          })
        })
      } catch (e) {
        // The pen came out: nothing to send as it is either, so say so now (22 Oct).
        if (!(await stillReadable(file))) throw new UploadError('unplugged', 'file unreadable')
        console.warn('[pen] streaming prep failed, uploading as-is:', (e as Error).message)
        logPrep(file, 'as-is', e instanceof PrepFailed ? e.trail : [{ path: 'worker', stage: 'prep', pct: 0, error: (e as Error).message }])
      }
      // The worker failed part-way but the page's own prep finished: worth knowing too.
      if (prep?.extra?.fallbacks.some((f) => f.stage === 'prep')) logPrep(file, prep.extra.path, prep.extra.fallbacks)
      up = prep ? await upPrepared(prep, 45) : await asIs()
    } else if (needsPiecedUpload(file)) {
      up = await asIs()
    } else {
      step({ phase: T.phasePrepQueue, pct: 2, short: T.upPrepQueue, stage: 'prep' })
      const prep = await onePrepAtATime(() => {
        step({ phase: T.phasePreparing, pct: 5, stage: 'prep' })
        return prepareAudio(file)
      })
      up = await upPrepared(prep)
    }

    step({ phase: T.phaseSaving, pct: 80 })
    // The audio is up; a busy answer here is retried rather than losing the recording.
    const { session, duplicate } = await post<{ session: PenSession; duplicate: boolean }>('/api/pen/sessions', {
      storage_path: up.storage_path,
      source_name: file.name,
      mime: up.mime,
      bytes: up.bytes,
      duration_sec: up.durationSec,
      // The pen names each file after the moment it STARTED recording (its mtime is the start
      // too): R20261021-145802.WAV. Read the name when it parses, else the file's date.
      recorded_at: penStartOf(file).toISOString(),
      consent: true,
      // The first person also names the call, which older parts of the app read.
      client_name: callPeople[0]?.name || undefined,
      ...(callPeople.length ? { people: callPeople.map((p) => (p.id ? { id: p.id } : { name: p.name })) } : {}),
      ...(event ? { event_mode: true } : {}),
    }, T.saveRecordingFailed, { phase: T.phaseSaving, pct: 80 })

    // Not opened: the user is busy elsewhere in the app while these upload.
    emit({ type: 'saved', session })

    onSaved?.(session.id)

    // A Retry after the save went through finds the same recording (duplicate): it still goes for
    // transcription if it never got there.
    if (!duplicate || session.status === 'uploaded' || (session.status === 'error' && !session.aai_id)) {
      return { state: await sendOff(session.id, step, signal), id: session.id }
    }
    return { state: 'done', id: session.id }
  }

  /**
   * Sends a saved recording for transcription. Retries a busy or dropped answer; 402 = saved and
   * waiting for hours. Also what a row's Retry runs when the save already went through, so the
   * audio isn't uploaded twice.
   */
  async function sendOff(id: string, step: (p: { phase: string; pct: number }) => void, signal?: AbortSignal): Promise<'done' | 'held'> {
    const T = APP_COPY[langNow.current]
    const RC = UPLOAD_RETRY_COPY[langNow.current]
    step({ phase: T.phaseSending, pct: 92 })
    let tRes: Response
    for (let attempt = 1; ; attempt++) {
      tRes = await fetch('/api/pen/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        signal,
      }).catch(() => {
        if (signal?.aborted) throw new UploadError('stalled', 'stalled')
        return new Response(null, { status: 599 })
      })
      if (tRes.ok || tRes.status === 402 || ![502, 503, 504, 599].includes(tRes.status) || attempt >= 3) break
      step({ phase: `${T.phaseSending} · ${RC.retrying}`, pct: 92 })
      await new Promise((r) => setTimeout(r, 1500 * 3 ** (attempt - 1)))
    }
    if (tRes.status === 402) {
      // Saved and waiting, not failed. The banner says so and the row shows it.
      const j = (await tRes.json()) as { allowance?: Allowance }
      emit({ type: 'held', id, allowance: j.allowance })
      return 'held'
    }
    if (!tRes.ok) throw new UploadError(tRes.status === 599 ? 'network' : tRes.status >= 502 ? 'busy' : 'server', ((await tRes.json().catch(() => ({}))) as { error?: string }).error ?? T.transcribeFailed, tRes.status)
    emit({ type: 'sent', id })
    return 'done'
  }

  /**
   * Runs upload jobs through the lanes: three files at a time on a computer (one on a phone),
   * fewer after a failure and more again once files go through (lib/pen/upload-retry.ts Lanes),
   * so a struggling server isn't sent three uploads and saves at once. Prep still takes turns
   * (onePrepAtATime). Each job can be stopped by the stall check and retried from its row.
   */
  async function runUploads(jobs: UploadJob[]) {
    for (const j of jobs) uploadJobs.current.set(j.key, j)
    const lanes = new Lanes(phoneNow.current ? 1 : 3)
    const wentUp: File[] = []
    await runLanes(jobs, lanes, async (j) => {
      const T = APP_COPY[langNow.current]
      const ctl = new AbortController()
      uploadAborts.current.set(j.key, ctl)
      patchUpload(j.key, { state: 'working', phase: T.phasePreparing, pct: 2, stage: 'upload', movedAt: Date.now(), error: undefined, kind: undefined })
      const step = ({ phase, pct, short, stage }: { phase: string; pct: number; short?: string; stage?: 'prep' | 'upload' }) =>
        patchUpload(j.key, { phase, pct, short, stage: stage ?? 'upload', movedAt: Date.now() })
      // The stall check aborts: the row fails over at once, whatever step it was waiting on.
      const stalled = new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new UploadError('stalled', 'stalled')), { once: true }))
      stalled.catch(() => {})
      try {
        // Saved already (it failed at "sending"): only that step again, not the whole upload.
        const saved = savedIds.current.get(j.key)
        const r = await Promise.race([
          saved
            ? sendOff(saved, step, ctl.signal).then((state) => ({ state, id: saved }))
            : uploadOne(j.file, j.people, step, j.event, ctl.signal, (id) => {
              savedIds.current.set(j.key, id)
              patchUpload(j.key, { sessionId: id })
            }),
          stalled,
        ])
        patchUpload(j.key, { state: r.state, pct: 100, sessionId: r.id, tagged: j.people.length > 0 })
        wentUp.push(j.file)
        return true
      } catch (e) {
        let kind = classifyUploadError(e)
        // Whatever the read failure looked like on the way (a worker error, an XHR "network
        // error"), a pen file that can't be read any more means the pen came out.
        if (j.fromPen && kind !== 'unplugged' && !savedIds.current.has(j.key) && !(await stillReadable(j.file))) kind = 'unplugged'
        patchUpload(j.key, { state: 'error', kind, error: (e as Error).message })
        // Only a busy or dropped answer slows the batch down; a too-big file says nothing about
        // the server, and neither does a pen pulled out.
        return !canRetry(kind) || kind === 'unplugged'
      } finally {
        uploadAborts.current.delete(j.key)
      }
    })
    // PenApp: refresh the list, offer to free up the pen, pick up new contacts.
    emit({ type: 'batch', files: wentUp })
  }

  const enqueue = useCallback((files: EnqueueFile[], opts: EnqueueOpts) => {
    if (!files.length) return
    const T = APP_COPY[opts.lang]
    langNow.current = opts.lang
    setCard({ lang: opts.lang, whatsapp: opts.whatsapp, byHand: opts.byHand })
    const event = Boolean(opts.event)
    const batch = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.file.name}`, file: f.file, people: f.people, event, fromPen: Boolean(f.fromPen) }))
    // Finished rows from an earlier batch make way for this one; rows still going stay, and so do
    // failed ones (they can still be retried).
    setUploads((prev) => [
      ...prev.filter((u) => u.state === 'waiting' || u.state === 'working' || u.state === 'error'),
      ...batch.map((b) => ({ key: b.key, name: b.file.name, phase: T.upWaiting, pct: 0, state: 'waiting' as const, fromPen: b.fromPen })),
    ])
    void runUploads(batch)
    // runUploads only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * A failed row's Retry, or "Retry failed" for all of them. A row whose pen came out reads its
   * file again first: from the pen itself when Chrome / Edge remember it (by name), else the
   * same file if the pen is back. Still unreadable: it says to add the recording again.
   */
  async function retryUploads(keys: string[]) {
    const T = APP_COPY[langNow.current]
    const rows = uploadsNow.current
    const jobs: UploadJob[] = []
    for (const k of keys) {
      const job = uploadJobs.current.get(k)
      const row = rows.find((u) => u.key === k)
      if (!job || row?.state !== 'error' || !canRetry(row.kind ?? 'server')) continue
      if (row.kind === 'unplugged') {
        const file = await rereadFromPen(job.file)
        if (!file) {
          patchUpload(k, { kind: (await penReachable()) ? 'gone' : 'unplugged' })
          continue
        }
        job.file = file
      }
      jobs.push(job)
    }
    if (!jobs.length) return
    const again = new Set(jobs.map((j) => j.key))
    setUploads((prev) => prev.map((u) => (again.has(u.key) ? { ...u, state: 'waiting' as const, phase: T.upWaiting, pct: 0, short: undefined, error: undefined, kind: undefined } : u)))
    void runUploads(jobs)
  }
  const retryRef = useRef(retryUploads)
  retryRef.current = retryUploads
  const retry = useCallback((keys: string[]) => { void retryRef.current(keys) }, [])

  const clearFinished = useCallback(() => setUploads((prev) => prev.filter((u) => u.state === 'waiting' || u.state === 'working')), [])

  /** "Who was in each?": PenApp's Home with those recordings to confirm; from another page, Home first. */
  const onWho = useCallback((ids: string[]) => {
    clearFinished()
    const live = listeners.current.size > 0
    emit({ type: 'who', ids })
    if (!live) router.push(homePath())
  }, [clearFinished, emit, router])

  const api = useMemo<UploadsApi>(() => ({ items: uploads, uploading, enqueue, retry, subscribe }), [uploads, uploading, enqueue, retry, subscribe])

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Only while there is a card: LangProvider sets the page's language as it renders, and
          the pages under it set their own. */}
      {uploads.length > 0 && (
        <LangProvider lang={card.lang}>
          <UploadCard
            uploads={uploads} onClose={clearFinished} onWho={onWho} onRetry={retry}
            lang={card.lang} whatsapp={card.whatsapp} phone={isPhone} byHand={card.byHand} T={APP_COPY[card.lang]}
          />
        </LangProvider>
      )}
    </Ctx.Provider>
  )
}

/* ------------------------------------------------------------- the pen */

/** The pen file again, after it came out and went back in. Null while it can't be read. */
async function rereadFromPen(old: File): Promise<File | null> {
  // Chrome / Edge with the pen chosen once: the drive's own handle, the same name and size.
  try {
    const p = await loadPick()
    if (p && (await permissionOf(p)) === 'granted') {
      const list = await listRecordings(p)
      const hit = list?.find((r) => r.name === old.name && r.file.size === old.size) ?? list?.find((r) => r.name === old.name)
      if (hit && (await stillReadable(hit.file))) return hit.file
    }
  } catch {}
  // Otherwise the same File, which reads again once the same drive is back.
  return (await stillReadable(old)) ? old : null
}

/** Is a remembered pen plugged in now? (Then a still-unreadable file has to be chosen again.) */
async function penReachable(): Promise<boolean> {
  try {
    const p = await loadPick()
    return Boolean(p && (await permissionOf(p)) === 'granted' && (await listRecordings(p)))
  } catch {
    return false
  }
}

/* ---------------------------------------------------------- the network */

/** Pieces of an as-is upload in flight at once on a computer. */
const PIECE_CONCURRENCY = 4

/** Runs `fn` over `items`, at most `n` at a time. Rejects on the first failure. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => { while (next < items.length) await fn(items[next++]) }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane))
}

/**
 * The browser's prep fell back (worker → page, or to the original as-is): one line in the
 * server log (/api/pen/prep-log) so real-world failures show up in Vercel. Never throws, never
 * waits.
 */
function logPrep(file: File, outcome: 'worker' | 'main-thread' | 'as-is', trail: PrepFallback[]) {
  try {
    void fetch('/api/pen/prep-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ name: file.name, bytes: file.size, outcome, trail: trail.slice(0, 4) }),
    }).catch(() => {})
  } catch {}
}

/** fetch() gives no upload progress, and these files are big enough that it matters. */
function putWithProgress(url: string, blob: Blob, mime: string, onPct: (pct: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    // Stopped by the tray's stall check: no more tries on this piece either.
    if (signal?.aborted) return reject(new UploadError('stalled', 'stalled'))
    const xhr = new XMLHttpRequest()
    signal?.addEventListener('abort', () => { xhr.abort(); reject(new UploadError('stalled', 'stalled')) }, { once: true })
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct((e.loaded / e.total) * 100) }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`upload failed ${xhr.status}: ${xhr.responseText.slice(0, 200)}`))
    xhr.onerror = () => reject(new Error('upload network error'))
    xhr.send(blob)
  })
}

/* ---------------------------------------------------------------- the card */

const SMALL_KEY = 'pen-upcard-small'

/**
 * The background uploads: a small card at the bottom instead of a window that blocks the app,
 * on every page under /pen (22 Oct). While going: how many are done, overall progress, the files
 * on demand, and, for files off the pen, to keep it plugged in. It folds down to a pill
 * ("Uploading 7 of 10") that opens again on a tap. When finished: what happens next (the
 * briefing emails), anything held or failed, and the way to ask about them on WhatsApp.
 *
 * `byHand`: a browser that can't write to the pen (Safari, phones, Firefox). It gets the "keep
 * this page open" note while uploading, and after pen recordings went up, how to delete them
 * from the pen by hand.
 */
function UploadCard({ uploads, onClose, onWho, onRetry, lang = 'en', whatsapp, phone, byHand = false, T }: { uploads: UploadItem[]; onClose: () => void; onWho?: (ids: string[]) => void; onRetry?: (keys: string[]) => void; lang?: Lang; whatsapp: { number: string; linked: boolean } | null; phone: boolean; byHand?: boolean; T: AppCopy }) {
  const [open, setOpen] = useState(false)
  // A failed row's reason, opened by tapping its "!" (hover shows it too).
  const [why, setWhy] = useState<string | null>(null)
  const RC = UPLOAD_RETRY_COPY[lang]
  const C = COPY[lang]
  // Folded to the pill; remembered for this tab, so it stays folded from page to page.
  const [small, setSmallState] = useState(false)
  useEffect(() => {
    try { setSmallState(sessionStorage.getItem(SMALL_KEY) === '1') } catch {}
  }, [])
  const setSmall = (v: boolean) => {
    setSmallState(v)
    try { sessionStorage.setItem(SMALL_KEY, v ? '1' : '0') } catch {}
  }
  // Finished without errors: the card fades away on its own 10 s later (16 Oct), held while the
  // pointer or focus is on it. Errors stay until closed.
  const [hold, setHold] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const settled = uploads.length > 0 && uploads.every((u) => u.state === 'done' || u.state === 'held')
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    setLeaving(false)
    if (!settled || hold) return
    const t = window.setTimeout(() => setLeaving(true), 9_600)
    const t2 = window.setTimeout(() => closeRef.current(), 10_000)
    return () => { window.clearTimeout(t); window.clearTimeout(t2) }
  }, [settled, hold])
  const finished = uploads.filter((u) => u.state === 'done' || u.state === 'held' || u.state === 'error')
  const failed = uploads.filter((u) => u.state === 'error')
  const going = finished.length < uploads.length
  // A batch that ended with failures opens up, so the Retry is in sight.
  const endedBadly = !going && failed.length > 0
  // So does the pen coming out mid-batch: the person has to act on it now.
  const unpluggedCount = failed.filter((u) => u.kind === 'unplugged').length
  useEffect(() => {
    if (endedBadly || unpluggedCount > 0) setSmallState(false)
  }, [endedBadly, unpluggedCount])
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => { setHost(document.querySelector('.pen-root') ?? document.body) }, [])
  if (!uploads.length || !host) return null
  const pct = Math.round(uploads.reduce((n, u) => n + (u.state === 'waiting' ? 0 : u.state === 'working' ? u.pct : 100), 0) / uploads.length)
  const ok = uploads.filter((u) => u.state === 'done').length
  const held = uploads.filter((u) => u.state === 'held').length
  const retryable = failed.filter((u) => canRetry(u.kind ?? 'server'))
  const reasonOf = (u: UploadItem) => uploadReason(u.kind ?? 'server', lang)
  const preparing = uploads.find((u) => u.state === 'working' && u.short && u.short !== T.upPrepQueue)
  const untagged = uploads.flatMap((u) => ((u.state === 'done' || u.state === 'held') && u.sessionId && !u.tagged ? [u.sessionId] : []))
  // Files still being read off the pen: it has to stay in until they are.
  const penBusy = uploads.some((u) => u.fromPen && (u.state === 'waiting' || u.state === 'working'))
  // The pen came out: said where it can't be missed, not only behind a row's "!".
  const unplugged = failed.filter((u) => u.kind === 'unplugged' || u.kind === 'gone')
  const allGood = !going && failed.length === 0 && held === 0
  const title = going ? T.upTitle(finished.length, uploads.length) : allGood ? C.allDone(ok) : T.upDoneTitle(ok + held)

  // Portalled to .pen-root like the referral pop-up: inside the shell, the recordings rail
  // painted over it (5 Oct).
  if (small && !endedBadly) {
    return createPortal(
      <button
        type="button" className="pen-uppill" data-phone={phone ? 'true' : undefined} data-done={going ? undefined : 'true'} data-leaving={leaving || undefined}
        onClick={() => setSmall(false)} aria-label={`${going ? C.pill(finished.length, uploads.length) : C.pillDone(ok + held)}. ${C.bigger}`}
        onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}
      >
        <span className="pen-uppill-ring" style={{ ['--p' as string]: `${going ? pct : 100}` }} aria-hidden>
          {going ? (penBusy ? <Icon name="usb" size={15} /> : null) : <Icon name="check" size={15} />}
        </span>
        <span className="pen-uppill-words">
          <span className="pen-uppill-text" role="status" aria-live="polite">{going ? C.pill(finished.length, uploads.length) : C.pillDone(ok + held)}</span>
          {going && penBusy && <span className="pen-uppill-pen">{C.pen}</span>}
        </span>
        <Icon name="chevron" size={14} className="pen-uppill-open" />
      </button>,
      host,
    )
  }
  return createPortal(
    <div
      className="pen-upcard" data-phone={phone ? 'true' : undefined} data-leaving={leaving || undefined} role="status" aria-live="polite"
      onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)} onBlur={() => setHold(false)}
    >
      <div className="pen-upcard-head">
        <strong>
          {allGood && <span className="pen-upcard-ok" aria-hidden><Icon name="check" size={14} /></span>}
          {title}
        </strong>
        {going || endedBadly ? (
          !endedBadly && (
            <button type="button" className="pen-upcard-min" onClick={() => setSmall(true)} aria-label={C.smaller} title={C.smaller}>
              <Icon name="chevron" size={16} />
            </button>
          )
        ) : null}
        {!going && <button type="button" className="pen-upcard-x" onClick={onClose} aria-label={T.upClose}>&times;</button>}
      </div>
      {going ? (
        <>
          <div className="pen-meter-bar"><span style={{ width: `${pct}%` }} /></div>
          {/* Off the pen: it has to stay in until every file is read (22 Oct). */}
          {penBusy && (
            <p className="pen-upcard-pen"><Icon name="usb" size={18} />{C.pen}</p>
          )}
          {/* A long recording spends a while being prepared: say so with a moving number (22 Oct). */}
          {preparing && <p className="pen-upcard-note pen-mono">{preparing.name} · {preparing.short}</p>}
          <p className="pen-upcard-note">{phone || byHand ? T.upKeepOpenPhone : C.keepOpen}</p>
          {unplugged.length > 0 && (
            <p className="pen-upcard-unplug"><Icon name="alert" size={15} />{reasonOf(unplugged[0])}</p>
          )}
          {/* Failed while the rest still go: say so now, with the way to try again. */}
          {retryable.length > 0 && onRetry && (
            <button type="button" className="pen-btn pen-upcard-retry" onClick={() => onRetry(retryable.map((u) => u.key))}>{RC.retryAll(retryable.length)}</button>
          )}
        </>
      ) : (
        <>
          {ok + held > 0 && <p className="pen-upcard-note">{T.upDoneBody}</p>}
          {/* Several went up and some have nobody on them: say who was in each, now or later. */}
          {onWho && untagged.length > 0 && ok + held > 1 && (
            <button type="button" className="pen-btn pen-upcard-who" onClick={() => onWho(untagged)}>
              <Icon name="people" size={16} />
              {T.upWhoEach}
            </button>
          )}
          {byHand && uploads.some((u) => u.state !== 'error' && PEN_NAME_RE.test(u.name)) && <PenSpaceHelp />}
          {held > 0 && <p className="pen-upcard-note">{T.upHeld(held)}</p>}
          {failed.length > 0 && (
            <div className="pen-upcard-err">
              {T.upFailed(failed.length)}
              <ul>
                {failed.map((f) => (
                  <li key={f.key} title={f.error}>
                    <span className="pen-mono">{f.name}</span>: {reasonOf(f)}
                    {onRetry && canRetry(f.kind ?? 'server') && (
                      <> <button type="button" className="pen-linkbtn pen-upcard-retry-one" onClick={() => onRetry([f.key])}>{RC.retry}</button></>
                    )}
                  </li>
                ))}
              </ul>
              {onRetry && retryable.length > 1 && (
                <button type="button" className="pen-btn pen-upcard-retry" onClick={() => onRetry(retryable.map((u) => u.key))}>{RC.retryAll(retryable.length)}</button>
              )}
            </div>
          )}
          {whatsapp?.linked && ok + held > 0 && (
            <a
              className="pen-btn pen-btn-accent pen-upcard-wa"
              href={`https://wa.me/${whatsapp.number}?text=${encodeURIComponent(T.waCallExamples[1])}`}
              target="_blank" rel="noreferrer"
            >
              {T.upAskWa}
            </a>
          )}
          {/* Not linked: a quiet one tap, so the next recording's briefing comes on WhatsApp. */}
          {whatsapp && !whatsapp.linked && ok + held > 0 && <GetWhatsApp number={whatsapp.number} variant="link" label={T.upConnectWa} />}
        </>
      )}
      {uploads.length > 1 && (
        <button type="button" className="pen-upcard-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? T.upHide : T.upShow}</button>
      )}
      {open && (
        <ul className="pen-upcard-files">
          {uploads.map((u) => {
            // A pen pulled out says so on its row, not behind the "!".
            const loud = u.state === 'error' && (u.kind === 'unplugged' || u.kind === 'gone')
            return (
              <li key={u.key} data-state={u.state} title={u.state === 'error' ? `${reasonOf(u)}${u.error ? ` (${u.error})` : ''}` : undefined}>
                <span className="pen-mono pen-upcard-name">{u.name}</span>
                <span className="pen-upcard-state">
                  {u.state === 'error' ? (
                    <>
                      {!loud && <button type="button" className="pen-linkbtn" aria-expanded={why === u.key} aria-label={RC.why} onClick={() => setWhy((w) => (w === u.key ? null : u.key))}>!</button>}
                      {onRetry && canRetry(u.kind ?? 'server') && (
                        <> <button type="button" className="pen-linkbtn pen-upcard-retry-one" onClick={() => onRetry([u.key])}>{RC.retry}</button></>
                      )}
                    </>
                  ) : u.state === 'done' ? '✓' : u.state === 'held' ? '⏸' : u.state === 'waiting' ? T.upWaiting : u.short ?? `${Math.round(u.pct)}%`}
                </span>
                {u.state === 'error' && (loud || why === u.key) && <span className="pen-upcard-why">{reasonOf(u)}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>,
    host,
  )
}
