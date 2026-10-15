'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
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
import NotionImport from './NotionImport'
import Tour from './Tour'
import { speakersIn, type SpeakerMap } from '@/lib/pen/speakers'
import ChatView from './ChatView'
import DocView from './DocView'
import Overview from './Overview'
import { JunoNoticed, DateChip } from './JunoNoticed'
import SignOut from './SignOut'
import PeoplePanel from './PeoplePanel'
import type { Part as NamePart } from './NamesHeard'
import Conversations from './Conversations'
import { useNames, startSplit, useSplitting } from './names-store'
import { isOwner } from '@/lib/pen/owner'
import PeoplePicker, { type Picked } from './PeoplePicker'
import type { ArchiveStats } from '@/lib/pen/stats'
import DeliverableSheet, { DeliverableActions, type SheetRequest } from './DeliverableSheet'
import SendBriefing from './SendBriefing'
import { prepareAudio, fmtMB, fmtDur, SOFT_SIZE_LIMIT, needsPiecedUpload, durationWithoutDecoding, PIECE_BYTES } from '@/lib/pen/encode'
import { postJson, getJson, patchJson, del, errMessage, PenHttpError } from '@/lib/pen/http'
import type { ChatSummary } from '@/lib/pen/chats'
import type { DocSummary } from '@/lib/pen/docs'
import type { Allowance } from '@/lib/pen/allowance'
import UsageBar from './UsageBar'
import PhoneShell, { type PhoneTab } from './PhoneShell'
import Link from 'next/link'
import { ACCEPT_DESKTOP, acceptFor } from '@/lib/pen/file-accept'
import { findRuns } from '@/lib/pen/merge-detect'
import CombinePicker from './CombinePicker'
import { LangProvider, useCopy, useLang } from './LangContext'
import { APP_COPY, type AppCopy } from './PenApp.copy'
import { typeLabel, bucketLabel, plural, shortDate, fmtDate, LOCALE, type Lang } from '@/lib/pen/i18n'
import { SUPPORT_EMAIL } from '@/lib/support'


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
type UploadItem = { key: string; name: string; phase: string; pct: number; state: 'waiting' | 'working' | 'done' | 'held' | 'error'; error?: string }

