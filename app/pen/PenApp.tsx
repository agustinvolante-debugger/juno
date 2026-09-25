'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Icon, { type IconName } from './Icon'
import { COMMON_TYPES, slugType, isViewing, displayType, BUCKETS, BUCKET_ICON, bucketOf, type Bucket } from '@/lib/pen/categories'
import type { PenSession, MeetingType, ChatTurn, PenNotes, NoteBlock, Mention } from '@/lib/pen/store'
import type { PersonCard } from '@/lib/pen/people'
import { useTagPicker, TagMenu, shortLabel, type Taggable } from './TagPicker'
import NoteEditor, { blocksFrom } from './NoteEditor'
import TranscriptEditor from './TranscriptEditor'
import SpeakerNames from './SpeakerNames'
import TranscriptImport from './TranscriptImport'
import { speakersIn, type SpeakerMap } from '@/lib/pen/speakers'
import ChatView from './ChatView'
import DocView from './DocView'
import Overview from './Overview'
import SignOut from './SignOut'
import PeoplePanel from './PeoplePanel'
import { isOwner } from '@/lib/pen/owner'
import PeoplePicker, { type Picked } from './PeoplePicker'
import type { ArchiveStats } from '@/lib/pen/stats'
import DeliverableSheet, { DeliverableActions, type SheetRequest } from './DeliverableSheet'
import SendBriefing from './SendBriefing'
import { prepareAudio, fmtMB, fmtDur, SOFT_SIZE_LIMIT } from '@/lib/pen/encode'
import { postJson, getJson, patchJson, del, errMessage, PenHttpError } from '@/lib/pen/http'
import type { ChatSummary } from '@/lib/pen/chats'
import type { DocSummary } from '@/lib/pen/docs'
import type { Allowance } from '@/lib/pen/allowance'
import UsageBar from './UsageBar'
import Link from 'next/link'
import { ACCEPT_DESKTOP, acceptFor } from '@/lib/pen/file-accept'
import { findRuns } from '@/lib/pen/merge-detect'

/**
 * What the main column is showing. Chat and pages are views, not overlays: the whole point
 * of the overhaul is that you can leave a conversation and come back to it.
 */
type View =
  | { k: 'archive' }
  | { k: 'session'; id: string }
  | { k: 'chat'; id: string | null }
  | { k: 'doc'; id: string }

// The File System Access API isn't in the default TS lib.
type FsHandle = { kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> }
type FsDir = { name: string; values: () => AsyncIterable<FsHandle> }
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FsDir>
  }
}

// Audio, plus the video containers a phone produces — the audio track is extracted in the
// browser and the picture discarded, so a walkthrough filmed on a phone still works.
/** A category has to group at least this many recordings before it is worth navigating by. */
const MIN_CAT = 3

const MEDIA_RE = /\.(wav|wave|mp3|m4a|aac|ogg|opus|webm|amr|3gp|wma|flac|aif|aiff|mp4|m4v|mov|qt)$/i

/**
 * What the file picker offers. `audio/*` nominally covers WAV, but files coming off a USB
 * recorder often arrive with an empty or vendor-specific MIME type, and the picker then greys
 * them out with no explanation. The WAV types and extensions are therefore listed explicitly.
 * MEDIA_RE remains the real gate — this only controls what the dialog shows.
 */
/**
 * The accept attribute, which on iOS is the difference between a working picker and one that
 * opens and closes having selected nothing. See lib/pen/file-accept.
 *
 * Starts as the desktop list so the server and the first client render agree, then corrects
 * itself once the browser can be asked what it is.
 */
function useAccept(): string | undefined {
  const [accept, setAccept] = useState<string | undefined>(ACCEPT_DESKTOP)
  useEffect(() => {
    setAccept(acceptFor(navigator.userAgent, navigator.maxTouchPoints, navigator.platform))
  }, [])
  return accept
}

type Pending = { file: File; picked: boolean }
type Progress = { name: string; phase: string; pct: number }