export default function PenApp({
  initial,
  suggestions = null,
  stats,
  loadError,
  email,
  name,
  profileName = null,
  avatar,
  allowance: initialAllowance,
  whatsapp,
  appLang = 'en',
  showTour = false,
  showReferral = false,
  showFeedback = false,
  notion = null,
  google = null,
}: {
  /** Null when Google isn't set up on the server; drive = Docs & Sheets connected (lib/pen/google-drive.ts). */
  google?: { drive: boolean } | null
  /** The app's language (Profile "App language"). */
  appLang?: Lang
  /** First sign-in: play the tour once. */
  showTour?: boolean
  /** Show the "give a month, get a month" pop-up once (lib/pen/referrals.ts). */
  showReferral?: boolean
  /** Ask for feedback once, after the 3rd finished recording (lib/pen/feedback.ts). */
  showFeedback?: boolean
  /** Null when Notion isn't set up on the server (lib/pen/notion.ts). */
  notion?: { connected: boolean; sent?: Record<string, string> } | null
  /** Juno Pen's WhatsApp number and whether this account has linked a phone. Null when off. */
  whatsapp?: { number: string; linked: boolean; imessage?: string | null } | null
  /** Home's "Juno is waiting on you", rendered on the server so it doesn't pop in. */
  suggestions?: import('./JunoNoticed').Lists | null
  initial: PenSession[]
  stats: ArchiveStats | null
  allowance: Allowance | null
  loadError: string | null
  name?: string | null
  /** The name from Profile, when set. Home greets by its first word. */
  profileName?: string | null
  avatar?: string | null
  email: string
}) {
  const [sessions, setSessions] = useState<PenSession[]>(initial)
  const T = APP_COPY[appLang]
  // First word of the name, for Home's greeting: Profile's name first, then the session's.
  // "Agustin (Chaska)" -> "Agustin".
  const firstName = (profileName || name)?.trim().split(/\s+/)[0] || null
  const accept = useAccept()
  const router = useRouter()

  const openSession = useCallback((id: string | null) => {
    setView(id ? { k: 'session', id } : { k: 'archive' })
    setNavOpen(false)
  }, [])
  const [pending, setPending] = useState<Pending[]>([])
  const [penName, setPenName] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [eventMode, setEventMode] = useState(false)
  const [callPeople, setCallPeople] = useState<Picked[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [heldNotice, setHeldNotice] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [tab, setTab] = useState<'note' | 'transcript'>('note')
  const [chatOpen, setChatOpen] = useState(false)
  // ?open=<recording id>: a link from outside the app (a Notion page's "Open in Juno") lands on
  // that note. The parameter is dropped afterwards so a reload doesn't keep reopening it.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open')
    if (!id) return
    if (sessions.some((x) => x.id === id)) {
      openSession(id)
      setTab('note')
    }
    const u = new URL(window.location.href)
    u.searchParams.delete('open')
    window.history.replaceState(null, '', u.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The browser's time zone, so WhatsApp reminders and calendar links use the right clock
  // (lib/pen/timezone.ts). Once a day per browser; the server skips it while a zone the user
  // gave on WhatsApp ("in SF until Friday") is still in force.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const key = 'pen-tz-sent'
      const [was, at] = (localStorage.getItem(key) ?? '').split('|')
      if (!tz || (was === tz && Date.now() - Number(at) < 24 * 60 * 60 * 1000)) return
      fetch('/api/pen/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeZone: tz }) })
        .then((r) => r.ok && localStorage.setItem(key, `${tz}|${Date.now()}`))
        .catch(() => {})
    } catch {
      // No Intl zone or no storage: the phone's country code still gives a guess.
    }
  }, [])
  const [view, setView] = useState<View>({ k: 'archive' })
  const [chatSeed, setChatSeed] = useState<{ text: string; mentions: Mention[] } | null>(null)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [docs, setDocs] = useState<DocSummary[]>([])
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const isPhone = useIsPhone()
  // Phone tabs. Opening a recording lands on Recordings, a chat or page on Search, wherever it
  // was opened from (a citation, a Home card), so the back arrow always means one thing.
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('home')
  const [mHist, setMHist] = useState(false)
  const lastChat = useRef<View>({ k: 'chat', id: null })
  useEffect(() => {
    if (view.k === 'session') setPhoneTab('recordings')
    else if (view.k === 'chat' || view.k === 'doc') { setPhoneTab('search'); lastChat.current = view }
  }, [view])
  /** A tab tap. Tapping the tab you're on goes back to its first screen, as apps do. */
  const goTab = (t: PhoneTab) => {
    if (t === 'home' || (t === 'recordings' && (phoneTab === 'recordings' || view.k !== 'session'))) setView({ k: 'archive' })
    if (t === 'search' && view.k !== 'chat' && view.k !== 'doc') setView(lastChat.current)
    if (t === 'search' && phoneTab === 'search') { setChatSeed(null); setView({ k: 'chat', id: null }) }
    setPhoneTab(t)
  }
  // Settings' phone tab bar links back here with ?tab=, since Settings is its own page.
  useEffect(() => {
    if (!isPhone) return
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'home' || t === 'upload' || t === 'recordings' || t === 'search') {
      goTab(t)
      window.history.replaceState(null, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhone])
  // Linked to WhatsApp (or iMessage): the phone's Chat tab opens that chat, where the assistant
  // lives on a phone. Not linked: the web chat, as before.
  const chatLink = whatsapp?.linked
    ? whatsapp.imessage
      ? { href: `sms:+${whatsapp.imessage.replace(/\D/g, '')}`, label: 'iMessage' }
      : { href: `https://wa.me/${whatsapp.number}`, label: 'WhatsApp' }
    : null
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

  // The CATEGORIES group in the sidebar can be folded away; the choice is remembered.
  const [catsOpen, setCatsOpen] = useState(true)
  useEffect(() => {
    try {
      if (window.localStorage.getItem('pen.cats.open') === '0') setCatsOpen(false)
    } catch {}
  }, [])
  const toggleCats = useCallback(() => {
    setCatsOpen((v) => {
      try { window.localStorage.setItem('pen.cats.open', v ? '0' : '1') } catch {}
      return !v
    })
  }, [])

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
  // Until the first fetch lands, "no people yet" would be a lie; the card shows a placeholder.
  const [peopleLoaded, setPeopleLoaded] = useState(false)
  const [txImport, setTxImport] = useState(false)
  const [nImport, setNImport] = useState(false)
  // The tour: once on first sign-in (the account remembers), and from the menu on demand.
  const [tourOpen, setTourOpen] = useState(false)
  useEffect(() => {
    let seenHere = false
    try { seenHere = localStorage.getItem('juno-tour-done') === '1' } catch {}
    if (showTour && !seenHere) setTourOpen(true)
  }, [showTour])
  // The referral pop-up: once per account, after the tour, never for a read-only account.
  const [promoOpen, setPromoOpen] = useState(false)
  useEffect(() => {
    let seenHere = false
    try { seenHere = localStorage.getItem('juno-referral-seen') === '1' } catch {}
    // Localhost only: ?promo=1 shows it again, for reviewing the design.
    const preview = process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).get('promo') === '1'
    if (preview || (showReferral && !seenHere && !initialAllowance?.readOnly)) setPromoOpen(true)
  }, [showReferral, initialAllowance])
  const closePromo = useCallback(() => {
    setPromoOpen(false)
    try { localStorage.setItem('juno-referral-seen', '1') } catch {}
    void fetch('/api/pen/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'referral' }) }).catch(() => {})
  }, [])
  // The feedback pop-up: once, and never on the same visit as the tour or the referral pop-up.
  const [askOpen, setAskOpen] = useState(false)
  useEffect(() => {
    let seenHere = false
    try { seenHere = localStorage.getItem('juno-feedback-seen') === '1' } catch {}
    const preview = process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).get('feedback') === '1'
    if (preview || (showFeedback && !seenHere && !initialAllowance?.readOnly)) setAskOpen(true)
  }, [showFeedback, initialAllowance])
  const closeAsk = useCallback((answered: boolean) => {
    setAskOpen(false)
    try { localStorage.setItem('juno-feedback-seen', '1') } catch {}
    // Answering marks the account on the server; "Not now" has to say so itself.
    if (!answered) void fetch('/api/pen/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'feedback' }) }).catch(() => {})
  }, [])
  const closeTour = useCallback(() => {
    setTourOpen(false)
    try { localStorage.setItem('juno-tour-done', '1') } catch {}
    void fetch('/api/pen/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'tour' }) }).catch(() => {})
  }, [])
  const refreshPeople = useCallback(async () => {
    try {
      setPeople((await getJson<{ people: PersonCard[] }>('/api/pen/people')).people)
    } catch {
      /* same */
    } finally {
      setPeopleLoaded(true)
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

  // Paused (Settings → Billing): reading stays open, adding a recording doesn't.
  const paused = allowance?.pausedUntil ?? null
  // The plan ended (lib/pen/access.ts): same as paused for adding, plus no AI, until reactivated.
  const readOnly = allowance?.readOnly ?? false
  const locked = Boolean(paused) || readOnly
  const [resuming, setResuming] = useState(false)
  async function resumePlan() {
    setResuming(true)
    setErr(null)
    try {
      await postJson('/api/pen/billing/resume', {})
      await Promise.all([loadAllowance(), refresh()])
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setResuming(false)
    }
  }

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
      setErr((await r.json().catch(() => ({}))).error ?? T.deleteFailed)
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
          setErr(errMessage(e, T.notesFailed))
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
    [patchLocal, router, T],
  )

  // Poll anything mid-transcription, and keep a fallback for a webhook that never arrives.
  //
  // The webhook now owns writing the notes, because that is the only path that survives the
  // tab being closed. The browser only steps in if a transcript has been sitting untouched
  // for a while, and when it does it takes the same claim, so the two cannot both run.
  const seenTranscribed = useRef<Record<string, number>>({})
  // The server starts the notes the moment the transcript lands (webhook or poll). This is the
  // last-resort nudge if that somehow didn't happen.
  const WEBHOOK_GRACE_MS = 150_000

  const busyKey = sessions.map((s) => `${s.id}:${s.status}`).join(',')
  useEffect(() => {
    // 'noting' too: the notes are being written on the server, and this is how they appear.
    const watching = sessions.filter((s) => s.status === 'transcribing' || s.status === 'transcribed' || s.status === 'noting')
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

  // Opens the same file picker as "Add audio files". It used to open a folder picker
  // (showDirectoryPicker), which greys out the files themselves, so people with the pen
  // plugged in couldn't see what to pick (9 Oct). Picking the recordings works everywhere.
  function connectPen() {
    if (locked) return
    setErr(null)
    fileInput.current?.click()
  }

  function addFiles(files: FileList | File[]) {
    if (locked) return
    const list = Array.from(files).filter((f) => MEDIA_RE.test(f.name))
    if (!list.length) return setErr(T.notMedia)
    setPenName(null)
    setPending((prev) => [...prev, ...list.map((f) => ({ file: f, picked: true }))])
  }

  /* ----------------------------------------------------------------- import */

  // Uploads run in the background (Carlitos, 5 Oct: ten recordings one by one behind a window
  // that blocks the app is too slow). Import closes the sheet at once; a small card counts the
  // files up while the rest of the app stays usable; two go at a time (one on a phone, where
  // decoding a long recording already uses most of the memory). Transcription, notes and the
  // briefing email were always server-side, so once a file is up nothing waits on this tab.
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const uploading = uploads.some((u) => u.state === 'waiting' || u.state === 'working')
  const patchUpload = useCallback((key: string, patch: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }, [])
  // Closing the tab mid-upload loses the files that haven't gone up: ask first.
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  /** One file: prepare, upload, save, send for transcription. 'held' = saved, waiting for hours. */
  async function uploadOne(file: File, people: Picked[], step: (p: { phase: string; pct: number }) => void, event = false): Promise<'done' | 'held'> {
    const callPeople = people
    // What goes up, and where it lands. Normally the audio is prepared (compressed) in the
    // browser first. A file too big to prepare safely on this device (a long recording on a
    // phone) goes up exactly as it is, in pieces, and the server joins them for AssemblyAI.
    let up: { storage_path: string; mime: string; bytes: number; durationSec: number }
    if (needsPiecedUpload(file)) {
      step({ phase: T.phaseSlot, pct: 5 })
      const durationSec = await durationWithoutDecoding(file)
      const n = Math.ceil(file.size / PIECE_BYTES)
      const urlRes = await fetch('/api/pen/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, parts: n }),
      })
      if (!urlRes.ok) throw new Error((await urlRes.json()).error ?? T.uploadUrlFailed)
      const { storage_path, parts } = (await urlRes.json()) as { storage_path: string; parts: { path: string; signedUrl: string }[] }
      const mime = file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'application/octet-stream')
      for (let i = 0; i < parts.length; i++) {
        const piece = file.slice(i * PIECE_BYTES, (i + 1) * PIECE_BYTES)
        // One retry per piece: a phone on the move drops a request now and then.
        const put = () => putWithProgress(parts[i].signedUrl, piece, 'application/octet-stream', (pct) =>
          step({ phase: T.phasePiece(i + 1, parts.length, fmtMB(file.size)), pct: 5 + ((i + pct / 100) / parts.length) * 70 }),
        )
        await put().catch(put)
      }
      up = { storage_path, mime, bytes: file.size, durationSec }
    } else {
      step({ phase: T.phasePreparing, pct: 5 })
      const prep = await prepareAudio(file)

      step({ phase: T.phaseSlot, pct: 15 })
      const urlRes = await fetch('/api/pen/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, prep.mime === 'audio/wav' ? '.wav' : '') }),
      })
      if (!urlRes.ok) throw new Error((await urlRes.json()).error ?? T.uploadUrlFailed)
      const { path, signedUrl } = (await urlRes.json()) as { path: string; signedUrl: string }

      // Anything compressible has already been compressed by now, so reaching this means
      // either a genuinely enormous recording or a browser with no Opus encoder. Say which,
      // because "split the recording" is useless advice for the second one.
      if (prep.blob.size > SOFT_SIZE_LIMIT) {
        throw new Error(
          prep.mime === 'audio/ogg' ? T.tooBigCompressed(fmtMB(prep.blob.size)) : T.tooBigNoCompress(fmtMB(prep.blob.size)),
        )
      }

      await putWithProgress(signedUrl, prep.blob, prep.mime, (pct) =>
        step({ phase: T.phaseUploading(prep.note), pct: 15 + pct * 0.6 }),
      )
      up = { storage_path: path, mime: prep.mime, bytes: prep.blob.size, durationSec: prep.durationSec }
    }

    step({ phase: T.phaseSaving, pct: 80 })
    const sRes = await fetch('/api/pen/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_path: up.storage_path,
        source_name: file.name,
        mime: up.mime,
        bytes: up.bytes,
        duration_sec: up.durationSec,
        recorded_at: new Date(file.lastModified).toISOString(),
        consent: true,
        // The first person also names the call, which older parts of the app read.
        client_name: callPeople[0]?.name || undefined,
        ...(callPeople.length ? { people: callPeople.map((p) => (p.id ? { id: p.id } : { name: p.name })) } : {}),
        ...(event ? { event_mode: true } : {}),
      }),
    })
    if (!sRes.ok) throw new Error((await sRes.json()).error ?? T.saveRecordingFailed)
    const { session, duplicate } = (await sRes.json()) as { session: PenSession; duplicate: boolean }

    // Not opened: the user is busy elsewhere in the app while these upload.
    setSessions((prev) => [session, ...prev.filter((x) => x.id !== session.id)])

    if (!duplicate) {
      step({ phase: T.phaseSending, pct: 92 })
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
        return 'held'
      }
      if (!tRes.ok) throw new Error((await tRes.json()).error ?? T.transcribeFailed)
      setSessions((prev) => prev.map((x) => (x.id === session.id ? { ...x, status: 'transcribing' as const } : x)))
    }
    return 'done'
  }

  async function importPicked() {
    setErr(null)
    const picked = pending.filter((p) => p.picked)
    if (!picked.length) return
    if (!consent) {
      return setErr(T.consentFirst)
    }
    const people = callPeople
    const event = eventMode
    const batch = picked.map((p, i) => ({ key: `${Date.now()}-${i}-${p.file.name}`, file: p.file }))
    // Finished rows from an earlier batch make way for this one; rows still going stay.
    setUploads((prev) => [
      ...prev.filter((u) => u.state === 'waiting' || u.state === 'working'),
      ...batch.map((b) => ({ key: b.key, name: b.file.name, phase: T.upWaiting, pct: 0, state: 'waiting' as const })),
    ])
    setPending([])
    setCallPeople([])
    setEventMode(false)
    setImportDone(false)

    let next = 0
    const worker = async () => {
      while (next < batch.length) {
        const b = batch[next++]
        patchUpload(b.key, { state: 'working', phase: T.phasePreparing, pct: 2 })
        try {
          const r = await uploadOne(b.file, people, ({ phase, pct }) => patchUpload(b.key, { phase, pct }), event)
          patchUpload(b.key, { state: r, pct: 100 })
        } catch (e) {
          patchUpload(b.key, { state: 'error', error: (e as Error).message })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(isPhone ? 1 : 2, batch.length) }, worker))
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

  // What @ can tag: people first, then recordings by the same title the list shows.
  const taggable = useMemo<Taggable[]>(
    () => [
      ...people.map((p) => ({
        id: p.id,
        kind: 'person' as const,
        title: p.name,
        sub: plural(p.recordings, T.recordings),
      })),
      ...listed.map((s) => ({
        id: s.id,
        kind: 'recording' as const,
        title: s.title || s.client_name || s.source_name || T.untitled,
        sub: shortDate(s.recorded_at ?? s.created_at, appLang),
      })),
    ],
    [people, listed, T, appLang],
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

  const joinRun = async (ids: string[]): Promise<boolean> => {
    setJoining(true)
    setErr(null)
    try {
      const j = await postJson<{ primaryId: string; briefed: boolean }>('/api/pen/merge', { action: 'join', ids })
      await refresh()
      void refreshSuggest()
      openSession(j.primaryId)
      setTab('note')
      return true
    } catch (e) {
      setErr(errMessage(e))
      return false
    } finally {
      setJoining(false)
    }
  }

  // "Combine with…" on a recording: which one the picker is open for.
  const [combineFor, setCombineFor] = useState<string | null>(null)

  // Join suggestions for pairs the filename rule can't place (lib/pen/join-suggest.ts). Empty
  // until their table exists; a failure just means no suggestion is shown.
  const [suggest, setSuggest] = useState<{ a_id: string; b_id: string; reason: string }[]>([])
  const refreshSuggest = useCallback(async () => {
    try {
      setSuggest((await getJson<{ suggestions?: { a_id: string; b_id: string; reason: string }[] }>('/api/pen/merge')).suggestions ?? [])
    } catch {}
  }, [])
  useEffect(() => { void refreshSuggest() }, [refreshSuggest])
  const dismissSuggest = async (a: string, b: string) => {
    setSuggest((xs) => xs.filter((x) => !(x.a_id === a && x.b_id === b)))
    try { await postJson('/api/pen/merge', { action: 'dismiss', a, b }) } catch (e) { setErr(errMessage(e)) }
  }
  // Shown on Home, and on either of the two recordings' pages.
  const suggestHere = suggest.filter((x) => {
    const a = sessions.find((s) => s.id === x.a_id), b = sessions.find((s) => s.id === x.b_id)
    if (!a || !b || a.merge_group || b.merge_group) return false
    return view.k === 'archive' || activeId === x.a_id || activeId === x.b_id
  })
  const suggestBanners = !locked && suggestHere.map((x) => {
    const a = sessions.find((s) => s.id === x.a_id)!, b = sessions.find((s) => s.id === x.b_id)!
    const nm = (s: PenSession) => s.title || s.client_name || s.source_name || T.untitled
    return (
      <Banner key={`${x.a_id}:${x.b_id}`} tone="warn">
        <strong style={{ color: 'var(--ink)' }}>{T.suggestTitle}</strong>
        {x.reason && <span className="pen-suggest-reason">{x.reason}</span>}
        <span className="pen-suggest-pair">{nm(a)}  →  {nm(b)}</span>
        <span className="pen-suggest-btns">
          <button className="pen-btn pen-btn-primary" disabled={joining} onClick={() => void joinRun([x.a_id, x.b_id])}>
            <Icon name="link" size={15} />{joining ? T.joining : T.suggestJoin}
          </button>
          <button className="pen-btn" disabled={joining} onClick={() => void dismissSuggest(x.a_id, x.b_id)}>{T.suggestNo}</button>
        </span>
      </Banner>
    )
  })
  const combineSheet = combineFor && sessions.find((s) => s.id === combineFor) ? (
    <CombinePicker
      session={sessions.find((s) => s.id === combineFor)!}
      sessions={sessions}
      T={T}
      lang={appLang}
      onJoin={joinRun}
      onClose={() => setCombineFor(null)}
    />
  ) : null

  const splitGroup = async (group: string) => {
    setJoining(true)
    try {
      await postJson('/api/pen/merge', { action: 'split', group })
      await refresh()
      void refreshSuggest()
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setJoining(false)
    }
  }

  // ------------------------------------------------------------------ phone
  // The phone gets its own screens: a bottom tab bar (Home, Upload, Recordings, Search), a
  // fixed screen that never scrolls as a page, and Search as a real chat. Same state, same
  // components; only the arrangement differs.
  if (isPhone) {
    const openChat = (id: string | null) => { setChatSeed(null); setView({ k: 'chat', id }); setMHist(false) }
    const sessionTitle = (x: PenSession) => x.title || x.client_name || x.source_name || T.untitled
    const chatTitle = view.k === 'chat' && view.id ? (chats.find((c) => c.id === view.id)?.title ?? T.untitledChat) : T.newChat

    const banners = (
      <>
        {loadError && <Banner tone="bad">{T.loadError(loadError)}</Banner>}
        {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
        {heldNotice && <Banner tone="warn" onClose={() => setHeldNotice(false)}>{T.heldNotice}</Banner>}
        {phoneTab !== 'search' && suggestBanners}
        {combineSheet}
        {phoneTab !== 'search' && runs.map((r) => (
          <Banner key={r.sessions[0].id} tone="warn">
            <strong style={{ color: 'var(--ink)' }}>{T.runTitle(r.sessions.length, fmtDur(r.totalSec))}</strong>{' '}
            {T.runBody}
            <button className="pen-btn mt-2.5" disabled={joining} onClick={() => void joinRun(r.sessions.map((x) => x.id))}>
              <Icon name="link" size={15} />
              {joining ? T.joining : T.join}
            </button>
          </Banner>
        ))}
      </>
    )

    let screen: React.ReactNode
    let title = ''
    let onBack: (() => void) | undefined
    let left: React.ReactNode = null
    let right: React.ReactNode = <Account email={email} name={name} avatar={avatar} onTour={() => setTourOpen(true)} />
    let fill = false

    if (phoneTab === 'home') {
      title = T.home
      screen = stats ? (
        <>
        <ClockPill clock={allowance?.clock ?? null} T={T} phone />
        <AskWhatsApp whatsapp={whatsapp ?? null} T={T} />
        <Overview
          stats={stats}
          suggestions={suggestions}
          firstName={firstName}
          onPeopleChanged={() => void refreshPeople()}
          people={people}
          peopleLoading={!peopleLoaded}
          onChanged={() => void refresh()}
          onAskPerson={(p) => {
            const label = shortLabel(p.name, new Set())
            askArchive(T.askPerson(label), [{ id: p.id, title: p.name, label, kind: 'person' }])
          }}
          onOpen={(id) => { openSession(id); setTab('note') }}
          sheets={Boolean(google) && !readOnly}
        />
        </>
      ) : (
        <p className="pen-m-empty">{T.chooseRecording}</p>
      )
    } else if (phoneTab === 'upload') {
      title = T.mUploadTitle
      screen = (
        <div className="pen-m-upload">
          <div className="pen-m-meter"><UsageBar allowance={allowance} /></div>
          <div className="pen-m-upload-actions">
          {readOnly ? (
            <ReadOnlyBanner T={T} />
          ) : paused ? (
            <div className="pen-paused">
              <strong>{T.pausedTitle(fmtDate(paused, appLang, { day: 'numeric', month: 'long' }))}</strong>
              <span>{T.pausedSub}</span>
              <button type="button" className="pen-btn pen-btn-accent" onClick={resumePlan} disabled={resuming}>
                {resuming ? T.resuming : T.resumeNow}
              </button>
            </div>
          ) : (
            <>
              {/* iOS can't hand a file from a USB drive to Safari (the picker's Open spins and
                  gives up, 28 Sep); copying it to the phone first works. `accept` is undefined
                  exactly on iOS (see useAccept). */}
              {mounted && accept === undefined && (
                <details className="pen-m-howto">
                  <summary>{T.iosPenTitle}</summary>
                  <p>{T.iosPenLede}</p>
                  <ol>{T.iosPenSteps.map((st) => <li key={st}>{st}</li>)}</ol>
                  <p className="pen-m-howto-tip">{T.iosPenTip}</p>
                </details>
              )}
              <p className="pen-m-lede">{T.mUploadLede}</p>
              {supportsPicker && (
                <button type="button" className="pen-m-rowbtn" onClick={connectPen}>
                  <Icon name="usb" size={19} />
                  <span>{T.connectPen}</span>
                </button>
              )}
              {whatsapp && (
                <a className="pen-m-rowbtn" href={whatsapp.linked ? `https://wa.me/${whatsapp.number}` : '/pen/settings/whatsapp'}>
                  <Icon name="chat" size={19} />
                  <span>
                    <strong>{whatsapp.linked ? T.waPhoneLinked : T.waPhoneUnlinked}</strong>
                    <em>{whatsapp.linked ? T.waPhoneLinkedSub : T.waPhoneUnlinkedSub}</em>
                  </span>
                </a>
              )}
              <button type="button" className="pen-m-rowbtn" onClick={() => setTxImport(true)}>
                <Icon name="quote" size={19} />
                <span>{T.importTranscript}</span>
              </button>
              {notion && (
                <button type="button" className="pen-m-rowbtn" onClick={() => setNImport(true)}>
                  <Icon name="link" size={19} />
                  <span>{T.importNotion}</span>
                </button>
              )}
              <button type="button" className="pen-m-bigbtn" onClick={() => fileInput.current?.click()}>
                <Icon name="plus" size={22} />
                <span><strong>{T.mChoose}</strong><em>{T.mChooseSub}</em></span>
              </button>
            </>
          )}
          </div>
        </div>
      )
    } else if (phoneTab === 'recordings') {
      if (active) {
        title = sessionTitle(active)
        onBack = () => setView({ k: 'archive' })
        screen = (
          <>
            <Detail
              selfEmail={email}
              notion={notion}
              onPeopleChanged={() => void refreshPeople()}
              onBack={() => setView({ k: 'archive' })}
              session={active} tab={tab} setTab={setTab}
              parts={partsOf(active)}
              splitting={joining}
              onSplit={() => active.merge_group && void splitGroup(active.merge_group)}
              onCombine={locked ? undefined : () => setCombineFor(active.id)}
              onEventDay={locked ? undefined : (id) => { void refresh().then(() => openSession(id)) }}
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
                  const msg = (await r.json().catch(() => ({}))).error ?? T.saveFailed(r.status)
                  setErr(msg)
                  throw new Error(msg)
                }
                setSessions((prev) => prev.map((x) => (x.id === active.id ? { ...x, ...patch } : x)))
              }}
            />
            {chatOpen && <ChatPanel session={active} onChat={patchLocal} onClose={() => setChatOpen(false)} />}
          </>
        )
      } else {
        title = T.recent
        screen = (
          <div className="pen-m-list">
            {bucketCounts.length > 1 && (
              <div className="pen-m-chips">
                <button type="button" className="pen-m-chip" data-on={!catFilter} onClick={() => setCatFilter(null)}>{T.mAll}</button>
                {bucketCounts.map(([b, n]) => (
                  <button type="button" key={b} className="pen-m-chip" data-on={catFilter === b} onClick={() => setCatFilter(catFilter === b ? null : b)}>
                    {bucketLabel(b, appLang)} <span>{n}</span>
                  </button>
                ))}
              </div>
            )}
            {visible.length === 0 ? (
              <p className="pen-m-empty">
                {catFilter ? T.emptyCat : <>{T.emptyAll[0]}<strong>{T.connectPen}</strong>{T.emptyAll[1]}</>}
              </p>
            ) : (
              groupByDay(visible, appLang).map(([day, rows]) => (
                <section key={day} className="pen-m-day">
                  <div className="pen-label">{day}</div>
                  {rows.map((x) => (
                    <button type="button" key={x.id} className="pen-m-rec" onClick={() => { openSession(x.id); setTab('note'); setChatOpen(false) }}>
                      <span className="pen-m-rec-top">
                        <span className="pen-m-rec-title">{sessionTitle(x)}</span>
                        <RecPills s={x} T={T} lang={appLang} />
                      </span>
                      <span className="pen-mono pen-m-rec-meta">
                        {fmtDur(partsOf(x).reduce((n, y) => n + (y.duration_sec ?? 0), 0))}
                        {partsOf(x).length > 1 ? ` · ${T.parts(partsOf(x).length)}` : ''}
                      </span>
                    </button>
                  ))}
                </section>
              ))
            )}
          </div>
        )
      }
    } else {
      left = (
        <button type="button" className="pen-m-iconbtn" onClick={() => setMHist(true)} aria-label={T.mHistory}>
          <svg viewBox="0 0 18 18" width="20" height="20" aria-hidden>
            <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      )
      right = (
        <button type="button" className="pen-m-iconbtn" onClick={() => openChat(null)} aria-label={T.newChat}>
          <Icon name="plus" size={20} />
        </button>
      )
      if (view.k === 'doc') {
        title = docs.find((d) => d.id === view.id)?.title ?? T.pages
        onBack = () => openChat(null)
        screen = (
          <DocView docId={view.id} onRenamed={() => void refreshDocs()} onDeleted={() => { openChat(null); void refreshDocs() }} />
        )
      } else {
        title = chatTitle
        fill = true
        screen = (
          <ChatView
            readOnly={readOnly}
            recordings={taggable}
            chatId={view.k === 'chat' ? view.id : null}
            seed={chatSeed}
            onSeedConsumed={() => setChatSeed(null)}
            onThreadChanged={(id) => { setView({ k: 'chat', id }); void refreshChats() }}
            onDocCreated={(id) => { setView({ k: 'doc', id }); void refreshDocs() }}
            onCite={(sessionId) => { openSession(sessionId); setTab('note'); setChatOpen(false) }}
            suggestions={searchSuggestions(stats, T, appLang)}
            recent={chats.slice(0, 3).map((c) => ({ id: c.id, title: c.title ?? T.untitledChat }))}
            onOpenRecent={(id) => openChat(id)}
          />
        )
      }
    }

    return (
      <LangProvider lang={appLang}>
        <input ref={fileInput} type="file" multiple accept={accept} className="hidden"
               onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <PhoneShell
          tab={phoneTab}
          onTab={goTab}
          chatLink={chatLink}
          title={title}
          onBack={onBack}
          left={left}
          right={right}
          banners={banners}
          fill={fill}
          scrollKey={`${phoneTab}:${view.k}:${'id' in view ? view.id : ''}`}
        >
          {screen}
        </PhoneShell>

        {mHist && (
          <>
            <button className="pen-scrim pen-scrim-on" aria-label={T.close} onClick={() => setMHist(false)} />
            <aside className="pen-m-hist" aria-label={T.mHistory}>
              <div className="pen-m-hist-head">
                <strong>{T.mHistory}</strong>
                <button type="button" className="pen-btn pen-btn-accent" onClick={() => openChat(null)}>
                  <Icon name="plus" size={15} /> {T.newChat}
                </button>
              </div>
              <div className="pen-label">{T.chats}</div>
              {chats.length === 0 ? (
                <p className="pen-m-empty">{T.chatsEmpty}</p>
              ) : (
                chats.map((c) => (
                  <button type="button" key={c.id} className="pen-m-hist-item" data-on={view.k === 'chat' && view.id === c.id} onClick={() => openChat(c.id)}>
                    {c.title ?? T.untitledChat}
                  </button>
                ))
              )}
              {docs.length > 0 && (
                <>
                  <div className="pen-label">{T.pages}</div>
                  {docs.map((d) => (
                    <button type="button" key={d.id} className="pen-m-hist-item" data-on={view.k === 'doc' && view.id === d.id} onClick={() => { setView({ k: 'doc', id: d.id }); setMHist(false) }}>
                      {d.title}
                    </button>
                  ))}
                </>
              )}
            </aside>
          </>
        )}

        {(pending.length > 0 || progress || importDone) && (
          <>
            <button className="pen-scrim pen-scrim-on" aria-label={T.close} onClick={closeSheet} />
            <ImportTray
              pending={pending} setPending={setPending} penName={penName}
              consent={consent} setConsent={setConsent}
              eventMode={eventMode} setEventMode={setEventMode}
              people={people} callPeople={callPeople} setCallPeople={setCallPeople}
              progress={progress} onImport={importPicked}
              phone onClose={closeSheet} done={importDone}
            />
          </>
        )}
        {txImport && (
          <TranscriptImport
            people={people}
            onClose={() => setTxImport(false)}
            onImported={(id) => { setTxImport(false); void refresh(); openSession(id) }}
          />
        )}
        {nImport && (
          <NotionImport
            people={people}
            connected={Boolean(notion?.connected)}
            onClose={() => setNImport(false)}
            onImported={(id) => { setNImport(false); void refresh(); openSession(id) }}
          />
        )}
        {tourOpen && <Tour lang={appLang} onClose={closeTour} onUpload={() => { setPhoneTab('upload'); fileInput.current?.click() }} />}
        {promoOpen && !tourOpen && <ReferralPromo T={T} onClose={closePromo} />}
        {askOpen && !tourOpen && !promoOpen && <FeedbackAsk T={T} onClose={closeAsk} />}
        <UploadCard uploads={uploads} onClose={() => setUploads((prev) => prev.filter((u) => u.state === 'waiting' || u.state === 'working'))} whatsapp={whatsapp ?? null} phone={isPhone} T={T} />
      </LangProvider>
    )
  }

  return (
    <LangProvider lang={appLang}>
    <main className="pen-page" data-ready={mounted}>
      {/* The sidebar is a page-level column running the full height, so the brand sits level
          with the search box rather than a header's height below it. Everything else — the
          header, the banners, the import tray and the note/rail grid — stacks to its right. */}
      <div className="pen-side">
      {/* ------------------------------------------------------ navigation */}
      {/* The brand goes Home, like the Home item below it. */}
      <button
        type="button"
        className="pen-brand pen-brand-home"
        aria-label={T.brandHome}
        onClick={() => { setView({ k: 'archive' }); setCatFilter(null); setNavOpen(false) }}
      >
        <Image src="/juno_mark.png" alt="" width={34} height={34} className="pen-mark" priority />
        <div>
          <div className="pen-display pen-brand-name">Juno Pen</div>
          <div className="pen-brand-tag">{T.brandTag}</div>
        </div>
      </button>

      {readOnly ? (
        <ReadOnlyBanner T={T} />
      ) : paused ? (
        <div className="pen-paused">
          <strong>{T.pausedTitle(fmtDate(paused, appLang, { day: 'numeric', month: 'long' }))}</strong>
          <span>{T.pausedSub}</span>
          <button type="button" className="pen-btn pen-btn-accent" onClick={resumePlan} disabled={resuming}>
            {resuming ? T.resuming : T.resumeNow}
          </button>
        </div>
      ) : (
      <>
      <button className="pen-connect" onClick={connectPen}>
        <Icon name="link" size={18} />
        {T.connectPen}
      </button>

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
          <strong>{T.addFiles}</strong>
          <em>{T.orDrag}</em>
        </span>
      </button>

      </>
      )}

      {/* The other ways in, behind one quiet button: a transcript, Notion, and WhatsApp from the
          phone. Same handlers and links the separate buttons used. */}
      <ImportMenu
        T={T}
        onTranscript={!readOnly && !paused ? () => { setNavOpen(false); setTxImport(true) } : null}
        onNotion={!readOnly && !paused && notion ? () => { setNavOpen(false); setNImport(true) } : null}
        whatsapp={whatsapp ? {
          href: whatsapp.linked ? `https://wa.me/${whatsapp.number}` : '/pen/settings/whatsapp',
          external: whatsapp.linked,
          label: whatsapp.linked ? T.openWhatsApp : T.useWhatsApp,
        } : null}
      />
      {tourOpen && <Tour lang={appLang} onClose={closeTour} onUpload={() => fileInput.current?.click()} />}
      {promoOpen && !tourOpen && <ReferralPromo T={T} onClose={closePromo} />}
      {askOpen && !tourOpen && !promoOpen && <FeedbackAsk T={T} onClose={closeAsk} />}
      <UploadCard uploads={uploads} onClose={() => setUploads((prev) => prev.filter((u) => u.state === 'waiting' || u.state === 'working'))} whatsapp={whatsapp ?? null} phone={isPhone} T={T} />
      {txImport && (
        <TranscriptImport
          people={people}
          onClose={() => setTxImport(false)}
          onImported={(id) => { setTxImport(false); void refresh(); openSession(id) }}
        />
      )}
      {nImport && (
        <NotionImport
          people={people}
          connected={Boolean(notion?.connected)}
          onClose={() => setNImport(false)}
          onImported={(id) => { setNImport(false); void refresh(); openSession(id) }}
        />
      )}

      <nav className="pen-cats">
        <div className="pen-cats-list">
          <button
            className="pen-cat"
            data-active={view.k === 'archive'}
            onClick={() => { setView({ k: 'archive' }); setCatFilter(null); setNavOpen(false) }}
          >
            <Icon name="home" size={19} />
            <span className="pen-cat-label">{T.home}</span>
            {!!stats?.actionsOpen && <span className="pen-cat-n">{stats.actionsOpen}</span>}
          </button>
          <button
            className="pen-cat"
            data-active={catFilter === null && view.k !== 'archive' && view.k !== 'chat' && view.k !== 'doc'}
            onClick={() => { setCatFilter(null); setNavOpen(false) }}
          >
            <Icon name="recordings" size={19} />
            <span className="pen-cat-label">{T.allRecordingsNav}</span>
            <span className="pen-cat-n">{sessions.length}</span>
          </button>
        </div>

        {/* Fixed buckets, not the free-form labels. Measured on a real archive: 11 recordings
            produced 10 distinct categories, 9 holding a single recording — a filter that
            always returns one item is not a filter. The specific label still appears on each
            recording row, where it is good description; navigation happens by bucket. Empty
            buckets are hidden so the nav only ever offers somewhere to go. */}
        {bucketCounts.length > 0 && (
          <div className="pen-sec-toggle-wrap">
            <button
              type="button"
              className="pen-sec-toggle pen-label"
              aria-expanded={catsOpen}
              aria-controls="pen-cats-buckets"
              onClick={() => toggleCats()}
            >
              <span>{T.categories}</span>
              <Icon name="chevron" size={14} className="pen-sec-chev" />
            </button>
          </div>
        )}
        {bucketCounts.length > 0 && catsOpen && (
          <div className="pen-cats-list pen-cats-buckets" id="pen-cats-buckets">
            {bucketCounts.map(([b, n]) => (
              <button
                key={b}
                className="pen-cat"
                data-active={catFilter === b}
                onClick={() => { setCatFilter(catFilter === b ? null : b); setNavOpen(false) }}
              >
                <Icon name={BUCKET_ICON[b] as IconName} size={19} />
                <span className="pen-cat-label">{bucketLabel(b, appLang)}</span>
                <span className="pen-cat-n">{n}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* --------------------------------- recordings (rail; ordered right in CSS) */}

      <nav className="pen-saved">
        {/* ---------------------------------------------------------- chats */}
        <div className="pen-cats-head pen-label pen-cats-head-row pen-sec-label">
          <span>{T.chats}</span>
          <button
            className="pen-cats-new"
            title={T.newChat}
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
          <p className="pen-cats-empty">{T.chatsEmpty}</p>
        ) : (
          <div className="pen-cats-list">
            {chats.slice(0, 4).map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                T={T}
                active={view.k === 'chat' && view.id === c.id}
                onOpen={() => {
                  setChatSeed(null)
                  setView({ k: 'chat', id: c.id })
                  setNavOpen(false)
                }}
                onRenamed={() => void refreshChats()}
                onDeleted={() => {
                  if (view.k === 'chat' && view.id === c.id) setView({ k: 'archive' })
                  void refreshChats()
                }}
              />
            ))}
          </div>
        )}

        {/* ---------------------------------------------------------- pages */}
        {docs.length > 0 && (
          <>
            <div className="pen-cats-head pen-label">{T.pages}</div>
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
          suggestions={searchSuggestions(stats, T, appLang)}
          options={taggable}
          onAsk={(q, mentions) => {
            askArchive(q, mentions)
            setQuery('')
          }}
        />

        <div className="pen-head-right">
          <ClockPill clock={allowance?.clock ?? null} T={T} />
          <button
            className="pen-browse"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-label={T.browseAria}
          >
            <svg viewBox="0 0 18 18" aria-hidden>
              <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" fill="none" stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="pen-browse-t">{T.browse}</span>
          </button>
          <input ref={fileInput} type="file" multiple accept={accept} className="hidden"
                 onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <Account email={email} name={name} avatar={avatar} onTour={() => { setNavOpen(false); setTourOpen(true) }} />
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
            <strong>{whatsapp.linked ? T.waPhoneLinked : T.waPhoneUnlinked}</strong>
            <em>{whatsapp.linked ? T.waPhoneLinkedSub : T.waPhoneUnlinkedSub}</em>
          </span>
          <Icon name="chevron" size={16} className="pen-wa-phone-go" />
        </a>
      )}


      {loadError && (
        <Banner tone="bad">
          {T.loadError(loadError)}
          <div className="mt-1 text-[14.5px]" style={{ color: 'var(--soft)' }}>
            If a column is missing, run the ALTER at the bottom of <span className="pen-mono">lib/pen/schema.sql</span>.
          </div>
        </Banner>
      )}
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {heldNotice && (
        <Banner tone="warn" onClose={() => setHeldNotice(false)}>
          {T.heldNotice}
        </Banner>
      )}

      {/* The pen stops at 60 minutes and opens a new file, so a long meeting arrives in
          halves. Normally they are joined the moment the second transcript lands; this is
          for the ones already sitting in the archive from before, or an upload that arrived
          days late. */}
      {suggestBanners}
      {combineSheet}
      {runs.map((r) => (
        <Banner key={r.sessions[0].id} tone="warn">
          <strong style={{ color: 'var(--ink)' }}>
            {T.runTitle(r.sessions.length, fmtDur(r.totalSec))}
          </strong>{' '}
          {T.runBody}
          <div className="pen-mono mt-1 text-[13px]" style={{ color: 'var(--faint)' }}>
            {r.sessions.map((s) => s.source_name || s.title || T.untitledLower).join('  →  ')}
          </div>
          <button
            className="pen-btn mt-2.5"
            disabled={joining}
            onClick={() => void joinRun(r.sessions.map((s) => s.id))}
          >
            <Icon name="link" size={15} />
            {joining ? T.joining : T.join}
          </button>
        </Banner>
      ))}

      {(pending.length > 0 || progress || importDone) && (
        <>
          {isPhone && <button className="pen-scrim pen-scrim-on" aria-label={T.close} onClick={closeSheet} />}
          <ImportTray
            pending={pending} setPending={setPending} penName={penName}
            consent={consent} setConsent={setConsent}
            eventMode={eventMode} setEventMode={setEventMode}
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
          aria-label={T.closeNav}
          tabIndex={navOpen ? 0 : -1}
          onClick={() => setNavOpen(false)}
        />

        <section className="pen-shell-main min-w-0">
          {view.k === 'chat' ? (
            <ChatView
              readOnly={readOnly}
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
              <>
              <AskWhatsApp whatsapp={whatsapp ?? null} T={T} />
              <Overview
                stats={stats}
                suggestions={suggestions}
                firstName={firstName}
                onPeopleChanged={() => void refreshPeople()}
                people={people}
                peopleLoading={!peopleLoaded}
                onChanged={() => void refresh()}
                onAskPerson={(p) => {
                  const label = shortLabel(p.name, new Set())
                  askArchive(T.askPerson(label), [{ id: p.id, title: p.name, label, kind: 'person' }])
                }}
                onOpen={(id) => {
                  openSession(id)
                  setTab('note')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                sheets={Boolean(google) && !readOnly}
              />
              </>
            ) : (
              <div className="pen-panel px-8 py-16 text-center">
                <p className="text-[16.5px]" style={{ color: 'var(--dim)' }}>{T.chooseRecording}</p>
              </div>
            )
          ) : (
            <div className={chatOpen ? 'grid gap-7 xl:grid-cols-[minmax(0,1fr)_352px]' : ''}>
              <Detail
                selfEmail={email}
                notion={notion}
                google={readOnly ? null : google}
                onPeopleChanged={() => void refreshPeople()}
                onBack={() => setView({ k: 'archive' })}
                session={active} tab={tab} setTab={setTab}
                parts={partsOf(active)}
                splitting={joining}
                onSplit={() => active.merge_group && void splitGroup(active.merge_group)}
                onCombine={locked ? undefined : () => setCombineFor(active.id)}
              onEventDay={locked ? undefined : (id) => { void refresh().then(() => openSession(id)) }}
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
                    const msg = (await r.json().catch(() => ({}))).error ?? T.saveFailed(r.status)
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
            <span className="pen-rail-title">{T.recent}</span>
            {!locked && (
              <button className="pen-rail-new" onClick={() => fileInput.current?.click()}>
                <Icon name="plus" size={15} />
                {T.new}
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="mt-6 text-[14.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              {catFilter ? (
                <>{T.emptyCat} <button className="underline" onClick={() => setCatFilter(null)}>{T.showEverything}</button>.</>
              ) : (
                <>{T.emptyAll[0]}<strong style={{ color: 'var(--soft)' }}>{T.connectPen}</strong>{T.emptyAll[1]}</>
              )}
            </p>
          ) : (
            <div className="mt-6">
              {groupByDay(visible, appLang).map(([day, rows]) => (
                <div key={day} className="mb-5">
                  <div className="pen-label mb-1.5">{day}</div>
                  {rows.map((s) => (
                    <div key={s.id} className="pen-row pen-recrow" data-active={s.id === activeId}
                         onClick={() => { openSession(s.id); setTab('note'); setChatOpen(false) }}>
                      <div className="pen-recrow-main">
                        <span className="pen-row-title pen-recrow-title">
                          {s.title || s.client_name || s.source_name || T.untitled}
                        </span>
                        <span className="pen-recrow-dur">
                          {fmtDur(partsOf(s).reduce((n, x) => n + (x.duration_sec ?? 0), 0))}
                          {partsOf(s).length > 1 ? ` · ${T.parts(partsOf(s).length)}` : ''}
                        </span>
                      </div>
                      <RecPills s={s} T={T} lang={appLang} />
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
    </LangProvider>
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
function Account({ email, name, avatar, onTour }: { email: string; name?: string | null; avatar?: string | null; onTour?: () => void }) {
  const T = useCopy(APP_COPY)
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
            {T.settings}
          </Link>
          <Link href="/pen/settings/invite" className="pen-acct2-item">
            <Icon name="link" size={17} />
            {T.inviteFriends}
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Juno%20Pen`} className="pen-acct2-item">
            <Icon name="mail" size={17} />
            <span>
              {T.help}
              <span className="pen-help-addr">{SUPPORT_EMAIL}</span>
            </span>
          </a>
          {onTour && (
            <button type="button" className="pen-acct2-item" onClick={() => { setOpen(false); onTour() }}>
              <Icon name="sparkle" size={17} />
              {T.tour}
            </button>
          )}
          {isOwner(email) && (
            <Link href="/pen/customers" className="pen-acct2-item">
              <Icon name="people" size={17} />
              {T.customers}
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
function searchSuggestions(stats: ArchiveStats | null, T: AppCopy, lang: Lang): string[] {
  const out: string[] = []
  if (stats?.actionsOpen) {
    out.push(T.suggOpen(stats.actionsOpen))
  }
  const client = stats?.clients[0]?.name
  if (client) out.push(T.suggClient(client))
  const top = stats?.categories.find((c) => c.count > 1)
  if (top) out.push(T.suggCategory(typeLabel(top.label, lang).toLowerCase()))
  const person = stats?.peopleMet
  if (out.length < 3 && person) out.push(T.suggOwes)
  for (const f of T.suggFallback) {
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
  const T = useCopy(APP_COPY)
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
          placeholder={T.searchPlaceholder}
          aria-label={T.searchAria}
          className="pen-search-input"
        />
        <kbd className="pen-kbd pen-search-kbd">&#8984;K</kbd>
      </form>

      <TagMenu open={tp.open} matches={tp.matches} pick={tp.pick} setPick={tp.setPick} choose={tp.choose} />

      {focused && !tp.open && suggestions.length > 0 && (
        <div className="pen-search-sugg">
          <div className="pen-label px-1 pb-1.5">{T.tryAsking}</div>
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
  const T = useCopy(APP_COPY)
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
        {/* The recording's title is the page's heading (screen readers had none on desktop). */}
        <h1 className="pen-title-h">
        <button className="pen-title" onClick={() => setEditing(true)} title={T.clickRename}>
          <span>{shown}</span>
          <svg className="pen-title-pen" viewBox="0 0 16 16" aria-hidden>
            <path d="M11.2 2.6l2.2 2.2-7.5 7.5-2.9.7.7-2.9 7.5-7.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
        </h1>
        {failed && (
          <div className="pen-mono mt-1 text-[13px]" style={{ color: 'var(--bad)' }}>
            {T.renameFailed}
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
  const T = useCopy(APP_COPY)
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  return (
    <div className="pen-catpick">
      <button className="pen-catpick-btn" data-empty={!value} disabled={busy} onClick={() => setOpen((v) => !v)}>
        {busy ? T.working : (value && typeLabel(value, lang)) || T.setCategory}
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
              placeholder={T.typeOwn}
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
                {typeLabel(t, lang)}
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
  pending, setPending, penName, consent, setConsent, eventMode, setEventMode, people, callPeople, setCallPeople, progress, onImport, phone, onClose, done,
}: {
  eventMode: boolean
  setEventMode: (v: boolean) => void
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
  const T = useCopy(APP_COPY)
  const lang = useLang()
  // On a phone this is a full-screen sheet with one job. The desktop tray assumes you have
  // just plugged the pen in and are triaging a batch; a phone user has finished one meeting
  // and wants that one file in, so the multi-select, the client field and the inline progress
  // bar are all in the way. Same handlers, different shape.
  if (phone) {
    const picked = pending.filter((p) => p.picked)
    return (
      <div className="pen-imp" role="dialog" aria-modal="true" aria-label={T.addRecording}>
        <div className="pen-imp-head">
          <span className="pen-label">{T.addRecording}</span>
          <button className="pen-imp-x" onClick={onClose} aria-label={T.close}>&times;</button>
        </div>

        <div className="pen-imp-body">
          {done ? (
            <div className="pen-imp-done">
              <div className="pen-imp-tick" aria-hidden>&#10003;</div>
              <h3 className="pen-display text-[26px] leading-tight">{T.doneTitle}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
                {T.doneBody}
              </p>
            </div>
          ) : progress ? (
            <div className="pen-imp-progress">
              <div className="pen-imp-pct">{Math.round(progress.pct)}%</div>
              <div className="pen-meter-bar"><span style={{ width: `${progress.pct}%` }} /></div>
              <p className="mt-3 text-[14.5px]" style={{ color: 'var(--soft)' }}>{progress.phase}</p>
              <p className="pen-mono mt-1 truncate text-[13px]" style={{ color: 'var(--faint)' }}>{progress.name}</p>
              <p className="pen-imp-warn">{T.keepOpen}</p>
            </div>
          ) : (
            <>
              <ul className="pen-imp-files">
                {pending.map((p, i) => (
                  <li key={`${p.file.name}-${i}`}>
                    <div className="min-w-0">
                      <div className="truncate text-[16.5px]">{p.file.name}</div>
                      <div className="pen-mono text-[13px]" style={{ color: 'var(--dim)' }}>
                        {fmtMB(p.file.size)} &middot; {new Date(p.file.lastModified).toLocaleDateString(LOCALE[lang])}
                      </div>
                    </div>
                    <button
                      className="pen-imp-drop"
                      onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={T.remove(p.file.name)}
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
                  {T.consentPhone}
                </span>
              </button>
              <button
                className="pen-consent pen-event-switch"
                data-on={eventMode}
                onClick={() => setEventMode(!eventMode)}
                role="switch"
                aria-checked={eventMode}
              >
                <span className="pen-consent-track"><span className="pen-consent-knob" /></span>
                <span className="pen-consent-text">
                  <strong>{T.eventToggle}</strong>
                  <span className="pen-event-hint">{T.eventHint}</span>
                </span>
              </button>
            </>
          )}
        </div>

        {!done && !progress && (
          <div className="pen-imp-foot">
            <button className="pen-btn pen-btn-accent w-full justify-center" onClick={onImport} disabled={!picked.length}>
              {T.addN(picked.length)}
            </button>
            <p className="pen-imp-foot-note">{T.nameLater}</p>
          </div>
        )}

        {done && (
          <div className="pen-imp-foot">
            <button className="pen-btn pen-btn-primary w-full justify-center" onClick={onClose}>{T.done}</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="pen-panel pen-import-panel mt-6 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="pen-display text-[21px]">
          {penName ? T.onPen(pending.length, penName) : T.readyImport}
        </h2>
        {pending.length > 0 && (
          <button className="pen-mono text-[13px] underline" style={{ color: 'var(--dim)' }} onClick={() => setPending([])}>
            {T.clear}
          </button>
        )}
      </div>

      <ul className="mt-4">
        {pending.map((p, i) => (
          <li key={`${p.file.name}-${i}`} className="flex items-center gap-3 border-t py-2.5" style={{ borderColor: 'var(--hair)' }}>
            <input type="checkbox" className="pen-act-box" checked={p.picked} aria-label={p.file.name}
                   onChange={(e) => setPending((prev) => prev.map((x, j) => (j === i ? { ...x, picked: e.target.checked } : x)))} />
            <span className="min-w-0 flex-1 truncate text-[14.5px]">{p.file.name}</span>
            <span className="pen-mono text-[13px]" style={{ color: 'var(--dim)' }}>{fmtMB(p.file.size)}</span>
            <span className="pen-mono text-[13px]" style={{ color: 'var(--faint)' }}>
              {new Date(p.file.lastModified).toLocaleDateString(LOCALE[lang])}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="block">
          <span className="pen-label">{T.whoOnCall}</span>
          <div className="mt-1.5">
            <PeoplePicker people={people} value={callPeople} onChange={setCallPeople} />
          </div>
          <span className="mt-1 block text-[13px]" style={{ color: 'var(--faint)' }}>
            {T.whoHint}
          </span>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg p-3.5" style={{ background: 'var(--warn-wash)', border: '1px solid #EFE2C4' }}>
          <input type="checkbox" className="pen-act-box mt-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-[14.5px] leading-snug" style={{ color: 'var(--warn)' }}>
            {T.consentDesk}
          </span>
        </label>
        <label className="pen-event-row sm:col-span-2">
          <input type="checkbox" className="pen-act-box mt-0" checked={eventMode} onChange={(e) => setEventMode(e.target.checked)} />
          <span>
            <strong>{T.eventToggle}</strong>
            <span className="pen-event-hint">{T.eventHint}</span>
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
          {T.importN(pending.filter((p) => p.picked).length)}
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
  const T = useCopy(APP_COPY)
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
      : <Muted>{T.noPartTranscript}</Muted>
  }
  return (
    <>
      <SpeakerNames
        sessionId={part.id}
        utterances={utts}
        initialMap={map}
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
        anchor={`pen-u-${part.id}`}
        onEdit={(i, text) => { dirty.current = true; setEdits((prev) => ({ ...prev, [String(i)]: text })) }}
      />
    </>
  )
}

/* =================================================================== detail */

function Detail({
  session, tab, setTab, chatOpen, onToggleChat, onNotes, onDelete, onPatch, askCategory, selfEmail, onBack, notion, google,
  parts, onSplit, splitting, onPeopleChanged, onCombine, onEventDay,
}: {
  /** "Combine this day into one event" made a new recording: refresh and open it. */
  onEventDay?: (primaryId: string) => void
  /** "Combine with…": open the picker. Absent on a read-only or paused account. */
  onCombine?: () => void
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
  /** Notion is available (and whether this account connected it): the "Send to Notion" button. */
  notion?: { connected: boolean; sent?: Record<string, string> } | null
  /** Google is available (and whether Docs & Sheets is connected): the "Send to Google Docs" item. */
  google?: { drive: boolean } | null
  onBack: () => void
  onDelete: () => void
  onPatch: (p: Partial<Pick<PenSession, 'user_notes' | 'title' | 'client_name' | 'action_done' | 'note_blocks' | 'transcript_edits' | 'briefing_sent_at' | 'meeting_type'>>) => Promise<void>
}) {
  const T = useCopy(APP_COPY)
  const lang = useLang()
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
  // Any file of the meeting has speech. A day combined into one event can start with a silent
  // fragment, and gating on the first file alone hid its conversations, names and chat.
  const spoken = parts.some((p) => (p.transcript?.utterances?.length ?? 0) > 0)
  const totalUtts = parts.reduce((t, p) => t + (p.transcript?.utterances?.length ?? 0), 0)
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
  // action_meta runs parallel to notes.actions; only a resolved YYYY-MM-DD counts as dated.
  const dueDates: (string | null)[] = (n.actions ?? []).map((_, i) => {
    const d = Array.isArray(session.action_meta) && session.action_meta.length === (n.actions?.length ?? 0) ? session.action_meta[i]?.due_date : null
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
  })

  // Names heard and conversations read every part of a joined meeting, each at its own start.
  const nameParts = useMemo<NamePart[]>(() => {
    let offset = 0
    return parts.map((x, i) => {
      const p: NamePart = {
        id: x.id,
        offset,
        labels: (x.transcript?.utterances ?? []).map((u) => u.speaker),
        map: i === 0 ? speakerMap : ((x.speaker_map as SpeakerMap | null) ?? null),
        // Written up in the last quarter hour: its names are probably still on the way.
        fresh: !x.names_at && x.status === 'noted' && Date.now() - Date.parse(x.updated_at) < 15 * 60_000,
      }
      offset += x.duration_sec ?? 0
      return p
    })
  }, [parts, speakerMap])

  /** Opens the transcript at one line and marks it for a moment. */
  function jumpTo(sessionId: string, utterance: number) {
    setTab('transcript')
    let tries = 0
    const go = () => {
      const el = document.getElementById(`pen-u-${sessionId}-${utterance}`)
      if (!el) { if (++tries < 20) setTimeout(go, 50); return }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.setAttribute('data-flash', '1')
      setTimeout(() => el.removeAttribute('data-flash'), 2400)
    }
    setTimeout(go, 30)
  }

  // Conference mode: offered for long recordings with many voices, on demand otherwise.
  const nameIds = nameParts.map((p) => p.id)
  const { data: namesData } = useNames(spoken ? nameIds : [])
  const { running: splittingConvos } = useSplitting(nameIds)
  const hasConvos = !!namesData && nameIds.some((id) => (namesData.recordings[id]?.segments.length ?? 0) > 0)
  const suggestEvent = totalSec >= 25 * 60 && speakerCount >= 4
  const canSplit = spoken && totalSec >= 10 * 60

  async function toggleAction(i: number) {
    const next = new Set(done)
    next.has(i) ? next.delete(i) : next.add(i)
    await onPatch({ action_done: Array.from(next) })
  }

  async function regenerate(type?: MeetingType) {
    setBusy(true)
    setPendingType(null)
    await onNotes(type)
    setBusy(false)
  }
  // Picking a category used to rewrite the notes on the spot. Now it relabels, and rewriting the
  // notes for the new type is offered as a separate, explicit step.
  const [pendingType, setPendingType] = useState<MeetingType | null>(null)
  function relabel(v: MeetingType) {
    void onPatch({ meeting_type: v })
    setPendingType(v)
  }

  return (
    <div className="min-w-0">
      {/* --------------------------------------------------------- header */}
      <button className="pen-back" onClick={onBack}>
        <Icon name="back" size={17} />
        {T.allRecordings}
      </button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[280px]">
          <TitleEdit
            title={session.title || n.headline || session.source_name || T.untitled}
            onSave={(next) => onPatch({ title: next })}
          />
          {/* Icons rather than a row of interchangeable grey strings — you can tell the
              date from the duration from the category without reading any of them. */}
          <div className="pen-meta">
            <span className="pen-meta-bit">
              <Icon name="calendar" size={15} />
              {/* No recording date from the pen: say when it was uploaded rather than a bare dash. */}
              {session.recorded_at ? fmtDate(session.recorded_at, lang, { dateStyle: 'medium' }) : T.uploadedOn(fmtDate(session.created_at, lang, { dateStyle: 'medium' }))}
            </span>
            <span className="pen-meta-bit">
              <Icon name="clock" size={15} />
              {fmtDur(totalSec)}
            </span>
            {joined && (
              <span className="pen-meta-bit">
                <Icon name="link" size={15} />
                {T.parts(parts.length)}
              </span>
            )}
            {!!displayType(session.meeting_type) && (
              <span className="pen-meta-bit">
                <Icon name="tag" size={15} />
                {typeLabel(session.meeting_type, lang)}
              </span>
            )}
            {speakerCount > 0 && (
              <span className="pen-meta-bit">
                <Icon name="people" size={15} />
                {plural(speakerCount, T.speakers)}
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
              <span className="pen-chip" data-tone="accent"><Icon name="sparkle" size={14} filled />{T.aiSummarised}</span>
            )}
            {spoken && (
              <span className="pen-chip"><Icon name="check" size={14} />{session.source_channel === 'import' ? T.imported : T.transcribed}</span>
            )}
            {session.status === 'transcribing' && (
              <span className="pen-chip" data-tone="warn"><Icon name="clock" size={14} />{T.chipTranscribing}</span>
            )}
            {session.status === 'noting' && (
              <span className="pen-chip" data-tone="warn"><Icon name="sparkle" size={14} filled />{T.chipNoting}</span>
            )}
            {session.status === 'error' && (
              <span className="pen-chip" data-tone="bad"><Icon name="alert" size={14} />{T.chipError}</span>
            )}
            {session.status === 'held' && (
              <span className="pen-chip" data-tone="warn"><Icon name="clock" size={14} />{T.chipHeld}</span>
            )}
          </div>

          {joined && (
            <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              {T.joinedNote(parts.length)}{' '}
              <button
                className="underline"
                disabled={splitting}
                onClick={onSplit}
                style={{ color: 'var(--soft)' }}
              >
                {splitting ? T.separating : T.separate}
              </button>
            </p>
          )}
        </div>
        <div className="pen-d-actions flex flex-wrap items-center gap-2">
          <SendBriefing
            selfEmail={selfEmail}
            sessionId={session.id}
            sentAt={session.briefing_sent_at}
            disabled={!n.summary && !n.actions?.length && !n.missed?.length && !n.open_questions?.length}
            onSent={(iso) => void onPatch({ briefing_sent_at: iso })}
          />
          {spoken && (
            <button className={`pen-btn ${chatOpen ? 'pen-btn-accent' : ''}`} onClick={onToggleChat}>
              <Icon name="chat" size={15} /><span className="pen-d-ask-l">{chatOpen ? T.hideChat : T.askMeeting}</span><span className="pen-d-ask-s">{chatOpen ? T.hideChat : T.askShort}</span>
            </button>
          )}
          {/* Two visible actions; everything else under More, on every screen size (the phone had
              this already, the desktop showed eight equal pills). */}
          <details className="pen-d-more" onToggle={(e) => { if (!(e.currentTarget as HTMLDetailsElement).open) setConfirmDelete(false) }}>
            <summary className="pen-btn" aria-label={T.moreActions}><Icon name="more" size={16} /><span className="pen-d-more-l">{T.more}</span></summary>
            <div className="pen-d-menu" role="menu">
          {/* Keyed off the transcript, not the status. A session can land in `error` with a
              perfectly good transcript (a failed save, a transient API error), and gating the
              retry on status left it with no way out of the UI. */}
          {spoken && (
            <button className="pen-btn" role="menuitem" onClick={() => regenerate()} disabled={busy}>
              <Icon name="sparkle" size={15} />{busy ? T.working : session.status === 'noted' ? T.redoNotes : T.writeNotes}
            </button>
          )}
          {onCombine && !joined && utts.length > 0 && (
            <button className="pen-btn" role="menuitem" onClick={onCombine}>
              <Icon name="link" size={15} />{T.combineWith}
            </button>
          )}
          {onCombine && canSplit && (
            <button className="pen-btn" role="menuitem" disabled={splittingConvos} onClick={() => { setTab('note'); void startSplit(nameIds) }}>
              <Icon name="people" size={15} />{hasConvos ? T.resplitConvos : T.splitConvos}
            </button>
          )}
          {notion && (n.summary || n.actions?.length) ? <NotionButton key={session.id} sessionId={session.id} connected={notion.connected} sentUrl={notion.sent?.[session.id] ?? null} /> : null}
          {google && (n.summary || n.actions?.length) ? <GoogleDocsButton key={`g${session.id}`} sessionId={session.id} connected={google.drive} /> : null}
          {/* Two-step, inline. Deletion takes the audio with it and cannot be undone, so it
              asks — but a modal for one row would be heavier than the action deserves. */}
          {confirmDelete ? (
            <span className="pen-confirm">
              <span>{T.deleteForGood}</span>
              <button className="pen-confirm-no" onClick={() => setConfirmDelete(false)}>{T.keep}</button>
              <button className="pen-confirm-yes" onClick={onDelete}>{T.delete}</button>
            </span>
          ) : (
            <button className="pen-btn pen-btn-quiet" role="menuitem" onClick={() => setConfirmDelete(true)} title={T.deleteTitle}>
              <Icon name="trash" size={15} />{T.delete}
            </button>
          )}
            </div>
          </details>
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
              {T.tabs[t]}{t === 'transcript' && totalUtts ? ` ${totalUtts}` : ''}
            </button>
          ))}
        </div>
        {spoken && (
          <div className="pen-tabrow-cat flex items-center gap-2 pb-1.5">
            <span className="pen-label">{T.category}</span>
            <CategoryPicker
              value={displayType(session.meeting_type) || null}
              busy={busy}
              onPick={(v) => relabel(v)}
            />
            {askCategory && !session.meeting_type && (
              <span className="pen-mono text-[13px]" style={{ color: 'var(--warn)' }}>
                {T.notSure}
                {askCategory.length > 0 && (
                  <>
                    {' — '}
                    {askCategory.slice(0, 2).map((a, i) => (
                      <span key={a}>
                        {i > 0 && T.or}
                        <button className="underline" onClick={() => relabel(a)}>{typeLabel(a, lang)}</button>
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

      {pendingType && spoken && (
        <div className="pen-relabel" role="status">
          <span>{T.relabeled(typeLabel(pendingType, lang))}</span>
          <span className="pen-relabel-acts">
            <button className="pen-btn" onClick={() => setPendingType(null)}>{T.keepNotes}</button>
            <button className="pen-btn pen-btn-accent" disabled={busy} onClick={() => regenerate(pendingType)}>{T.redoAsType}</button>
          </span>
        </div>
      )}

      {tab === 'transcript' ? (
        <div className="pen-panel mt-6 p-6">
          {utts.length ? (
            <>
              <SpeakerNames
                sessionId={session.id}
                utterances={utts}
                // The live names, not the copy the page loaded with: switching tabs remounts this,
                // and the loaded copy forgot every name given since.
                initialMap={speakerMap}
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
                anchor={`pen-u-${session.id}`}
                onEdit={(i, text) => { dirtyT.current = true; setTEdits((prev) => ({ ...prev, [String(i)]: text })) }}
              />
            </>
          ) : session.transcript?.text ? (
            <p className="whitespace-pre-wrap text-[16.5px] leading-relaxed">{session.transcript.text}</p>
          ) : (
            <Muted>{T.noTranscript}</Muted>
          )}

          {/* The later parts, in place, so the transcript reads straight through. Each one
              still saves its corrections to its own recording — the overlay is keyed by
              utterance index, and the indexes only mean anything within one file. */}
          {parts.slice(1).map((part, i) => (
            <div key={part.id} className="mt-8">
              <div className="pen-seam">
                <span className="pen-label">
                  {T.partSeam(i + 2, fmtDur(parts.slice(0, i + 1).reduce((t, x) => t + (x.duration_sec ?? 0), 0)))}
                </span>
              </div>
              <p className="mb-4 mt-2 text-[14px]" style={{ color: 'var(--faint)' }}>
                {T.partNote}
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
              canEnhance={spoken}
              onChange={(next) => { dirtyNotes.current = true; setBlocks(next) }}
            />
          </div>

          {n.empty && <div className="pen-sec"><Muted>{T.mEmpty}</Muted></div>}
          {session.status === 'transcribing' && <div className="pen-sec"><Muted>{T.mTranscribing}</Muted></div>}
          {session.status === 'uploaded' && <div className="pen-sec"><Muted>{T.mUploaded}</Muted></div>}
          {session.status === 'held' && (
            <div className="pen-sec">
              <Muted>
                {T.mHeld}
              </Muted>
            </div>
          )}
          {spoken && !n.summary && session.status !== 'transcribing' && (
            <div className="pen-sec">
              <Muted>
                {session.status === 'error'
                  ? T.mNotesFailed
                  : T.mReady}
              </Muted>
            </div>
          )}

          {n.summary && (
            <div className="pen-aicard">
              <div className="pen-aicard-head">
                <span className="pen-aicard-title">
                  <Icon name="sparkle" size={18} filled />
                  {T.aiSummary}
                </span>
                <span className="pen-aicard-by">{T.byAi}</span>
              </div>
              <p className="pen-aicard-body">{n.summary}</p>
            </div>
          )}

          {/* What Juno heard that it can help with: the same offers WhatsApp makes. */}
          {session.status === 'noted' && <JunoNoticed key={session.id} sessionId={session.id} />}

          {spoken && (
            <Conversations parts={nameParts} suggest={suggestEvent} onJump={jumpTo} onPeopleChanged={onPeopleChanged} onDraft={setSheet} onCombined={onEventDay} />
          )}

          {/* Mock (14 Oct): Next actions first and full width (it is the work: checkboxes,
              "0/4 done"), then Decided and Still open side by side as a reference row, each
              taking the full width when the other is empty. A one-line tally under the summary
              jumps to each list. */}
          {(!!n.decisions?.length || !!n.actions?.length || !!n.open_questions?.length) && (
            <div className="pen-notes2">
              <p className="pen-notes2-tally">
                {[
                  n.actions?.length ? <a key="a" href="#pen-n2-actions">{T.tallyActions(n.actions.length - done.size)}</a> : null,
                  n.decisions?.length ? <a key="d" href="#pen-n2-decided">{T.tallyDecided(n.decisions.length)}</a> : null,
                  n.open_questions?.length ? <a key="o" href="#pen-n2-open">{T.tallyOpen(n.open_questions.length)}</a> : null,
                ].filter(Boolean).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, <span key={`s${i}`} aria-hidden="true"> · </span>, x] : [x]), [])}
              </p>
            {!!n.actions?.length && (
              <div id="pen-n2-actions" className="pen-sec pen-card pen-n2-actions">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="pen-sec-head"><span className="pen-badge" data-tone="accent"><Icon name="checklist" size={13} /></span>{T.nextActions}</span>
                  <span className="pen-mono text-[13px]" style={{ color: 'var(--faint)' }}>
                    {T.nDone(done.size, n.actions.length)}
                  </span>
                </div>
                <div className="mt-1.5">
                  {n.actions.map((a, i) => (
                    <div key={i} className="pen-act pen-doable" data-done={done.has(i)}>
                      {/* The label is the 44px target; the box inside stays its drawn size. */}
                      <label className="pen-act-hit">
                        <input type="checkbox" className="pen-act-box" checked={done.has(i)} onChange={() => toggleAction(i)} aria-label={a.action} />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="pen-act-text text-[16.5px] leading-snug">{a.action}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {(a.owner || a.due || a.priority === 'high' || dueDates[i]) && (
                            <div className="pen-mono flex flex-wrap items-center gap-x-2 text-[13px]" style={{ color: 'var(--dim)' }}>
                              {a.priority === 'high' && <span style={{ color: 'var(--bad)' }}>{T.priority}</span>}
                              {a.owner && <span>{a.owner}</span>}
                              {/* A real date is also the way into the calendar; words alone ("next week") stay text. */}
                              {dueDates[i] ? (
                                <DateChip sessionId={session.id} index={i} label={a.due || fmtDate(`${dueDates[i]}T12:00:00Z`, lang, { month: 'short', day: 'numeric', timeZone: 'UTC' })} />
                              ) : (
                                a.due && <span style={{ color: 'var(--accent-ink)' }}>{a.due}</span>
                              )}
                            </div>
                          )}
                          <DeliverableActions item={a.action} onPick={(kind) => setSheet({ kind, item: a.action })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
              {(!!n.decisions?.length || !!n.open_questions?.length) && (
                <div className="pen-n2-ref">
            {!!n.decisions?.length && (
              <div id="pen-n2-decided" className="pen-sec pen-card">
                <span className="pen-sec-head"><span className="pen-badge" data-tone="good"><Icon name="check" size={13} /></span>{T.decided}</span>
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
            {!!n.open_questions?.length && (
              <div id="pen-n2-open" className="pen-sec pen-card">
                <span className="pen-sec-head"><span className="pen-badge" data-tone="warn"><Icon name="question" size={13} /></span>{T.stillOpen}</span>
                <ul className="mt-2 list-disc space-y-2.5 pl-5 text-[16.5px]">
                  {n.open_questions.map((q, i) => (
                    <li key={i} className="pen-doable">
                      {q}
                      <div className="mt-1.5">
                        <DeliverableActions item={q} onPick={(kind) => setSheet({ kind, item: q })} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
                </div>
              )}
            </div>
          )}

          <PeoplePanel sessionId={session.id} notes={n} status={session.status} onChanged={onPeopleChanged} parts={spoken ? nameParts : undefined} onJump={jumpTo} />

          {!!n.missed?.length && (
            <div className="pen-sec">
              <div className="pen-missed p-5">
                <span className="pen-label" style={{ color: 'var(--warn)' }}>{T.missed}</span>
                <ul className="mt-2.5 space-y-3">
                  {n.missed.map((m, i) => (
                    <li key={i} className="pen-doable text-[16.5px] leading-snug">
                      {m.item}
                      {m.why && <div className="mt-0.5 text-[14.5px]" style={{ color: 'var(--warn)' }}>{m.why}</div>}
                      <div className="mt-1.5">
                        <DeliverableActions item={m.item} onPick={(kind) => setSheet({ kind, item: m.item })} />
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
  const T = useCopy(APP_COPY)
  return (
    <>
      {!!showing.reactions?.length && (
        <div className="pen-sec">
          <span className="pen-label">{T.roomByRoom}</span>
          <ul className="mt-2 space-y-2.5">
            {showing.reactions.map((r, i) => (
              <li key={i} className="text-[16.5px]">
                <span className="font-medium capitalize">{r.feature}</span>
                <span style={{ color: 'var(--dim)' }}> · {r.who} · </span>
                <span style={{ color: sentimentColor(r.sentiment) }}>{T.sentiment[r.sentiment] ?? r.sentiment}</span>
                {r.quote && <div className="mt-0.5 text-[14.5px] italic" style={{ color: 'var(--soft)' }}>“{r.quote}”</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!showing.objections?.length && (
        <div className="pen-sec">
          <span className="pen-label">{T.objections}</span>
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
          <span className="pen-label">{T.signals}</span>
          <ul className="mt-2 space-y-2">
            {showing.signals.map((s, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[16.5px]">
                <span className="pen-pill" data-s={s.strength === 'strong' ? 'noted' : 'uploaded'}>{T.strength[s.strength] ?? s.strength}</span>
                <span>{s.signal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!showing.revealed_criteria?.length && (
        <div className="pen-sec">
          <div className="rounded-[10px] p-5" style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)' }}>
            <span className="pen-label" style={{ color: 'var(--accent-ink)' }}>{T.wantTitle}</span>
            <p className="mb-2 mt-1 text-[14.5px]" style={{ color: 'var(--soft)' }}>
              {T.wantNote}
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
  const T = useCopy(APP_COPY)
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
    if (isViewing(t)) setSuggestions(T.chatViewing)
    else if (/clinic|patient|ward|admin|round/i.test(t)) setSuggestions(T.chatClinic)
    else setSuggestions(T.chatDefault)
  }, [session.id, session.meeting_type, session.notes?.meeting_type, T])

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
      setError(errMessage(e, T.noAnswer))
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
        <span className="pen-label">{T.askMeeting}</span>
        <div className="flex items-center gap-3">
          {chat.length > 0 && (
            <button className="pen-mono text-[13px] underline" style={{ color: 'var(--dim)' }} onClick={reset}>{T.clear}</button>
          )}
          <button className="pen-mono text-[14.5px] leading-none xl:hidden" style={{ color: 'var(--dim)' }} onClick={onClose}>×</button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {chat.length === 0 && (
          <p className="text-[16.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
            {T.chatIntro}
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
          placeholder={T.chatPlaceholder}
          className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border px-3 py-2 text-[14.5px] outline-none"
          style={{ borderColor: 'var(--line)', background: 'var(--panel)', fontFamily: 'var(--serif)' }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q) } }}
        />
        <button type="submit" className="pen-btn pen-btn-accent" disabled={thinking || !q.trim()}>{T.ask}</button>
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

// Newest recording first by when it was RECORDED (the file's own date), falling back to the
// upload time for files without one. Sorting by upload time while heading by recording date put
// an old recording uploaded today at the top under an old day, and could repeat a day heading.
// But an old recording uploaded today (a lecture from two weeks ago) then sank out of sight under
// its own day, so for a day it heads the list as "Just added" instead.
const JUST_ADDED: Record<Lang, string> = { en: 'Just added', es: 'Recién agregadas', pt: 'Recém-adicionadas' }
const HOUR_MS = 3_600_000

function groupByDay(sessions: PenSession[], lang: Lang): [string, PenSession[]][] {
  const at = (s: PenSession) => new Date(s.recorded_at ?? s.created_at).getTime()
  const now = Date.now()
  const justAdded = (s: PenSession) => {
    const up = new Date(s.created_at).getTime()
    return !!s.recorded_at && now - up < 24 * HOUR_MS && up - at(s) > 36 * HOUR_MS
  }
  const map = new Map<string, PenSession[]>()
  const fresh = sessions.filter(justAdded).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  if (fresh.length) map.set(JUST_ADDED[lang] ?? JUST_ADDED.en, fresh)
  for (const s of [...sessions].filter((s) => !justAdded(s)).sort((a, b) => at(b) - at(a))) {
    const key = fmtDate(s.recorded_at ?? s.created_at, lang, { weekday: 'short', month: 'short', day: 'numeric' })
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

/** Takes the place of the ways to add a recording once the plan has ended. */
function ReadOnlyBanner({ T }: { T: AppCopy }) {
  return (
    <div className="pen-paused pen-readonly">
      <strong>{T.readOnlyTitle}</strong>
      <span>{T.readOnlySub}</span>
      <Link href="/pen/settings/billing" className="pen-btn pen-btn-accent">{T.reactivate}</Link>
    </div>
  )
}

/** The countdown: trial days left, days left after cancelling, or read-only. Links to Billing. */
function ClockPill({ clock, T, phone }: { clock: Allowance['clock']; T: AppCopy; phone?: boolean }) {
  if (!clock) return null
  const label = clock.state === 'trial' ? T.pillTrial(clock.days) : clock.state === 'ending' ? T.pillEnding(clock.days) : T.pillReadOnly
  return (
    <Link href="/pen/settings/billing" className="pen-clock" data-state={clock.state} data-phone={phone ? 'true' : undefined}>
      {label}
    </Link>
  )
}

/**
 * "Give a month, get a month", shown once per account. The button goes to Settings → Invite
 * friends, where the link is; closing it in any way counts as seen.
 */
function ReferralPromo({ T, onClose }: { T: AppCopy; onClose: () => void }) {
  const router = useRouter()
  const go = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    go.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  // Portalled to the outer .pen-root (app/pen/layout.tsx), which carries the fonts and colours:
  // inside the app shell it shared the page's stacking, and cards behind it painted over it.
  const host = typeof document !== 'undefined' ? document.querySelector('.pen-root') ?? document.body : null
  if (!host) return null
  return createPortal(
    <div className="pen-promo" role="dialog" aria-modal="true" aria-labelledby="pen-promo-title">
      <div className="pen-promo-dim" onClick={onClose} aria-hidden="true" />
      <div className="pen-promo-card">
        <div className="pen-promo-band">
          <span className="pen-promo-eyebrow">{T.promoEyebrow}</span>
          <h2 id="pen-promo-title" className="pen-display pen-promo-title">{T.promoTitle}</h2>
        </div>
        <p className="pen-promo-lede">{T.promoLede}</p>
        <ul className="pen-promo-tiers">
          {T.promoTiers.map(([n, what]) => (
            <li key={n}><strong>{n}</strong><span>{what}</span></li>
          ))}
        </ul>
        <div className="pen-promo-actions">
          <button ref={go} type="button" className="pen-btn pen-btn-accent" onClick={() => { onClose(); router.push('/pen/settings/invite') }}>{T.promoGo}</button>
          <button type="button" className="pen-btn" onClick={onClose}>{T.promoLater}</button>
        </div>
      </div>
    </div>,
    host,
  )
}

/**
 * The background uploads (importPicked): a small card in the corner instead of a window that
 * blocks the app. While going: how many are done, overall progress, the files on demand. When
 * finished: what happens next (the briefing emails), anything held or failed, and the way to ask
 * about them on WhatsApp.
 */
function UploadCard({ uploads, onClose, whatsapp, phone, T }: { uploads: UploadItem[]; onClose: () => void; whatsapp: { number: string; linked: boolean } | null; phone: boolean; T: AppCopy }) {
  const [open, setOpen] = useState(false)
  if (!uploads.length) return null
  const finished = uploads.filter((u) => u.state === 'done' || u.state === 'held' || u.state === 'error')
  const going = finished.length < uploads.length
  const pct = Math.round(uploads.reduce((n, u) => n + (u.state === 'waiting' ? 0 : u.state === 'working' ? u.pct : 100), 0) / uploads.length)
  const ok = uploads.filter((u) => u.state === 'done').length
  const held = uploads.filter((u) => u.state === 'held').length
  const failed = uploads.filter((u) => u.state === 'error')
  // Portalled to .pen-root like the referral pop-up: inside the shell, the recordings rail
  // painted over it (5 Oct).
  const host = typeof document !== 'undefined' ? document.querySelector('.pen-root') ?? document.body : null
  if (!host) return null
  return createPortal(
    <div className="pen-upcard" data-phone={phone ? 'true' : undefined} role="status" aria-live="polite">
      <div className="pen-upcard-head">
        <strong>{going ? T.upTitle(finished.length, uploads.length) : T.upDoneTitle(ok + held)}</strong>
        {!going && <button type="button" className="pen-upcard-x" onClick={onClose} aria-label={T.upClose}>&times;</button>}
      </div>
      {going ? (
        <>
          <div className="pen-meter-bar"><span style={{ width: `${pct}%` }} /></div>
          <p className="pen-upcard-note">{phone ? T.upKeepOpenPhone : T.upKeepOpen}</p>
        </>
      ) : (
        <>
          {ok + held > 0 && <p className="pen-upcard-note">{T.upDoneBody}</p>}
          {held > 0 && <p className="pen-upcard-note">{T.upHeld(held)}</p>}
          {failed.length > 0 && (
            <div className="pen-upcard-err">
              {T.upFailed(failed.length)}
              <ul>{failed.map((f) => <li key={f.key}><span className="pen-mono">{f.name}</span>: {f.error}</li>)}</ul>
            </div>
          )}
          {whatsapp && ok + held > 0 && (
            <a
              className="pen-btn pen-btn-accent pen-upcard-wa"
              href={whatsapp.linked ? `https://wa.me/${whatsapp.number}?text=${encodeURIComponent(T.waCallExamples[1])}` : '/pen/settings/whatsapp'}
              {...(whatsapp.linked ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {whatsapp.linked ? T.upAskWa : T.upConnectWa}
            </a>
          )}
        </>
      )}
      {uploads.length > 1 && (
        <button type="button" className="pen-upcard-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? T.upHide : T.upShow}</button>
      )}
      {open && (
        <ul className="pen-upcard-files">
          {uploads.map((u) => (
            <li key={u.key} data-state={u.state}>
              <span className="pen-mono pen-upcard-name">{u.name}</span>
              <span className="pen-upcard-state">
                {u.state === 'done' ? '✓' : u.state === 'error' ? '!' : u.state === 'held' ? '⏸' : u.state === 'waiting' ? T.upWaiting : `${Math.round(u.pct)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>,
    host,
  )
}

/**
 * "Ask Juno on WhatsApp" on Home (Carlitos, 5 Oct: nothing told him how to ask on WhatsApp).
 * Linked: example questions that open the chat with the question typed. Not linked: the way
 * to link. Hidden for good once dismissed on this device.
 */
function AskWhatsApp({ whatsapp, T }: { whatsapp: { number: string; linked: boolean } | null; T: AppCopy }) {
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    let h = false
    try { h = localStorage.getItem('juno-wa-callout-hidden') === '1' } catch {}
    setHidden(h)
  }, [])
  // Linked users already have WhatsApp one tap away (the phone's tab) and "Juno is waiting on
  // you" on Home; the callout would only push that down.
  if (!whatsapp || whatsapp.linked || hidden) return null
  const hide = () => {
    setHidden(true)
    try { localStorage.setItem('juno-wa-callout-hidden', '1') } catch {}
  }
  return (
    <section className="pen-wacall" aria-label={T.waCallTitle}>
      <div className="pen-wacall-head">
        <span className="pen-wacall-icon" aria-hidden="true"><Icon name="chat" size={18} /></span>
        <strong>{T.waCallTitle}</strong>
        <button type="button" className="pen-wacall-hide" onClick={hide}>{T.waCallHide}</button>
      </div>
      {whatsapp.linked ? (
        <>
          <p>{T.waCallBody}</p>
          <div className="pen-wacall-qs">
            {T.waCallExamples.map((q) => (
              <a key={q} className="pen-wacall-q" href={`https://wa.me/${whatsapp.number}?text=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer">“{q}”</a>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>{T.waCallConnectBody}</p>
          <div><a className="pen-btn pen-btn-accent" href="/pen/settings/whatsapp">{T.waCallConnect}</a></div>
        </>
      )}
    </section>
  )
}

/**
 * "Help us make Juno better": three questions, once per account (lib/pen/feedback.ts). The
 * first is required; the two written ones are optional so a busy agent can answer in a tap.
 */
function FeedbackAsk({ T, onClose }: { T: AppCopy; onClose: (answered: boolean) => void }) {
  const [pick, setPick] = useState<'very' | 'somewhat' | 'not' | null>(null)
  const [fix, setFix] = useState('')
  const [tell, setTell] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [thanks, setThanks] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(thanks) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, thanks])
  async function send() {
    if (!pick) return
    setBusy(true); setErr(null)
    try {
      await postJson('/api/pen/feedback', { disappointed: pick, fix, tell })
      setThanks(true)
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const host = typeof document !== 'undefined' ? document.querySelector('.pen-root') ?? document.body : null
  if (!host) return null
  return createPortal(
    <div className="pen-promo" role="dialog" aria-modal="true" aria-labelledby="pen-fb-title">
      <div className="pen-promo-dim" onClick={() => onClose(thanks)} aria-hidden="true" />
      <div className="pen-promo-card pen-fb-card">
        <div className="pen-promo-band">
          <span className="pen-promo-eyebrow">{T.fbEyebrow}</span>
          <h2 id="pen-fb-title" className="pen-display pen-promo-title">{thanks ? T.fbThanksTitle : T.fbTitle}</h2>
        </div>
        {thanks ? (
          <>
            <p className="pen-promo-lede">{T.fbThanks}</p>
            <div className="pen-promo-actions"><button type="button" className="pen-btn pen-btn-accent" onClick={() => onClose(true)}>{T.fbDone}</button></div>
          </>
        ) : (
          <>
            <fieldset className="pen-fb-q">
              <legend>{T.fbQ1}</legend>
              <div className="pen-fb-opts" role="radiogroup">
                {(['very', 'somewhat', 'not'] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={pick === v} className="pen-set-chip" data-on={pick === v} onClick={() => setPick(v)}>
                    {T.fbOpts[v]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="pen-fb-q">
              <span>{T.fbQ2} <em>{T.fbOptional}</em></span>
              <textarea rows={2} maxLength={2000} value={fix} onChange={(e) => setFix(e.target.value)} />
            </label>
            <label className="pen-fb-q">
              <span>{T.fbQ3} <em>{T.fbOptional}</em></span>
              <textarea rows={2} maxLength={2000} value={tell} onChange={(e) => setTell(e.target.value)} placeholder={T.fbQ3Ph} />
            </label>
            {err && <div className="pen-su-err">{err}</div>}
            <div className="pen-promo-actions">
              <button type="button" className="pen-btn pen-btn-accent" onClick={send} disabled={!pick || busy}>{busy ? T.fbSending : T.fbSend}</button>
              <button type="button" className="pen-btn" onClick={() => onClose(false)}>{T.promoLater}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    host,
  )
}

/** "Send to Notion" on a note (lib/pen/notion.ts). Not connected yet: goes to Settings → Notion. */
function NotionButton({ sessionId, connected, sentUrl }: { sessionId: string; connected: boolean; sentUrl: string | null }) {
  const T = useCopy(APP_COPY)
  const [busy, setBusy] = useState(false)
  // Already in Notion (sent by hand or automatically): open it rather than offer to send.
  const [url, setUrl] = useState<string | null>(sentUrl)
  const [err, setErr] = useState<string | null>(null)
  if (!connected) return <a className="pen-btn" href="/pen/settings/notion">{T.notionSend}</a>
  if (url) return <a className="pen-notion-sent" href={url} target="_blank" rel="noreferrer">{T.notionOpen} ↗</a>
  async function send() {
    setBusy(true); setErr(null)
    try {
      const j = await postJson<{ url: string }>('/api/pen/notion/send', { id: sessionId })
      setUrl(j.url)
      window.open(j.url, '_blank', 'noopener')
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="pen-btn" onClick={send} disabled={busy}>{busy ? T.notionSending : T.notionSend}</button>
      {err && <span className="pen-ref-err">{err}</span>}
    </>
  )
}

/* ------------------------------------------------------------ sidebar menus */

/** Esc and an outside click close a small menu; Esc hands focus back to its button. */
/**
 * "Send to Google Docs" on a note (lib/pen/google-exports.ts). The Doc is made once; sending
 * again opens the same one. Not connected yet: Settings → Google, at Docs & Sheets.
 */
function GoogleDocsButton({ sessionId, connected }: { sessionId: string; connected: boolean }) {
  const T = useCopy(APP_COPY)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!connected) return <a className="pen-btn" role="menuitem" href="/pen/settings/google"><Icon name="doc" size={15} />{T.gdocSend}</a>
  if (url) return <a className="pen-notion-sent" href={url} target="_blank" rel="noreferrer">{T.gdocOpen} ↗</a>
  async function send() {
    setBusy(true); setErr(null)
    // Opened now, inside the click, so the browser doesn't block it; pointed at the Doc when it exists.
    const win = window.open('', '_blank')
    try {
      const j = await postJson<{ url: string }>('/api/pen/google-docs/send', { id: sessionId })
      setUrl(j.url)
      if (win) { win.opener = null; win.location.href = j.url }
      else window.open(j.url, '_blank', 'noopener')
    } catch (e) {
      win?.close()
      setErr(errMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="pen-btn" role="menuitem" onClick={send} disabled={busy}><Icon name="doc" size={15} />{busy ? T.notionSending : T.gdocSend}</button>
      {err && <span className="pen-ref-err">{err}</span>}
    </>
  )
}

function useMenu() {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        btn.current?.focus()
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        if (!items.length) return
        e.preventDefault()
        const at = items.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
        items[next].focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Focus the first item, so the keyboard lands inside the menu it just opened.
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, wrap, btn }
}

/**
 * "More ways to import": a transcript, Notion, WhatsApp. One secondary button under the drop
 * zone instead of three separate rows. Each item is the handler or link the old row used.
 */
function ImportMenu({
  T,
  onTranscript,
  onNotion,
  whatsapp,
}: {
  T: AppCopy
  onTranscript: (() => void) | null
  onNotion: (() => void) | null
  whatsapp: { href: string; external: boolean; label: string } | null
}) {
  const m = useMenu()
  if (!onTranscript && !onNotion && !whatsapp) return null
  const pick = (fn: () => void) => () => { m.setOpen(false); fn() }
  return (
    <div className="pen-imenu" ref={m.wrap}>
      <button
        ref={m.btn}
        type="button"
        className="pen-imenu-btn"
        aria-haspopup="menu"
        aria-expanded={m.open}
        onClick={() => m.setOpen((v) => !v)}
      >
        <Icon name="plus" size={15} />
        <span>{T.moreImports}</span>
        <Icon name="chevron" size={14} className="pen-imenu-chev" />
      </button>
      {m.open && (
        <div className="pen-menu" role="menu" aria-label={T.moreImports}>
          {onTranscript && (
            <button type="button" role="menuitem" className="pen-menu-item" onClick={pick(onTranscript)}>
              <Icon name="quote" size={15} />{T.importTranscript}
            </button>
          )}
          {onNotion && (
            <button type="button" role="menuitem" className="pen-menu-item" onClick={pick(onNotion)}>
              <Icon name="link" size={15} />{T.importNotion}
            </button>
          )}
          {whatsapp && (
            <a
              role="menuitem"
              className="pen-menu-item"
              href={whatsapp.href}
              onClick={() => m.setOpen(false)}
              {...(whatsapp.external ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              <Icon name="chat" size={15} />{whatsapp.label}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A chat in the sidebar, with a "⋯" menu: rename in place (Enter saves, Esc cancels) or
 * delete after a confirmation. Uses PATCH and DELETE on /api/pen/chats/[id], which only
 * touch the signed-in user's own chats.
 */
function ChatRow({
  chat,
  T,
  active,
  onOpen,
  onRenamed,
  onDeleted,
}: {
  chat: ChatSummary
  T: AppCopy
  active: boolean
  onOpen: () => void
  onRenamed: () => void
  onDeleted: () => void
}) {
  const m = useMenu()
  const title = chat.title ?? T.untitledChat
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) requestAnimationFrame(() => { input.current?.focus(); input.current?.select() })
  }, [editing])

  const save = async () => {
    const t = draft.trim()
    if (!t || t === title) { setEditing(false); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/pen/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setEditing(false)
      setErr(false)
      onRenamed()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    m.setOpen(false)
    if (!window.confirm(T.confirmDeleteChat(title))) { m.btn.current?.focus(); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/pen/chats/${chat.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(String(r.status))
      onDeleted()
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="pen-chatrow pen-chatrow-edit">
        <input
          ref={input}
          className="pen-chatrow-input"
          value={draft}
          maxLength={140}
          disabled={busy}
          aria-label={T.renameChatAria}
          aria-invalid={err || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void save() }
            if (e.key === 'Escape') { e.preventDefault(); setDraft(title); setEditing(false); setErr(false) }
          }}
          onBlur={() => { if (!busy) { setDraft(title); setEditing(false) } }}
        />
        {err && <span className="pen-chatrow-err" role="alert">{T.chatActionFailed}</span>}
      </div>
    )
  }

  return (
    <div className="pen-chatrow" data-active={active} ref={m.wrap}>
      <button type="button" className="pen-cat pen-chatrow-open" data-active={active} onClick={onOpen} title={title} disabled={busy}>
        <span className="pen-cat-label">{title}</span>
      </button>
      <button
        ref={m.btn}
        type="button"
        className="pen-chatrow-more"
        aria-haspopup="menu"
        aria-expanded={m.open}
        aria-label={T.chatOptions(title)}
        onClick={(e) => { e.stopPropagation(); m.setOpen((v) => !v) }}
      >
        <span aria-hidden>⋯</span>
      </button>
      {m.open && (
        <div className="pen-menu pen-menu-right" role="menu" aria-label={T.chatOptions(title)}>
          <button type="button" role="menuitem" className="pen-menu-item" onClick={() => { m.setOpen(false); setDraft(title); setEditing(true) }}>
            <Icon name="pen" size={15} />{T.renameChat}
          </button>
          <button type="button" role="menuitem" className="pen-menu-item pen-menu-danger" onClick={() => void remove()}>
            <Icon name="trash" size={15} />{T.deleteChat}
          </button>
        </div>
      )}
      {err && <span className="pen-chatrow-err" role="alert">{T.chatActionFailed}</span>}
    </div>
  )
}

/* ------------------------------------------------------------ recording pills */

/** A handful of tints for the free-form category, matched on meaning; anything else is neutral. */
function catTint(label: string): string {
  const c = label.toLowerCase()
  if (/(shopping|purchase|buying|store|grocer|order)/.test(c)) return 'shop'
  if (/(to-?do|task|note|memo|admin|reminder)/.test(c)) return 'notes'
  if (/(product|plan|strategy|brainstorm|idea|roadmap|design|pitch|demo)/.test(c)) return 'product'
  if (/(talk|lecture|class|lesson|coach|mentor|course|conference|webinar|seminar)/.test(c)) return 'talk'
  if (/(meeting|call|interview|one-on-one|1:1|sync|discussion|client|sales|discovery|board|review|catch|coffee|viewing)/.test(c)) return 'meet'
  return 'neutral'
}

/**
 * The pills on a recording row: its category (the recording's own label) and its language when
 * the transcript has one. A recording that is still processing or has failed keeps its status
 * pill, first, because that is the thing to know about it; a finished one doesn't need it.
 */
function RecPills({ s, T, lang }: { s: PenSession; T: AppCopy; lang: Lang }) {
  const label = displayType(s.meeting_type) ? typeLabel(s.meeting_type, lang) : ''
  const showStatus = s.status !== 'noted'
  const code = (s.language ?? '').trim().slice(0, 2).toUpperCase()
  if (!label && !showStatus && !code) return null
  return (
    <span className="pen-recpills">
      {showStatus && <span className="pen-pill" data-s={s.status}>{T.status[s.status] ?? s.status}</span>}
      {label && <span className="pen-catpill" data-tint={catTint(label)} title={label}>{label}</span>}
      {code && <span className="pen-langpill">{code}</span>}
    </span>
  )
}