export default function PenApp({
  initial,
  stats,
  loadError,
  email,
  name,
  avatar,
  allowance: initialAllowance,
  whatsapp,
}: {
  /** Juno Pen's WhatsApp number and whether this account has linked a phone. Null when off. */
  whatsapp?: { number: string; linked: boolean } | null
  initial: PenSession[]
  stats: ArchiveStats | null
  allowance: Allowance | null
  loadError: string | null
  name?: string | null
  avatar?: string | null
  email: string
}) {
  const [sessions, setSessions] = useState<PenSession[]>(initial)
  const accept = useAccept()
  const router = useRouter()

  const openSession = useCallback((id: string | null) => {
    setView(id ? { k: 'session', id } : { k: 'archive' })
    setNavOpen(false)
  }, [])
  const [pending, setPending] = useState<Pending[]>([])
  const [penName, setPenName] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [callPeople, setCallPeople] = useState<Picked[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [heldNotice, setHeldNotice] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [tab, setTab] = useState<'note' | 'transcript'>('note')
  const [chatOpen, setChatOpen] = useState(false)
  const [view, setView] = useState<View>({ k: 'archive' })
  const [chatSeed, setChatSeed] = useState<{ text: string; mentions: Mention[] } | null>(null)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [docs, setDocs] = useState<DocSummary[]>([])
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const isPhone = useIsPhone()
  // The phone sheet ends on a promise ("we'll email you") rather than vanishing, so it needs a
  // state of its own — `pending` and `progress` are both empty by then.
  const [importDone, setImportDone] = useState(false)
  const closeSheet = useCallback(() => {
    setImportDone(false)
    setPending([])
  }, [])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false)
    window.addEventListener('keydown', onKey)
    // Without this the page scrolls under the drawer on iOS, which reads as the app breaking.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [navOpen])
  const [catAsk, setCatAsk] = useState<Record<string, string[]>>({})
  const fileInput = useRef<HTMLInputElement>(null)

  const refreshChats = useCallback(async () => {
    try {
      setChats((await getJson<{ chats: ChatSummary[] }>('/api/pen/chats')).chats)
    } catch {
      // A sidebar that can't list threads shouldn't take the app down with it.
    }
  }, [])
  const refreshDocs = useCallback(async () => {
    try {
      setDocs((await getJson<{ docs: DocSummary[] }>('/api/pen/docs')).docs)
    } catch {
      /* same */
    }
  }, [])
  // Everyone the user has added, for the @ picker. Refreshed when a recording's People change.
  const [people, setPeople] = useState<PersonCard[]>([])
  const [txImport, setTxImport] = useState(false)
  const refreshPeople = useCallback(async () => {
    try {
      setPeople((await getJson<{ people: PersonCard[] }>('/api/pen/people')).people)
    } catch {
      /* same */
    }
  }, [])
  useEffect(() => {
    void refreshChats()
    void refreshDocs()
    void refreshPeople()
  }, [refreshChats, refreshDocs, refreshPeople])

  /** Start a thread from the header search. The question is asked once the view mounts. */
  const askArchive = useCallback((question: string, mentions: Mention[] = []) => {
    setChatSeed({ text: question, mentions })
    setView({ k: 'chat', id: null })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // A category earns a place in the nav by grouping at least this many recordings.
  // Only buckets that actually hold something appear in the nav.
  const bucketCounts = useMemo(() => {
    const n = new Map<Bucket, number>()
    for (const x of sessions) {
      const b = bucketOf(displayType(x.meeting_type))
      n.set(b, (n.get(b) ?? 0) + 1)
    }
    return BUCKETS.filter((b) => (n.get(b) ?? 0) > 0).map((b) => [b, n.get(b)!] as const)
  }, [sessions])

  const activeId = view.k === 'session' ? view.id : null
  const active = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId])

  // Feature-detect after mount, or the server and client disagree and the fallback banner flashes.
  const [mounted, setMounted] = useState(false)
  const [supportsPicker, setSupportsPicker] = useState(false)
  useEffect(() => {
    setMounted(true)
    setSupportsPicker(typeof window.showDirectoryPicker === 'function')
  }, [])

  const [allowance, setAllowance] = useState<Allowance | null>(initialAllowance)
  const loadAllowance = useCallback(async () => {
    const r = await fetch('/api/pen/allowance', { cache: 'no-store' })
    if (r.ok) setAllowance(((await r.json()) as { allowance: Allowance }).allowance)
  }, [])

  const refresh = useCallback(async () => {
    const r = await fetch('/api/pen/sessions', { cache: 'no-store' })
    if (r.ok) setSessions(((await r.json()) as { sessions: PenSession[] }).sessions)
    void loadAllowance()
    // `stats` arrives as a server prop; re-running the server component is the only thing
    // that refreshes it. Without this the Overview and categories sit frozen at page load.
    router.refresh()
  }, [router, loadAllowance])

  // Recordings held for lack of time go through on their own once there is time again: after
  // the 1st, or after hours were bought somewhere the webhook could not reach. Once per load.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !allowance?.canProcess || !sessions.some((s) => s.status === 'held')) return
    resumed.current = true
    void (async () => {
      const r = await fetch('/api/pen/resume', { method: 'POST' })
      if (r.ok && ((await r.json()) as { started: number }).started > 0) void refresh()
    })()
  }, [allowance, sessions, refresh])

  const patchLocal = useCallback((s: PenSession) => {
    setSessions((prev) => prev.map((x) => (x.id === s.id ? s : x)))
  }, [])

  const removeSession = useCallback(async (id: string) => {
    const r = await fetch(`/api/pen/sessions/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).error ?? 'could not delete that recording')
      return
    }
    setSessions((prev) => {
      const next = prev.filter((x) => x.id !== id)
      // Move to the neighbouring recording rather than dumping the user on an empty pane.
      setView((v) => (v.k === 'session' && v.id === id ? { k: 'archive' } : v))
      return next
    })
    router.refresh()
  }, [router])

  const makeNotes = useCallback(
    async (id: string, type?: MeetingType, auto = false) => {
      let j: {
        session: PenSession
        category?: { value: string | null; confidence: number | null; alternatives: string[] }
      }
      try {
        j = await postJson('/api/pen/notes', { id, ...(type ? { type } : {}), ...(auto ? { auto: true } : {}) })
      } catch (e) {
        // A 409 means the webhook claimed it first, which is the normal path now, not an error.
        if (!(auto && e instanceof PenHttpError && e.status === 409)) {
          setErr(errMessage(e, 'Could not write the notes.'))
        }
        return
      }
      patchLocal(j.session)

      // The categoriser abstains rather than guesses. When it does, say so once and offer its
      // runners-up — a silently blank category is a filter that quietly loses recordings.
      setCatAsk((m) => {
        const next = { ...m }
        if (!type && !j.session.meeting_type) next[id] = j.category?.alternatives ?? []
        else delete next[id]
        return next
      })
      router.refresh()
    },
    [patchLocal, router],
  )

  // Poll anything mid-transcription, and keep a fallback for a webhook that never arrives.
  //
  // The webhook now owns writing the notes, because that is the only path that survives the
  // tab being closed. The browser only steps in if a transcript has been sitting untouched
  // for a while, and when it does it takes the same claim, so the two cannot both run.
  const seenTranscribed = useRef<Record<string, number>>({})
  const WEBHOOK_GRACE_MS = 90_000

  const busyKey = sessions.map((s) => `${s.id}:${s.status}`).join(',')
  useEffect(() => {
    const watching = sessions.filter((s) => s.status === 'transcribing' || s.status === 'transcribed')
    if (!watching.length) return
    const t = setInterval(async () => {
      for (const s of watching) {
        const r = await fetch(`/api/pen/transcribe?id=${s.id}`, { cache: 'no-store' })
        if (!r.ok) continue
        const j = (await r.json()) as { session?: PenSession }
        if (!j.session) continue
        if (j.session.status !== s.status) patchLocal(j.session)

        if (j.session.status === 'transcribed') {
          const first = seenTranscribed.current[j.session.id] ?? Date.now()
          seenTranscribed.current[j.session.id] = first
          if (Date.now() - first > WEBHOOK_GRACE_MS) void makeNotes(j.session.id, undefined, true)
        } else {
          delete seenTranscribed.current[j.session.id]
        }
      }
    }, 6000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyKey])

  /* ---------------------------------------------------------------- connect */

  async function connectPen() {
    setErr(null)
    try {
      const dir = await window.showDirectoryPicker!({ id: 'pen-recorder', mode: 'read' })
      const found: File[] = []
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && MEDIA_RE.test(entry.name) && entry.getFile) found.push(await entry.getFile())
      }
      if (!found.length) {
        setErr(`No recordings in “${dir.name}”. Recorders often keep files in a subfolder — try picking that one.`)
        return
      }
      found.sort((a, b) => b.lastModified - a.lastModified)
      setPenName(dir.name)
      setPending(found.map((f) => ({ file: f, picked: true })))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr((e as Error).message)
    }
  }

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => MEDIA_RE.test(f.name))
    if (!list.length) return setErr('Those files aren’t audio or video that can be read here.')
    setPenName(null)
    setPending((prev) => [...prev, ...list.map((f) => ({ file: f, picked: true }))])
  }

  /* ----------------------------------------------------------------- import */

  async function importPicked() {
    setErr(null)
    const picked = pending.filter((p) => p.picked)
    if (!picked.length) return
    if (!consent) {
      return setErr('Confirm consent first. Florida requires every party to agree to being recorded.')
    }

    for (const { file } of picked) {
      try {
        setProgress({ name: file.name, phase: 'Preparing audio', pct: 5 })
        const prep = await prepareAudio(file)

        setProgress({ name: file.name, phase: 'Getting an upload slot', pct: 15 })
        const urlRes = await fetch('/api/pen/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, prep.mime === 'audio/wav' ? '.wav' : '') }),
        })
        if (!urlRes.ok) throw new Error((await urlRes.json()).error ?? 'could not get an upload URL')
        const { path, signedUrl } = (await urlRes.json()) as { path: string; signedUrl: string }

        // Anything compressible has already been compressed by now, so reaching this means
        // either a genuinely enormous recording or a browser with no Opus encoder. Say which,
        // because "split the recording" is useless advice for the second one.
        if (prep.blob.size > SOFT_SIZE_LIMIT) {
          throw new Error(
            prep.mime === 'audio/ogg'
              ? `${fmtMB(prep.blob.size)} even after compressing — that's several hours of audio. ` +
                `Split it into shorter files and upload them separately; they'll be joined back up.`
              : `${fmtMB(prep.blob.size)} is over the 50 MB per-file limit, and this browser can't ` +
                `compress audio. Try again in Chrome, which can.`,
          )
        }

        await putWithProgress(signedUrl, prep.blob, prep.mime, (pct) =>
          setProgress({ name: file.name, phase: `Uploading · ${prep.note}`, pct: 15 + pct * 0.6 }),
        )

        setProgress({ name: file.name, phase: 'Saving', pct: 80 })
        const sRes = await fetch('/api/pen/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storage_path: path,
            source_name: file.name,
            mime: prep.mime,
            bytes: prep.blob.size,
            duration_sec: prep.durationSec,
            recorded_at: new Date(file.lastModified).toISOString(),
            consent: true,
            // The first person also names the call, which older parts of the app read.
            client_name: callPeople[0]?.name || undefined,
            ...(callPeople.length ? { people: callPeople.map((p) => (p.id ? { id: p.id } : { name: p.name })) } : {}),
          }),
        })
        if (!sRes.ok) throw new Error((await sRes.json()).error ?? 'could not save the recording')
        const { session, duplicate } = (await sRes.json()) as { session: PenSession; duplicate: boolean }

        setSessions((prev) => [session, ...prev.filter((x) => x.id !== session.id)])
        openSession(session.id)

        if (!duplicate) {
          setProgress({ name: file.name, phase: 'Sending for transcription', pct: 92 })
          const tRes = await fetch('/api/pen/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: session.id }),
          })
          if (tRes.status === 402) {
            // Saved and waiting, not failed. The banner says so and the row shows it.
            const j = (await tRes.json()) as { allowance?: Allowance }
            if (j.allowance) setAllowance(j.allowance)
            setSessions((prev) => prev.map((x) => (x.id === session.id ? { ...x, status: 'held' as const } : x)))
            setHeldNotice(true)
          } else if (!tRes.ok) setErr((await tRes.json()).error ?? 'transcription failed to start')
          else setSessions((prev) => prev.map((x) => (x.id === session.id ? { ...x, status: 'transcribing' as const } : x)))
        }
      } catch (e) {
        setErr(`${file.name}: ${(e as Error).message}`)
      }
    }
    setProgress(null)
    setPending([])
    // On a phone the whole point is that you can now put the phone away, so say so instead of
    // dropping the user back on a screen with nothing on it.
    if (isPhone) setImportDone(true)
    setCallPeople([])
    void refresh()
    // New names typed at upload are contacts now.
    void refreshPeople()
  }

  /* ------------------------------------------------------------------- view */

  // A meeting the pen split across files shows up once, under its first part. The later
  // parts still exist and are reachable from it — they are just not separate meetings.
  const listed = useMemo(() => sessions.filter((s) => (s.merge_index ?? 0) === 0), [sessions])

  const visible = useMemo(
    () => (catFilter ? listed.filter((x) => bucketOf(displayType(x.meeting_type)) === catFilter) : listed),
    [listed, catFilter],
  )
  const grouped = useMemo(() => groupByDay(visible), [visible])

  // What @ can tag: people first, then recordings by the same title the list shows.
  const taggable = useMemo<Taggable[]>(
    () => [
      ...people.map((p) => ({
        id: p.id,
        kind: 'person' as const,
        title: p.name,
        sub: p.recordings === 1 ? '1 recording' : `${p.recordings} recordings`,
      })),
      ...listed.map((s) => ({
        id: s.id,
        kind: 'recording' as const,
        title: s.title || s.client_name || s.source_name || 'Untitled',
        sub: new Date(s.recorded_at ?? s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      })),
    ],
    [people, listed],
  )

  /** Every part of a joined meeting, in order. One entry for a recording that stands alone. */
  const partsOf = useCallback(
    (s: PenSession) =>
      s.merge_group
        ? sessions
            .filter((x) => x.merge_group === s.merge_group)
            .sort((a, b) => (a.merge_index ?? 0) - (b.merge_index ?? 0))
        : [s],
    [sessions],
  )

  /** Recordings that look like one meeting the pen cut in half but that nobody has joined. */
  const runs = useMemo(() => findRuns(sessions), [sessions])
  const [joining, setJoining] = useState(false)

  const joinRun = async (ids: string[]) => {
    setJoining(true)
    setErr(null)
    try {
      const j = await postJson<{ primaryId: string; briefed: boolean }>('/api/pen/merge', { action: 'join', ids })
      await refresh()
      openSession(j.primaryId)
      setTab('note')
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setJoining(false)
    }
  }

  const splitGroup = async (group: string) => {
    setJoining(true)
    try {
      await postJson('/api/pen/merge', { action: 'split', group })
      await refresh()
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setJoining(false)
    }
  }

  return (
    <main className="pen-page">
      {/* The sidebar is a page-level column running the full height, so the brand sits level
          with the search box rather than a header's height below it. Everything else — the
          header, the banners, the import tray and the note/rail grid — stacks to its right. */}
      <div className="pen-side">
      {/* ------------------------------------------------------ navigation */}
      <div className="pen-brand">
        <Image src="/juno_mark.png" alt="" width={34} height={34} className="pen-mark" priority />
        <div>
          <div className="pen-display pen-brand-name">Juno Pen</div>
          <div className="pen-brand-tag">Capture. Understand. Do.</div>
        </div>
      </div>

      {supportsPicker ? (
        <button className="pen-connect" onClick={connectPen}>
          <Icon name="link" size={18} />
          Connect pen
        </button>
      ) : null}

      {/* The drop target belongs next to Connect pen: they are the two ways a recording gets
          in, and separating them meant the only visible route on a browser without the
          folder picker was a link at the foot of a list on the other side of the screen.
          Clickable as well as droppable, because "drag a file here" is not an instruction
          everyone acts on. */}
      <button
        className="pen-drop pen-drop-side"
        data-over={dragOver}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }}
      >
        <Icon name="plus" size={17} />
        <span>
          <strong>Add audio files</strong>
          <em>or drag them here</em>
        </span>
      </button>

      <button type="button" className="pen-tximp-open" onClick={() => { setNavOpen(false); setTxImport(true) }}>
        <Icon name="quote" size={15} />
        Import a transcript
      </button>
      {txImport && (
        <TranscriptImport
          people={people}
          onClose={() => setTxImport(false)}
          onImported={(id) => { setTxImport(false); void refresh(); openSession(id) }}
        />
      )}

      {/* The third way in: from the phone, over WhatsApp. Opens the chat once linked,
          otherwise the page that links it. */}
      {whatsapp && (
        <a
          className="pen-drop pen-drop-side pen-wa-side"
          href={whatsapp.linked ? `https://wa.me/${whatsapp.number}` : '/pen/settings/whatsapp'}
          {...(whatsapp.linked ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          <Icon name="chat" size={17} />
          <span>
            <strong>{whatsapp.linked ? 'Open WhatsApp' : 'Use WhatsApp'}</strong>
            <em>{whatsapp.linked ? 'Send recordings, ask questions' : 'Send recordings from your phone'}</em>
          </span>
        </a>
      )}

      <nav className="pen-cats">
        <div className="pen-cats-list">
          <button
            className="pen-cat"
            data-active={view.k === 'archive'}
            onClick={() => { setView({ k: 'archive' }); setCatFilter(null); setNavOpen(false) }}
          >
            <Icon name="home" size={19} />
            <span className="pen-cat-label">Home</span>
            {!!stats?.actionsOpen && <span className="pen-cat-n">{stats.actionsOpen}</span>}
          </button>
          <button
            className="pen-cat"
            data-active={catFilter === null && view.k !== 'archive' && view.k !== 'chat' && view.k !== 'doc'}
            onClick={() => { setCatFilter(null); setNavOpen(false) }}
          >
            <Icon name="recordings" size={19} />
            <span className="pen-cat-label">All recordings</span>
            <span className="pen-cat-n">{sessions.length}</span>
          </button>
        </div>

        {/* Fixed buckets, not the free-form labels. Measured on a real archive: 11 recordings
            produced 10 distinct categories, 9 holding a single recording — a filter that
            always returns one item is not a filter. The specific label still appears on each
            recording row, where it is good description; navigation happens by bucket. Empty
            buckets are hidden so the nav only ever offers somewhere to go. */}
        {bucketCounts.length > 0 && (
          <div className="pen-cats-list pen-cats-buckets">
            {bucketCounts.map(([b, n]) => (
              <button
                key={b}
                className="pen-cat"
                data-active={catFilter === b}
                onClick={() => { setCatFilter(catFilter === b ? null : b); setNavOpen(false) }}
              >
                <Icon name={BUCKET_ICON[b] as IconName} size={19} />
                <span className="pen-cat-label">{b}</span>
                <span className="pen-cat-n">{n}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* --------------------------------- recordings (rail; ordered right in CSS) */}

      <div className="pen-quotecard">
        <p>&ldquo;Small moments.<br />Bigger progress.&rdquo;</p>
      </div>

      <nav className="pen-saved">
        {/* ---------------------------------------------------------- chats */}
        <div className="pen-cats-head pen-label pen-cats-head-row">
          <span>Chats</span>
          <button
            className="pen-cats-new"
            title="New chat"
            onClick={() => {
              setChatSeed(null)
              setView({ k: 'chat', id: null })
              setNavOpen(false)
            }}
          >
            +
          </button>
        </div>
        {chats.length === 0 ? (
          <p className="pen-cats-empty">Ask something in the search bar and it lands here.</p>
        ) : (
          <div className="pen-cats-list">
            {chats.slice(0, 4).map((c) => (
              <button
                key={c.id}
                className="pen-cat"
                data-active={view.k === 'chat' && view.id === c.id}
                onClick={() => {
                  setChatSeed(null)
                  setView({ k: 'chat', id: c.id })
                  setNavOpen(false)
                }}
                title={c.title ?? 'Untitled chat'}
              >
                <span className="pen-cat-label">{c.title ?? 'Untitled chat'}</span>
              </button>
            ))}
          </div>
        )}

        {/* ---------------------------------------------------------- pages */}
        {docs.length > 0 && (
          <>
            <div className="pen-cats-head pen-label">Pages</div>
            <div className="pen-cats-list">
              {docs.slice(0, 4).map((d) => (
                <button
                  key={d.id}
                  className="pen-cat"
                  data-active={view.k === 'doc' && view.id === d.id}
                  onClick={() => { setView({ k: 'doc', id: d.id }); setNavOpen(false) }}
                  title={d.title}
                >
                  <span className="pen-cat-label">{d.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="pen-side-meter">
        <UsageBar allowance={allowance} />
      </div>
      </div>

      <div className="pen-main-col">
      {/* Three columns so the search sits dead centre AND on the same horizontal axis as the
          buttons. `justify-between` couldn't do both — it centres the search only when the
          two side groups happen to be the same width. */}
      <header className="pen-head">
        <ArchiveSearch
          value={query}
          onChange={setQuery}
          suggestions={searchSuggestions(stats)}
          options={taggable}
          onAsk={(q, mentions) => {
            askArchive(q, mentions)
            setQuery('')
          }}
        />

        <div className="pen-head-right">
          <button
            className="pen-browse"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-label="Browse recordings and categories"
          >
            <svg viewBox="0 0 18 18" aria-hidden>
              <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" fill="none" stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="pen-browse-t">Browse</span>
          </button>
          <input ref={fileInput} type="file" multiple accept={accept} className="hidden"
                 onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <Account email={email} name={name} avatar={avatar} />
        </div>
      </header>

      {/* On a phone the sidebar hides behind the menu, but a phone is exactly where WhatsApp
          is the easy way in. Phone-only; the desktop has the sidebar entry. */}
      {whatsapp && (
        <a
          className="pen-wa-phone"
          href={whatsapp.linked ? `https://wa.me/${whatsapp.number}` : '/pen/settings/whatsapp'}
        >
          <Icon name="chat" size={18} />
          <span>
            <strong>{whatsapp.linked ? 'Send a recording on WhatsApp' : 'Use Juno Pen on WhatsApp'}</strong>
            <em>{whatsapp.linked ? 'Plug the pen in, then share the file to the chat' : 'Send recordings and ask questions from your phone'}</em>
          </span>
          <Icon name="chevron" size={16} className="pen-wa-phone-go" />
        </a>
      )}


      {loadError && (
        <Banner tone="bad">
          Couldn’t load recordings: {loadError}
          <div className="mt-1 text-[14.5px]" style={{ color: 'var(--soft)' }}>
            If a column is missing, run the ALTER at the bottom of <span className="pen-mono">lib/pen/schema.sql</span>.
          </div>
        </Banner>
      )}
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {heldNotice && (
        <Banner tone="warn" onClose={() => setHeldNotice(false)}>
          {"You're out of recording hours for this month. Your upload is saved and will be transcribed as soon as you add hours or the month resets. "}
          <Link href="/pen/settings/hours" className="underline">Buy hours</Link>
        </Banner>
      )}
      {mounted && !supportsPicker && (
        <Banner tone="warn">
          This browser can’t read a folder directly. Use Chrome or Edge for one-click “Connect pen”, or drag files in below.
        </Banner>
      )}

      {/* The pen stops at 60 minutes and opens a new file, so a long meeting arrives in
          halves. Normally they are joined the moment the second transcript lands; this is
          for the ones already sitting in the archive from before, or an upload that arrived
          days late. */}
      {runs.map((r) => (
        <Banner key={r.sessions[0].id} tone="warn">
          <strong style={{ color: 'var(--ink)' }}>
            {r.sessions.length} recordings look like one {fmtDur(r.totalSec)} meeting.
          </strong>{' '}
          The pen stops at 60 minutes and starts a new file.
          <div className="pen-mono mt-1 text-[13px]" style={{ color: 'var(--faint)' }}>
            {r.sessions.map((s) => s.source_name || s.title || 'untitled').join('  →  ')}
          </div>
          <button
            className="pen-btn mt-2.5"
            disabled={joining}
            onClick={() => void joinRun(r.sessions.map((s) => s.id))}
          >
            <Icon name="link" size={15} />
            {joining ? 'Joining…' : 'Join into one meeting'}
          </button>
        </Banner>
      ))}

      {(pending.length > 0 || progress || importDone) && (
        <>
          {isPhone && <button className="pen-scrim pen-scrim-on" aria-label="Close" onClick={closeSheet} />}
          <ImportTray
            pending={pending} setPending={setPending} penName={penName}
            consent={consent} setConsent={setConsent}
            people={people} callPeople={callPeople} setCallPeople={setCallPeople}
            progress={progress} onImport={importPicked}
            phone={isPhone} onClose={closeSheet} done={importDone}
          />
        </>
      )}

      <div className="pen-shell" data-nav={navOpen ? 'open' : 'closed'}>
        {/* On desktop `.pen-side` is display:contents, so nav and rail stay direct grid
            children and the three-column layout is untouched. On a phone it becomes a single
            off-canvas drawer, which is the only way the note gets the whole screen. */}



        <button
          className="pen-scrim"
          aria-label="Close navigation"
          tabIndex={navOpen ? 0 : -1}
          onClick={() => setNavOpen(false)}
        />

        <section className="pen-shell-main min-w-0">
          {view.k === 'chat' ? (
            <ChatView
              recordings={taggable}
              chatId={view.id}
              seed={chatSeed}
              onSeedConsumed={() => setChatSeed(null)}
              onThreadChanged={(id) => {
                setView({ k: 'chat', id })
                void refreshChats()
              }}
              onDocCreated={(id) => {
                setView({ k: 'doc', id })
                void refreshDocs()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              onCite={(sessionId) => {
                openSession(sessionId)
                setTab('note')
                setChatOpen(false)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          ) : view.k === 'doc' ? (
            <DocView
              docId={view.id}
              onRenamed={() => void refreshDocs()}
              onDeleted={() => {
                setView({ k: 'archive' })
                void refreshDocs()
              }}
            />
          ) : !active ? (

            stats ? (
              <Overview
                stats={stats}
                people={people}
                onChanged={() => void refresh()}
                onAskPerson={(p) => {
                  const label = shortLabel(p.name, new Set())
                  askArchive(`Show me all the conversations with @${label}`, [{ id: p.id, title: p.name, label, kind: 'person' }])
                }}
                onOpen={(id) => {
                  openSession(id)
                  setTab('note')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              />
            ) : (
              <div className="pen-panel px-8 py-16 text-center">
                <p className="text-[16.5px]" style={{ color: 'var(--dim)' }}>Choose a recording on the left.</p>
              </div>
            )
          ) : (
            <div className={chatOpen ? 'grid gap-7 xl:grid-cols-[minmax(0,1fr)_352px]' : ''}>
              <Detail
                selfEmail={email}
                onPeopleChanged={() => void refreshPeople()}
                onBack={() => setView({ k: 'archive' })}
                session={active} tab={tab} setTab={setTab}
                parts={partsOf(active)}
                splitting={joining}
                onSplit={() => active.merge_group && void splitGroup(active.merge_group)}
                chatOpen={chatOpen} onToggleChat={() => setChatOpen((v) => !v)}
                onNotes={(type) => makeNotes(active.id, type)}
                askCategory={catAsk[active.id]}
                onDelete={() => removeSession(active.id)}
                onPatch={async (patch) => {
                  const r = await fetch(`/api/pen/sessions/${active.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patch),
                  })
                  if (!r.ok) {
                    const msg = (await r.json().catch(() => ({}))).error ?? `save failed (${r.status})`
                    setErr(msg)
                    // Rethrow so the editor can show "not saved" rather than a false "saved".
                    throw new Error(msg)
                  }
                  setSessions((prev) => prev.map((x) => (x.id === active.id ? { ...x, ...patch } : x)))
                }}
              />
              {chatOpen && <ChatPanel session={active} onChat={patchLocal} onClose={() => setChatOpen(false)} />}
            </div>
          )}
        </section>

        {/* --------------------------------------- recent recordings (col 3) */}
        <aside className="pen-rail">
          <div className="pen-rail-head">
            <span className="pen-rail-title">Recent recordings</span>
            <button className="pen-rail-new" onClick={() => fileInput.current?.click()}>
              <Icon name="plus" size={15} />
              New
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="mt-6 text-[14.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              {catFilter ? (
                <>Nothing in this category. <button className="underline" onClick={() => setCatFilter(null)}>Show everything</button>.</>
              ) : (
                <>Nothing yet. Plug the pen into USB, press <strong style={{ color: 'var(--soft)' }}>Connect pen</strong>, and choose the drive that appears.</>
              )}
            </p>
          ) : (
            <div className="mt-6">
              {grouped.map(([day, rows]) => (
                <div key={day} className="mb-5">
                  <div className="pen-label mb-1.5">{day}</div>
                  {rows.map((s) => (
                    <div key={s.id} className="pen-row px-2.5 py-3" data-active={s.id === activeId}
                         onClick={() => { openSession(s.id); setTab('note'); setChatOpen(false) }}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="pen-row-title min-w-0 flex-1 text-[14.5px] font-medium leading-snug">
                          {s.title || s.client_name || s.source_name || 'Untitled'}
                        </span>
                        <span className="pen-pill" data-s={s.status}>{s.status === 'held' ? 'needs hours' : s.status}</span>
                      </div>
                      <div className="pen-mono mt-1.5 text-[13px]" style={{ color: 'var(--faint)' }}>
                        {fmtDur(partsOf(s).reduce((n, x) => n + (x.duration_sec ?? 0), 0))}
                        {partsOf(s).length > 1 ? ` · ${partsOf(s).length} parts` : ''}
                        {s.meeting_type ? ` · ${displayType(s.meeting_type).toLowerCase()}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      </div>
    </main>
  )
}

/**
 * Matches the 900px breakpoint the CSS drawer already uses, so layout and behaviour agree.
 * Returns false until mounted — the server has no viewport, and guessing produces a
 * hydration mismatch on the most important screen in the app.
 */
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

/**
 * Who you are signed in as. The mock shows a photo and a first name; an elided email address
 * is a worse answer to the same question, and Google already gives us both.
 */
function Account({ email, name, avatar }: { email: string; name?: string | null; avatar?: string | null }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const label = name?.trim() || email.split('@')[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="pen-acct2" ref={wrap}>
      <button className="pen-acct2-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {avatar ? (
          <Image src={avatar} alt="" width={30} height={30} className="pen-avatar" unoptimized />
        ) : (
          <span className="pen-avatar pen-avatar-fallback">{label.slice(0, 1).toUpperCase()}</span>
        )}
        <span className="pen-acct2-name">{label}</span>
        <Icon name="chevron" size={15} className="pen-acct2-chev" />
      </button>
      {open && (
        <div className="pen-acct2-menu">
          <div className="pen-acct2-email">{email}</div>
          <Link href="/pen/settings" className="pen-acct2-item">
            <Icon name="settings" size={17} />
            Settings
          </Link>
          {isOwner(email) && (
            <Link href="/pen/customers" className="pen-acct2-item">
              <Icon name="people" size={17} />
              Customers
            </Link>
          )}
          <SignOut email={email} />
        </div>
      )}
    </div>
  )
}

/* =============================================================== search */

/**
 * Suggestions are derived from what is actually in the archive, not a fixed list. A prompt
 * that names your own client or your own overdue action is worth clicking; "What did we
 * discuss?" is not.
 */
function searchSuggestions(stats: ArchiveStats | null): string[] {
  const out: string[] = []
  if (stats?.actionsOpen) {
    out.push(`What have I still not done? (${stats.actionsOpen} open)`)
  }
  const client = stats?.clients[0]?.name
  if (client) out.push(`What does ${client} actually want?`)
  const top = stats?.categories.find((c) => c.count > 1)
  if (top) out.push(`Sum up my ${top.label.toLowerCase()} recordings`)
  const person = stats?.peopleMet
  if (out.length < 3 && person) out.push('Who owes me something?')
  for (const f of ['What did I miss this week?', 'What was left unresolved?', 'What did I commit to?']) {
    if (out.length >= 3) break
    if (!out.includes(f)) out.push(f)
  }
  return out.slice(0, 3)
}

function ArchiveSearch({
  value,
  onChange,
  suggestions,
  options,
  onAsk,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  options: Taggable[]
  onAsk: (q: string, mentions: Mention[]) => void
}) {
  const [focused, setFocused] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const tp = useTagPicker({ value, setValue: onChange, field: input, options })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Suggestions appear on focus rather than sitting under the bar permanently. In the header
  // a fixed second row pushed the whole app down for something read once.
  useEffect(() => {
    if (!focused) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [focused])

  return (
    <div className="pen-search-wrap" ref={wrap}>
      <form
        className="pen-search"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) {
            setFocused(false)
            onAsk(value.trim(), tp.take(value))
          }
        }}
      >
        <svg className="pen-search-icon" viewBox="0 0 20 20" aria-hidden>
          <circle cx="8.6" cy="8.6" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12.7 12.7 L17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            tp.sync(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(tp.close, 120)}
          onKeyDown={(e) => {
            if (tp.onKey(e)) return
            if (e.key === 'Escape') setFocused(false)
          }}
          aria-autocomplete="list"
          aria-expanded={tp.open}
          placeholder="Ask anything… type @ for a person or recording"
          aria-label="Ask your archive"
          className="pen-search-input"
        />
        <kbd className="pen-kbd pen-search-kbd">&#8984;K</kbd>
      </form>

      <TagMenu open={tp.open} matches={tp.matches} pick={tp.pick} setPick={tp.setPick} choose={tp.choose} />

      {focused && !tp.open && suggestions.length > 0 && (
        <div className="pen-search-sugg">
          <div className="pen-label px-1 pb-1.5">Try asking</div>
          {suggestions.map((q) => (
            <button
              key={q}
              className="pen-sugg"
              // mousedown, not click: the input's blur would close the panel first.
              onMouseDown={(e) => {
                e.preventDefault()
                setFocused(false)
                onAsk(q, [])
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========================================================== title editing */

/**
 * Click the title to rename it. Optimistic: the new name is on screen before the request
 * goes, and it reverts with a message if the write fails — a rename that silently didn't
 * save is worse than one that visibly didn't.
 */
function TitleEdit({
  title,
  onSave,
}: {
  title: string
  onSave: (next: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [failed, setFailed] = useState(false)
  // The new name is on screen before the request goes. `optimistic` holds it until the prop
  // catches up, and is thrown away if the write fails.
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // A textarea, not an input: titles here run two lines at this size, and a single-line box
  // scrolls the text out of sight exactly when you are trying to read what you're renaming.
  function autoSize(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    setDraft(title)
    setOptimistic((o) => (o === null || o === title ? null : o))
  }, [title])
  useEffect(() => {
    if (editing)
      requestAnimationFrame(() => {
        autoSize(inputRef.current)
        inputRef.current?.select()
      })
  }, [editing])

  async function commit() {
    const next = draft.trim()
    setEditing(false)
    if (!next || next === title) {
      setDraft(title)
      return
    }
    setFailed(false)
    setOptimistic(next)
    try {
      await onSave(next)
    } catch {
      setOptimistic(null)
      setDraft(title)
      setFailed(true)
      window.setTimeout(() => setFailed(false), 4000)
    }
  }

  const shown = optimistic ?? title

  if (!editing) {
    return (
      <div>
        <button className="pen-title" onClick={() => setEditing(true)} title="Click to rename">
          <span>{shown}</span>
          <svg className="pen-title-pen" viewBox="0 0 16 16" aria-hidden>
            <path d="M11.2 2.6l2.2 2.2-7.5 7.5-2.9.7.7-2.9 7.5-7.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
        {failed && (
          <div className="pen-mono mt-1 text-[13px]" style={{ color: 'var(--bad)' }}>
            Rename didn&rsquo;t save — the old name is back.
          </div>
        )}
      </div>
    )
  }

  return (
    <textarea
      ref={inputRef}
      className="pen-title-input"
      rows={1}
      value={draft}
      maxLength={140}
      onChange={(e) => {
        setDraft(e.target.value)
        autoSize(e.target)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void commit()
        }
        if (e.key === 'Escape') {
          setDraft(title)
          setEditing(false)
        }
      }}
    />
  )
}

/* ======================================================= category picker */

/**
 * Replaces the old three-option select. The categoriser proposes; this is the override, and
 * it accepts anything the user types rather than forcing a bad fit from a closed list.
 */
function CategoryPicker({
  value,
  onPick,
  busy,
}: {
  value: string | null
  onPick: (v: string) => void
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  return (
    <div className="pen-catpick">
      <button className="pen-catpick-btn" data-empty={!value} disabled={busy} onClick={() => setOpen((v) => !v)}>
        {busy ? 'Working…' : value || 'Set a category'}
        <span className="pen-catpick-chev" aria-hidden>{open ? '\u2039' : '\u203A'}</span>
      </button>

      {open && (
        <div className="pen-catpick-menu">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const v = custom.trim()
              if (!v) return
              setCustom('')
              setOpen(false)
              onPick(v)
            }}
          >
            <input
              className="pen-catpick-input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type your own…"
              maxLength={40}
              autoFocus
            />
          </form>
          <div className="pen-catpick-list">
            {COMMON_TYPES.map((t) => (
              <button
                key={t}
                className="pen-catpick-opt"
                data-active={value === t}
                onClick={() => {
                  setOpen(false)
                  onPick(t)
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================== import tray */

function ImportTray({
  pending, setPending, penName, consent, setConsent, people, callPeople, setCallPeople, progress, onImport, phone, onClose, done,
}: {
  pending: Pending[]
  setPending: React.Dispatch<React.SetStateAction<Pending[]>>
  penName: string | null
  consent: boolean
  setConsent: (v: boolean) => void
  people: PersonCard[]
  callPeople: Picked[]
  setCallPeople: (v: Picked[]) => void
  progress: Progress | null
  onImport: () => void
  phone?: boolean
  onClose?: () => void
  /** Set once the import finished, so the sheet can end on a promise rather than a blank. */
  done?: boolean
}) {
  // On a phone this is a full-screen sheet with one job. The desktop tray assumes you have
  // just plugged the pen in and are triaging a batch; a phone user has finished one meeting
  // and wants that one file in, so the multi-select, the client field and the inline progress
  // bar are all in the way. Same handlers, different shape.
  if (phone) {
    const picked = pending.filter((p) => p.picked)
    return (
      <div className="pen-imp" role="dialog" aria-modal="true" aria-label="Add a recording">
        <div className="pen-imp-head">
          <span className="pen-label">Add a recording</span>
          <button className="pen-imp-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="pen-imp-body">
          {done ? (
            <div className="pen-imp-done">
              <div className="pen-imp-tick" aria-hidden>&#10003;</div>
              <h3 className="pen-display text-[26px] leading-tight">We&rsquo;ll email you when it&rsquo;s ready.</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
                Transcribing and writing up takes a few minutes. You can close this — the
                briefing lands in your inbox on its own.
              </p>
            </div>
          ) : progress ? (
            <div className="pen-imp-progress">
              <div className="pen-imp-pct">{Math.round(progress.pct)}%</div>
              <div className="pen-meter-bar"><span style={{ width: `${progress.pct}%` }} /></div>
              <p className="mt-3 text-[14.5px]" style={{ color: 'var(--soft)' }}>{progress.phase}</p>
              <p className="pen-mono mt-1 truncate text-[13px]" style={{ color: 'var(--faint)' }}>{progress.name}</p>
              <p className="pen-imp-warn">Keep this tab open until it finishes &mdash; leaving Safari stops the upload.</p>
            </div>
          ) : (
            <>
              <ul className="pen-imp-files">
                {pending.map((p, i) => (
                  <li key={`${p.file.name}-${i}`}>
                    <div className="min-w-0">
                      <div className="truncate text-[16.5px]">{p.file.name}</div>
                      <div className="pen-mono text-[13px]" style={{ color: 'var(--dim)' }}>
                        {fmtMB(p.file.size)} &middot; {new Date(p.file.lastModified).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      className="pen-imp-drop"
                      onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${p.file.name}`}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>

              {/* Deliberately a switch, not a checkbox in a paragraph. In Florida this is a
                  felony question, and it is the one thing here that should not be easy to
                  flick past without reading. */}
              <button
                className="pen-consent"
                data-on={consent}
                onClick={() => setConsent(!consent)}
                role="switch"
                aria-checked={consent}
              >
                <span className="pen-consent-track"><span className="pen-consent-knob" /></span>
                <span className="pen-consent-text">
                  Everyone recorded agreed to it, and this contains no patient or medical information.
                </span>
              </button>
            </>
          )}
        </div>

        {!done && !progress && (
          <div className="pen-imp-foot">
            <button className="pen-btn pen-btn-accent w-full justify-center" onClick={onImport} disabled={!picked.length}>
              {picked.length > 1 ? `Add ${picked.length} recordings` : 'Add recording'}
            </button>
            <p className="pen-imp-foot-note">You can name who it was with afterwards.</p>
          </div>
        )}

        {done && (
          <div className="pen-imp-foot">
            <button className="pen-btn pen-btn-primary w-full justify-center" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="pen-panel mt-6 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="pen-display text-[21px]">
          {penName ? `${pending.length} on “${penName}”` : 'Ready to import'}
        </h2>
        {pending.length > 0 && (
          <button className="pen-mono text-[13px] underline" style={{ color: 'var(--dim)' }} onClick={() => setPending([])}>
            clear
          </button>
        )}
      </div>

      <ul className="mt-4">
        {pending.map((p, i) => (
          <li key={`${p.file.name}-${i}`} className="flex items-center gap-3 border-t py-2.5" style={{ borderColor: 'var(--hair)' }}>
            <input type="checkbox" className="pen-act-box" checked={p.picked}
                   onChange={(e) => setPending((prev) => prev.map((x, j) => (j === i ? { ...x, picked: e.target.checked } : x)))} />
            <span className="min-w-0 flex-1 truncate text-[14.5px]">{p.file.name}</span>
            <span className="pen-mono text-[13px]" style={{ color: 'var(--dim)' }}>{fmtMB(p.file.size)}</span>
            <span className="pen-mono text-[13px]" style={{ color: 'var(--faint)' }}>
              {new Date(p.file.lastModified).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="block">
          <span className="pen-label">Who was on this call (optional)</span>
          <div className="mt-1.5">
            <PeoplePicker people={people} value={callPeople} onChange={setCallPeople} />
          </div>
          <span className="mt-1 block text-[13px]" style={{ color: 'var(--faint)' }}>
            Leave it empty and the notes will suggest who they heard.
          </span>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg p-3.5" style={{ background: 'var(--warn-wash)', border: '1px solid #EFE2C4' }}>
          <input type="checkbox" className="pen-act-box mt-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-[14.5px] leading-snug" style={{ color: 'var(--warn)' }}>
            Everyone recorded agreed to it, and this recording contains no patient or medical information.
          </span>
        </label>
      </div>

      {progress ? (
        <div className="mt-5">
          <div className="pen-mono flex justify-between text-[13px]" style={{ color: 'var(--soft)' }}>
            <span className="truncate">{progress.name}</span>
            <span>{progress.phase}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress.pct}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      ) : (
        <button className="pen-btn pen-btn-accent mt-5" onClick={onImport} disabled={!pending.some((p) => p.picked)}>
          Import {pending.filter((p) => p.picked).length || ''} and transcribe
        </button>
      )}
    </section>
  )
}

/**
 * A later part of a meeting the pen split, shown inline under the first.
 *
 * It keeps its own edit state and saves to its own recording: transcript corrections are an
 * overlay keyed by utterance index, and index 7 of part two is a different line from index 7
 * of part one. Merging the overlays would quietly rewrite the wrong sentences.
 */
function PartTranscript({ part, onUpdateNotes }: { part: PenSession; onUpdateNotes: () => void }) {
  const [edits, setEdits] = useState<Record<string, string>>(part.transcript_edits ?? {})
  const [map, setMap] = useState<SpeakerMap | null>((part.speaker_map as SpeakerMap | null) ?? null)
  const [translation, setTranslation] = useState(part.translation ?? null)
  const [showTr, setShowTr] = useState(false)
  const [state, setState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const dirty = useRef(false)

  useEffect(() => {
    setEdits(part.transcript_edits ?? {})
    setMap((part.speaker_map as SpeakerMap | null) ?? null)
    setTranslation(part.translation ?? null)
    setShowTr(false)
    setState('saved')
    dirty.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.id])

  useEffect(() => {
    if (!dirty.current) return
    setState('saving')
    const t = setTimeout(async () => {
      try {
        await patchJson(`/api/pen/sessions/${part.id}`, { transcript_edits: edits })
        setState('saved')
      } catch {
        setState('failed')
      }
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits])

  const utts = part.transcript?.utterances ?? []
  if (!utts.length) {
    return part.transcript?.text
      ? <p className="whitespace-pre-wrap text-[16.5px] leading-relaxed">{part.transcript.text}</p>
      : <Muted>This part has no transcript yet.</Muted>
  }
  return (
    <>
      <SpeakerNames
        sessionId={part.id}
        utterances={utts}
        initialMap={(part.speaker_map as SpeakerMap | null) ?? null}
        language={part.language ?? null}
        translation={translation}
        showTranslation={showTr}
        onMap={setMap}
        onTranslation={setTranslation}
        onShowTranslation={setShowTr}
        onUpdateNotes={onUpdateNotes}
      />
      <TranscriptEditor
        utterances={utts}
        edits={edits}
        saveState={state}
        speakerMap={map}
        translation={showTr ? translation?.utterances : null}
        onEdit={(i, text) => { dirty.current = true; setEdits((prev) => ({ ...prev, [String(i)]: text })) }}
      />
    </>
  )
}

/* =================================================================== detail */

function Detail({
  session, tab, setTab, chatOpen, onToggleChat, onNotes, onDelete, onPatch, askCategory, selfEmail, onBack,
  parts, onSplit, splitting, onPeopleChanged,
}: {
  session: PenSession
  /** People on this recording changed; the @ picker's list needs refreshing. */
  onPeopleChanged: () => void
  /** Every part of this meeting, in order. Just `[session]` when the pen didn't split it. */
  parts: PenSession[]
  /** Unpicks a join. The parts keep their own audio and transcripts, so nothing is lost. */
  onSplit: () => void
  splitting: boolean
  tab: 'note' | 'transcript'
  setTab: (t: 'note' | 'transcript') => void
  chatOpen: boolean
  onToggleChat: () => void
  onNotes: (type?: MeetingType) => void
  /** Present when the categoriser wasn't confident enough to commit; its runners-up. */
  askCategory?: string[]
  /** The signed-in address — named in the briefing recipients popover. */
  selfEmail: string
  onBack: () => void
  onDelete: () => void
  onPatch: (p: Partial<Pick<PenSession, 'user_notes' | 'title' | 'client_name' | 'action_done' | 'note_blocks' | 'transcript_edits' | 'briefing_sent_at'>>) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<SheetRequest | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => setConfirmDelete(false), [session.id])

  // Note blocks. Keyed off session.id ONLY — including the server copy in the deps would
  // reset the editor mid-typing every time an autosave round-tripped.
  const [blocks, setBlocks] = useState<NoteBlock[]>(() => blocksFrom(session.note_blocks, session.user_notes))
  const [notesState, setNotesState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const dirtyNotes = useRef(false)
  useEffect(() => {
    setBlocks(blocksFrom(session.note_blocks, session.user_notes))
    setNotesState('saved')
    dirtyNotes.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])
  useEffect(() => {
    if (!dirtyNotes.current) return
    setNotesState('saving')
    const t = setTimeout(async () => {
      try { await onPatch({ note_blocks: blocks }); setNotesState('saved') }
      catch { setNotesState('failed') }
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks])

  // Transcript corrections, same pattern.
  const [tEdits, setTEdits] = useState<Record<string, string>>(session.transcript_edits ?? {})
  const [speakerMap, setSpeakerMap] = useState<SpeakerMap | null>((session.speaker_map as SpeakerMap | null) ?? null)
  const [translation, setTranslation] = useState(session.translation ?? null)
  const [showTr, setShowTr] = useState(false)
  const [tState, setTState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const dirtyT = useRef(false)
  useEffect(() => {
    setTEdits(session.transcript_edits ?? {})
    setSpeakerMap((session.speaker_map as SpeakerMap | null) ?? null)
    setTranslation(session.translation ?? null)
    setShowTr(false)
    setTState('saved')
    dirtyT.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])
  useEffect(() => {
    if (!dirtyT.current) return
    setTState('saving')
    const t = setTimeout(async () => {
      try { await onPatch({ transcript_edits: tEdits }); setTState('saved') }
      catch { setTState('failed') }
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tEdits])

  const n: PenNotes = session.notes ?? {}
  const utts = session.transcript?.utterances ?? []
  const joined = parts.length > 1
  // A joined meeting is measured end to end, not by whichever part you happen to be looking
  // at — the whole point of the join is that it is one meeting.
  const totalSec = parts.reduce((t, x) => t + (x.duration_sec ?? 0), 0)
  // People, not labels: "Same person as Speaker A" in Who's who counts once. Split meetings
  // keep the old count, since labels restart in each part.
  const speakerCount = useMemo(
    () =>
      parts.length === 1
        ? speakersIn(parts[0].transcript?.utterances ?? [], speakerMap).length
        : new Set(parts.flatMap((x) => (x.transcript?.utterances ?? []).map((u) => u.speaker))).size,
    [parts, speakerMap],
  )
  const done = new Set(Array.isArray(session.action_done) ? session.action_done : [])

  async function toggleAction(i: number) {
    const next = new Set(done)
    next.has(i) ? next.delete(i) : next.add(i)
    await onPatch({ action_done: Array.from(next) })
  }

  async function regenerate(type?: MeetingType) {
    setBusy(true)
    await onNotes(type)
    setBusy(false)
  }

  return (
    <div className="min-w-0">
      {/* --------------------------------------------------------- header */}
      <button className="pen-back" onClick={onBack}>
        <Icon name="back" size={17} />
        All recordings
      </button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[280px]">
          <TitleEdit
            title={session.title || n.headline || session.source_name || 'Untitled'}
            onSave={(next) => onPatch({ title: next })}
          />
          {/* Icons rather than a row of interchangeable grey strings — you can tell the
              date from the duration from the category without reading any of them. */}
          <div className="pen-meta">
            <span className="pen-meta-bit">
              <Icon name="calendar" size={15} />
              {session.recorded_at ? new Date(session.recorded_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
            </span>
            <span className="pen-meta-bit">
              <Icon name="clock" size={15} />
              {fmtDur(totalSec)}
            </span>
            {joined && (
              <span className="pen-meta-bit">
                <Icon name="link" size={15} />
                {parts.length} parts
              </span>
            )}
            {!!displayType(session.meeting_type) && (
              <span className="pen-meta-bit">
                <Icon name="tag" size={15} />
                {displayType(session.meeting_type)}
              </span>
            )}
            {speakerCount > 0 && (
              <span className="pen-meta-bit">
                <Icon name="people" size={15} />
                {speakerCount} {speakerCount === 1 ? 'speaker' : 'speakers'}
              </span>
            )}
            {session.client_name && (
              <span className="pen-meta-bit">
                <Icon name="personal" size={15} />
                {session.client_name}
              </span>
            )}
          </div>

          {/* State, as labelled chips rather than one status word. */}
          <div className="pen-chips">
            {n.summary && (
              <span className="pen-chip" data-tone="accent"><Icon name="sparkle" size={14} filled />AI summarised</span>
            )}
            {utts.length > 0 && (
              <span className="pen-chip"><Icon name="check" size={14} />{session.source_channel === 'import' ? 'Imported' : 'Transcribed'}</span>
            )}
            {session.status === 'transcribing' && (
              <span className="pen-chip" data-tone="warn"><Icon name="clock" size={14} />Transcribing</span>
            )}
            {session.status === 'noting' && (
              <span className="pen-chip" data-tone="warn"><Icon name="sparkle" size={14} filled />Writing notes</span>
            )}
            {session.status === 'error' && (
              <span className="pen-chip" data-tone="bad"><Icon name="alert" size={14} />Something failed</span>
            )}
            {session.status === 'held' && (
              <span className="pen-chip" data-tone="warn"><Icon name="clock" size={14} />Waiting for hours</span>
            )}
          </div>

          {joined && (
            <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              The pen hit its 60-minute file limit, so this meeting arrived in {parts.length} pieces.
              They are read as one — both recordings are still here.{' '}
              <button
                className="underline"
                disabled={splitting}
                onClick={onSplit}
                style={{ color: 'var(--soft)' }}
              >
                {splitting ? 'Separating…' : 'Separate them again'}
              </button>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Keyed off the transcript, not the status. A session can land in `error` with a
              perfectly good transcript (a failed save, a transient API error), and gating the
              retry on status left it with no way out of the UI. */}
          {utts.length > 0 && (
            <button className="pen-btn" onClick={() => regenerate()} disabled={busy}>
              {busy ? 'Working…' : session.status === 'noted' ? 'Redo notes' : 'Write the notes'}
            </button>
          )}
          {utts.length > 0 && (
            <button className={`pen-btn ${chatOpen ? 'pen-btn-accent' : ''}`} onClick={onToggleChat}>
              {chatOpen ? 'Hide chat' : 'Ask this meeting'}
            </button>
          )}
          <SendBriefing
            selfEmail={selfEmail}
            sessionId={session.id}
            sentAt={session.briefing_sent_at}
            disabled={!n.summary && !n.actions?.length && !n.missed?.length && !n.open_questions?.length}
            onSent={(iso) => void onPatch({ briefing_sent_at: iso })}
          />
          {/* Two-step, inline. Deletion takes the audio with it and cannot be undone, so it
              asks — but a modal for one row would be heavier than the action deserves. */}
          {confirmDelete ? (
            <span className="pen-confirm">
              <span>Delete for good?</span>
              <button className="pen-confirm-no" onClick={() => setConfirmDelete(false)}>Keep</button>
              <button className="pen-confirm-yes" onClick={onDelete}>Delete</button>
            </span>
          ) : (
            <button className="pen-btn pen-btn-quiet" onClick={() => setConfirmDelete(true)} title="Delete this recording and its audio">
              Delete
            </button>
          )}
        </div>
      </div>

      {session.error_text && <Banner tone="bad">{session.error_text}</Banner>}

      {/* ----------------------------------------------------------- tabs */}
      <div className="pen-tabrow mt-5 flex items-center justify-between gap-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex gap-1">
          {(['note', 'transcript'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="pen-mono px-3 py-2.5 text-[13px] uppercase tracking-wider"
                    style={{
                      color: tab === t ? 'var(--accent-ink)' : 'var(--dim)',
                      borderBottom: tab === t ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                      marginBottom: -1,
                    }}>
              {t}{t === 'transcript' && utts.length ? ` ${utts.length}` : ''}
            </button>
          ))}
        </div>
        {utts.length > 0 && (
          <div className="pen-tabrow-cat flex items-center gap-2 pb-1.5">
            <span className="pen-label">Category</span>
            <CategoryPicker
              value={displayType(session.meeting_type) || null}
              busy={busy}
              onPick={(v) => regenerate(v)}
            />
            {askCategory && !session.meeting_type && (
              <span className="pen-mono text-[13px]" style={{ color: 'var(--warn)' }}>
                not sure what this was
                {askCategory.length > 0 && (
                  <>
                    {' — '}
                    {askCategory.slice(0, 2).map((a, i) => (
                      <span key={a}>
                        {i > 0 && ' or '}
                        <button className="underline" onClick={() => regenerate(a)}>{a}</button>
                      </span>
                    ))}
                    ?
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {tab === 'transcript' ? (
        <div className="pen-panel mt-6 p-6">
          {utts.length ? (
            <>
              <SpeakerNames
                sessionId={session.id}
                utterances={utts}
                initialMap={(session.speaker_map as SpeakerMap | null) ?? null}
                language={session.language ?? null}
                translation={translation}
                showTranslation={showTr}
                onMap={setSpeakerMap}
                onTranslation={setTranslation}
                onShowTranslation={setShowTr}
                onUpdateNotes={() => regenerate()}
              />
              <TranscriptEditor
                utterances={utts}
                edits={tEdits}
                saveState={tState}
                speakerMap={speakerMap}
                translation={showTr ? translation?.utterances : null}
                onEdit={(i, text) => { dirtyT.current = true; setTEdits((prev) => ({ ...prev, [String(i)]: text })) }}
              />
            </>
          ) : session.transcript?.text ? (
            <p className="whitespace-pre-wrap text-[16.5px] leading-relaxed">{session.transcript.text}</p>
          ) : (
            <Muted>No transcript yet.</Muted>
          )}

          {/* The later parts, in place, so the transcript reads straight through. Each one
              still saves its corrections to its own recording — the overlay is keyed by
              utterance index, and the indexes only mean anything within one file. */}
          {parts.slice(1).map((part, i) => (
            <div key={part.id} className="mt-8">
              <div className="pen-seam">
                <span className="pen-label">
                  Part {i + 2} · new file at {fmtDur(parts.slice(0, i + 1).reduce((t, x) => t + (x.duration_sec ?? 0), 0))}
                </span>
              </div>
              <p className="mb-4 mt-2 text-[14px]" style={{ color: 'var(--faint)' }}>
                Speakers are labelled fresh in each file, so “Speaker A” here may be someone else
                than “Speaker A” above. The notes above already account for that.
              </p>
              <PartTranscript part={part} onUpdateNotes={() => regenerate()} />
            </div>
          ))}
        </div>
      ) : (
        <div className="pen-doc pen-reveal mt-7">
          {/* His own notes come first on purpose: what he wrote is the spine. */}
          <div className="pen-sec">
            <NoteEditor
              sessionId={session.id}
              blocks={blocks}
              saveState={notesState}
              canEnhance={utts.length > 0}
              onChange={(next) => { dirtyNotes.current = true; setBlocks(next) }}
            />
          </div>

          {session.status === 'transcribing' && <div className="pen-sec"><Muted>Transcribing. This runs on its own — you can close the tab.</Muted></div>}
          {session.status === 'uploaded' && <div className="pen-sec"><Muted>Uploaded, waiting to be sent for transcription.</Muted></div>}
          {session.status === 'held' && (
            <div className="pen-sec">
              <Muted>
                {"Saved, and waiting for recording time. It will be transcribed automatically once you add hours or the month resets. "}
                <Link href="/pen/settings/hours" className="underline">Buy hours</Link>
              </Muted>
            </div>
          )}
          {utts.length > 0 && !n.summary && session.status !== 'transcribing' && (
            <div className="pen-sec">
              <Muted>
                {session.status === 'error'
                  ? 'The transcript came through but the notes failed. Press “Write the notes” to try again.'
                  : 'Transcript is ready. Press “Write the notes”.'}
              </Muted>
            </div>
          )}

          {n.summary && (
            <div className="pen-aicard">
              <div className="pen-aicard-head">
                <span className="pen-aicard-title">
                  <Icon name="sparkle" size={18} filled />
                  AI meeting summary
                </span>
                <span className="pen-aicard-by">Generated by AI</span>
              </div>
              <p className="pen-aicard-body">{n.summary}</p>
            </div>
          )}

          {/* Still open / decided / to do, side by side as in the mock. Three short lists
              stacked vertically read as one long undifferentiated column; side by side you can
              see at a glance whether a meeting produced decisions, work, or neither.
              Still open leads so the unresolved thing sits directly under the summary, rather
              than last — it is the part most likely to need acting on. */}
          {(!!n.decisions?.length || !!n.actions?.length || !!n.open_questions?.length) && (
            <div className="pen-trio">
            {!!n.open_questions?.length && (
              <div className="pen-sec pen-card">
                <span className="pen-sec-head"><span className="pen-badge" data-tone="warn"><Icon name="question" size={13} /></span>Still open</span>
                <ul className="mt-2 list-disc space-y-2.5 pl-5 text-[16.5px]">
                  {n.open_questions.map((q, i) => (
                    <li key={i} className="pen-doable">
                      {q}
                      <div className="mt-1.5">
                        <DeliverableActions onPick={(kind) => setSheet({ kind, item: q })} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!n.decisions?.length && (
              <div className="pen-sec pen-card">
                <span className="pen-sec-head"><span className="pen-badge" data-tone="good"><Icon name="check" size={13} /></span>Decided</span>
                <ul className="mt-2 space-y-2">
                  {n.decisions.map((d, i) => (
                    <li key={i} className="text-[16.5px]">
                      {d.decision}
                      {d.who && <span className="pen-mono ml-2 text-[13px]" style={{ color: 'var(--dim)' }}>{d.who}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!n.actions?.length && (
              <div className="pen-sec pen-card">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="pen-sec-head"><span className="pen-badge" data-tone="accent"><Icon name="checklist" size={13} /></span>Next actions</span>
                  <span className="pen-mono text-[13px]" style={{ color: 'var(--faint)' }}>
                    {done.size}/{n.actions.length} done
                  </span>
                </div>
                <div className="mt-1.5">
                  {n.actions.map((a, i) => (
                    <div key={i} className="pen-act pen-doable" data-done={done.has(i)}>
                      <input type="checkbox" className="pen-act-box" checked={done.has(i)} onChange={() => toggleAction(i)} />
                      <div className="min-w-0 flex-1">
                        <div className="pen-act-text text-[16.5px] leading-snug">{a.action}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {(a.owner || a.due || a.priority === 'high') && (
                            <div className="pen-mono flex flex-wrap items-center gap-x-2 text-[13px]" style={{ color: 'var(--dim)' }}>
                              {a.priority === 'high' && <span style={{ color: 'var(--bad)' }}>PRIORITY</span>}
                              {a.owner && <span>{a.owner}</span>}
                              {a.due && <span style={{ color: 'var(--accent-ink)' }}>{a.due}</span>}
                            </div>
                          )}
                          <DeliverableActions onPick={(kind) => setSheet({ kind, item: a.action })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          )}

          <PeoplePanel sessionId={session.id} notes={n} status={session.status} onChanged={onPeopleChanged} />

          {!!n.missed?.length && (
            <div className="pen-sec">
              <div className="pen-missed p-5">
                <span className="pen-label" style={{ color: 'var(--warn)' }}>You might have missed</span>
                <ul className="mt-2.5 space-y-3">
                  {n.missed.map((m, i) => (
                    <li key={i} className="pen-doable text-[16.5px] leading-snug">
                      {m.item}
                      {m.why && <div className="mt-0.5 text-[14.5px]" style={{ color: 'var(--warn)' }}>{m.why}</div>}
                      <div className="mt-1.5">
                        <DeliverableActions onPick={(kind) => setSheet({ kind, item: m.item })} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          

          

          {isViewing(session.meeting_type ?? n.meeting_type) && n.showing && <ShowingBlock showing={n.showing} />}
        </div>
      )}

      <DeliverableSheet request={sheet} sessionId={session.id} onClose={() => setSheet(null)} />
    </div>
  )
}

function ShowingBlock({ showing }: { showing: NonNullable<PenNotes['showing']> }) {
  return (
    <>
      {!!showing.reactions?.length && (
        <div className="pen-sec">
          <span className="pen-label">Room by room</span>
          <ul className="mt-2 space-y-2.5">
            {showing.reactions.map((r, i) => (
              <li key={i} className="text-[16.5px]">
                <span className="font-medium capitalize">{r.feature}</span>
                <span style={{ color: 'var(--dim)' }}> · {r.who} · </span>
                <span style={{ color: sentimentColor(r.sentiment) }}>{r.sentiment}</span>
                {r.quote && <div className="mt-0.5 text-[14.5px] italic" style={{ color: 'var(--soft)' }}>“{r.quote}”</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!showing.objections?.length && (
        <div className="pen-sec">
          <span className="pen-label">Objections</span>
          <ul className="mt-2 space-y-2.5">
            {showing.objections.map((o, i) => (
              <li key={i} className="text-[16.5px]">
                {o.objection}<span style={{ color: 'var(--dim)' }}> · {o.who}</span>
                {o.quote && <div className="mt-0.5 text-[14.5px] italic" style={{ color: 'var(--soft)' }}>“{o.quote}”</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!showing.signals?.length && (
        <div className="pen-sec">
          <span className="pen-label">Buying signals</span>
          <ul className="mt-2 space-y-2">
            {showing.signals.map((s, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[16.5px]">
                <span className="pen-pill" data-s={s.strength === 'strong' ? 'noted' : 'uploaded'}>{s.strength}</span>
                <span>{s.signal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!showing.revealed_criteria?.length && (
        <div className="pen-sec">
          <div className="rounded-[10px] p-5" style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)' }}>
            <span className="pen-label" style={{ color: 'var(--accent-ink)' }}>What they actually want</span>
            <p className="mb-2 mt-1 text-[14.5px]" style={{ color: 'var(--soft)' }}>
              Inferred from what they reacted to, not from what they said.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[16.5px]">
              {showing.revealed_criteria.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

/* ==================================================================== chat */

function ChatPanel({ session, onChat, onClose }: { session: PenSession; onChat: (s: PenSession) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const chat: ChatTurn[] = Array.isArray(session.chat) ? session.chat : []

  useEffect(() => {
    // Kept client-side so the panel needs no extra round trip to render its starters.
    // Categories are free-form now, so match on what the words mean rather than on an enum.
    const t = session.meeting_type ?? session.notes?.meeting_type ?? ''
    if (isViewing(t)) setSuggestions(['What did they actually like?', 'What were the objections?', 'Did they say they’d come back?'])
    else if (/clinic|patient|ward|admin|round/i.test(t)) setSuggestions(['What needs doing today?', 'Who owes me something?', 'What did I agree to follow up on?'])
    else setSuggestions(['What did I commit to?', 'What did I miss?', 'Was anything left unresolved?'])
  }, [session.id, session.meeting_type, session.notes?.meeting_type])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat.length, thinking])

  async function ask(question: string) {
    if (!question.trim() || thinking) return
    setError(null)
    setThinking(true)
    setQ('')
    try {
      const j = await postJson<{ chat: ChatTurn[] }>('/api/pen/chat', { id: session.id, question })
      onChat({ ...session, chat: j.chat })
    } catch (e) {
      setError(errMessage(e, 'Could not get an answer.'))
    } finally {
      setThinking(false)
    }
  }

  async function reset() {
    await fetch('/api/pen/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.id, reset: true }),
    })
    onChat({ ...session, chat: [] })
  }

  return (
    <aside className="pen-panel flex max-h-[76vh] flex-col overflow-hidden xl:sticky xl:top-6">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
        <span className="pen-label">Ask this meeting</span>
        <div className="flex items-center gap-3">
          {chat.length > 0 && (
            <button className="pen-mono text-[13px] underline" style={{ color: 'var(--dim)' }} onClick={reset}>clear</button>
          )}
          <button className="pen-mono text-[14.5px] leading-none xl:hidden" style={{ color: 'var(--dim)' }} onClick={onClose}>×</button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {chat.length === 0 && (
          <p className="text-[16.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
            Answers come only from this recording. If it isn’t in there, it’ll say so rather than guess.
          </p>
        )}
        {chat.map((t, i) => (
          <div key={i} className="pen-chat-msg px-3.5 py-2.5 text-[14.5px] leading-relaxed" data-role={t.role}>
            {t.content}
          </div>
        ))}
        {thinking && (
          <div className="pen-chat-msg px-3.5 py-3" data-role="assistant">
            <span className="pen-dots"><span /><span /><span /></span>
          </div>
        )}
        {error && <p className="text-[14.5px]" style={{ color: 'var(--bad)' }}>{error}</p>}
        <div ref={endRef} />
      </div>

      {chat.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {suggestions.map((s) => (
            <button key={s} className="pen-chip" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      )}

      <form className="flex items-end gap-2 border-t px-3 py-3" style={{ borderColor: 'var(--line)' }}
            onSubmit={(e) => { e.preventDefault(); ask(q) }}>
        <textarea
          value={q} onChange={(e) => setQ(e.target.value)} rows={1}
          placeholder="Ask about this meeting…"
          className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border px-3 py-2 text-[14.5px] outline-none"
          style={{ borderColor: 'var(--line)', background: 'var(--panel)', fontFamily: 'var(--serif)' }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q) } }}
        />
        <button type="submit" className="pen-btn pen-btn-accent" disabled={thinking || !q.trim()}>Ask</button>
      </form>
    </aside>
  )
}

/* ================================================================= helpers */

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-[14.5px]" style={{ color: 'var(--dim)' }}>{children}</p>
}

function Banner({ children, tone, onClose }: { children: React.ReactNode; tone: 'bad' | 'warn'; onClose?: () => void }) {
  const bad = tone === 'bad'
  return (
    <div className="mt-4 flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-[14.5px]"
         style={{
           background: bad ? 'var(--bad-wash)' : 'var(--warn-wash)',
           color: bad ? 'var(--bad)' : 'var(--warn)',
           border: `1px solid ${bad ? '#EFD6D2' : '#EFE2C4'}`,
         }}>
      <div>{children}</div>
      {onClose && <button onClick={onClose} className="pen-mono shrink-0 text-[16.5px] leading-none">×</button>}
    </div>
  )
}

function initials(s: string) {
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

function sentimentColor(s: string) {
  if (s === 'loved') return 'var(--good)'
  if (s === 'liked') return '#4E7A5C'
  if (s === 'disliked') return 'var(--bad)'
  return 'var(--soft)'
}

function groupByDay(sessions: PenSession[]): [string, PenSession[]][] {
  const map = new Map<string, PenSession[]>()
  for (const s of sessions) {
    const key = new Date(s.recorded_at ?? s.created_at).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return Array.from(map.entries())
}

/** fetch() gives no upload progress, and these files are big enough that it matters. */
function putWithProgress(url: string, blob: Blob, mime: string, onPct: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
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
