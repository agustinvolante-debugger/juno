'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PenSession, MeetingType, ChatTurn, PenNotes, NoteBlock } from '@/lib/pen/store'
import NoteEditor, { blocksFrom } from './NoteEditor'
import TranscriptEditor from './TranscriptEditor'
import ArchivePalette from './ArchivePalette'
import Overview from './Overview'
import type { ArchiveStats } from '@/lib/pen/stats'
import DeliverableSheet, { DeliverableActions, type SheetRequest } from './DeliverableSheet'
import SendBriefing from './SendBriefing'
import { prepareAudio, fmtMB, fmtDur, SOFT_SIZE_LIMIT } from '@/lib/pen/encode'

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
const MEDIA_RE = /\.(wav|wave|mp3|m4a|aac|ogg|opus|webm|amr|3gp|wma|flac|aif|aiff|mp4|m4v|mov|qt)$/i

const TYPE_LABEL: Record<MeetingType, string> = {
  showing: 'Property showing',
  clinical: 'Clinical / admin',
  generic: 'General meeting',
}

type Pending = { file: File; picked: boolean }
type Progress = { name: string; phase: string; pct: number }

export default function PenApp({
  initial,
  stats,
  loadError,
}: {
  initial: PenSession[]
  stats: ArchiveStats | null
  loadError: string | null
}) {
  const [sessions, setSessions] = useState<PenSession[]>(initial)
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null)
  const [pending, setPending] = useState<Pending[]>([])
  const [penName, setPenName] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [clientName, setClientName] = useState('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [tab, setTab] = useState<'note' | 'transcript'>('note')
  const [chatOpen, setChatOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const active = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId])

  // Feature-detect after mount, or the server and client disagree and the fallback banner flashes.
  const [mounted, setMounted] = useState(false)
  const [supportsPicker, setSupportsPicker] = useState(false)
  useEffect(() => {
    setMounted(true)
    setSupportsPicker(typeof window.showDirectoryPicker === 'function')
  }, [])

  const refresh = useCallback(async () => {
    const r = await fetch('/api/pen/sessions', { cache: 'no-store' })
    if (!r.ok) return
    setSessions(((await r.json()) as { sessions: PenSession[] }).sessions)
  }, [])

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
      setActiveId((cur) => (cur === id ? (next[0]?.id ?? null) : cur))
      return next
    })
  }, [])

  const makeNotes = useCallback(
    async (id: string, type?: MeetingType) => {
      const r = await fetch('/api/pen/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...(type ? { type } : {}) }),
      })
      if (!r.ok) {
        setErr((await r.json()).error ?? 'could not write the notes')
        return
      }
      patchLocal(((await r.json()) as { session: PenSession }).session)
    },
    [patchLocal],
  )

  // Poll anything mid-transcription. Also covers a webhook that never arrives.
  const busyKey = sessions.map((s) => `${s.id}:${s.status}`).join(',')
  useEffect(() => {
    const busy = sessions.filter((s) => s.status === 'transcribing')
    if (!busy.length) return
    const t = setInterval(async () => {
      for (const s of busy) {
        const r = await fetch(`/api/pen/transcribe?id=${s.id}`, { cache: 'no-store' })
        if (!r.ok) continue
        const j = (await r.json()) as { session?: PenSession }
        if (j.session && j.session.status !== 'transcribing') {
          patchLocal(j.session)
          if (j.session.status === 'transcribed') void makeNotes(j.session.id)
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

        if (prep.blob.size > SOFT_SIZE_LIMIT) {
          throw new Error(
            `${fmtMB(prep.blob.size)} is over the storage limit on this plan. Split the recording, ` +
              `or lower the segment length on the pen so it saves shorter files.`,
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
            client_name: clientName.trim() || undefined,
          }),
        })
        if (!sRes.ok) throw new Error((await sRes.json()).error ?? 'could not save the recording')
        const { session, duplicate } = (await sRes.json()) as { session: PenSession; duplicate: boolean }

        setSessions((prev) => [session, ...prev.filter((x) => x.id !== session.id)])
        setActiveId(session.id)

        if (!duplicate) {
          setProgress({ name: file.name, phase: 'Sending for transcription', pct: 92 })
          const tRes = await fetch('/api/pen/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: session.id, speakers: 3 }),
          })
          if (!tRes.ok) setErr((await tRes.json()).error ?? 'transcription failed to start')
          else setSessions((prev) => prev.map((x) => (x.id === session.id ? { ...x, status: 'transcribing' as const } : x)))
        }
      } catch (e) {
        setErr(`${file.name}: ${(e as Error).message}`)
      }
    }
    setProgress(null)
    setPending([])
    void refresh()
  }

  /* ------------------------------------------------------------------- view */

  const grouped = useMemo(() => groupByDay(sessions), [sessions])

  return (
    <main className="mx-auto max-w-[1460px] px-5 pb-24 pt-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--line)' }}>
        <div>
          <div className="pen-label mb-1.5">Recorder → notes</div>
          <h1 className="pen-display text-[34px] leading-none">Pen</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="pen-cmdk" onClick={() => setPaletteOpen(true)} title="Ask across every recording">
            <span>Ask your archive</span>
            <kbd className="pen-kbd">&#8984;K</kbd>
          </button>
          {supportsPicker && (
            <button className="pen-btn pen-btn-primary" onClick={connectPen}>
              Connect pen
            </button>
          )}
          <button className="pen-btn" onClick={() => fileInput.current?.click()}>
            Add files
          </button>
          <input ref={fileInput} type="file" multiple accept="audio/*,video/mp4,video/quicktime,video/x-m4v,.mov,.mp4,.m4v" className="hidden"
                 onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>
      </header>

      {loadError && (
        <Banner tone="bad">
          Couldn’t load recordings: {loadError}
          <div className="mt-1 text-[12.5px]" style={{ color: 'var(--soft)' }}>
            If a column is missing, run the ALTER at the bottom of <span className="pen-mono">lib/pen/schema.sql</span>.
          </div>
        </Banner>
      )}
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {mounted && !supportsPicker && (
        <Banner tone="warn">
          This browser can’t read a folder directly. Use Chrome or Edge for one-click “Connect pen”, or drag files in below.
        </Banner>
      )}

      {(pending.length > 0 || progress) && (
        <ImportTray
          pending={pending} setPending={setPending} penName={penName}
          consent={consent} setConsent={setConsent}
          clientName={clientName} setClientName={setClientName}
          progress={progress} onImport={importPicked}
        />
      )}

      <div className="mt-7 grid gap-8 lg:grid-cols-[286px_minmax(0,1fr)]">
        {/* ---------------------------------------------------------- rail */}
        <aside>
          <div
            className="pen-drop px-5 py-6 text-center"
            data-over={dragOver}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
          >
            <div className="pen-label">Drop recordings</div>
          </div>

          {sessions.length === 0 ? (
            <p className="mt-6 text-[14px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              Nothing yet. Plug the pen into USB, press <strong style={{ color: 'var(--soft)' }}>Connect pen</strong>,
              and choose the drive that appears.
            </p>
          ) : (
            <div className="mt-6">
              <button
                className="pen-ov-back"
                data-active={activeId === null}
                onClick={() => setActiveId(null)}
              >
                Your archive
                {stats && stats.actionsOpen > 0 && (
                  <span className="pen-ov-badge">{stats.actionsOpen}</span>
                )}
              </button>
              {grouped.map(([day, rows]) => (
                <div key={day} className="mb-5">
                  <div className="pen-label mb-1.5">{day}</div>
                  {rows.map((s) => (
                    <div key={s.id} className="pen-row px-2.5 py-3" data-active={s.id === activeId}
                         onClick={() => { setActiveId(s.id); setTab('note'); setChatOpen(false) }}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="pen-row-title min-w-0 flex-1 text-[14.5px] font-medium leading-snug">
                          {s.title || s.client_name || s.source_name || 'Untitled'}
                        </span>
                        <span className="pen-pill" data-s={s.status}>{s.status}</span>
                      </div>
                      <div className="pen-mono mt-1.5 text-[10.5px]" style={{ color: 'var(--faint)' }}>
                        {fmtDur(s.duration_sec ?? 0)}
                        {s.meeting_type ? ` · ${TYPE_LABEL[s.meeting_type].toLowerCase()}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* -------------------------------------------------------- detail */}
        <section className="min-w-0">
          {!active ? (
            stats ? (
              <Overview
                stats={stats}
                onOpen={(id) => {
                  setActiveId(id)
                  setTab('note')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              />
            ) : (
              <div className="pen-panel px-8 py-16 text-center">
                <p className="text-[15px]" style={{ color: 'var(--dim)' }}>Choose a recording on the left.</p>
              </div>
            )
          ) : (
            <div className={chatOpen ? 'grid gap-7 xl:grid-cols-[minmax(0,1fr)_352px]' : ''}>
              <Detail
                session={active} tab={tab} setTab={setTab}
                chatOpen={chatOpen} onToggleChat={() => setChatOpen((v) => !v)}
                onNotes={(type) => makeNotes(active.id, type)}
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
      </div>

      <ArchivePalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onCite={(sessionId) => {
          setActiveId(sessionId)
          setTab('note')
          setChatOpen(false)
          setPaletteOpen(false)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </main>
  )
}

/* ============================================================== import tray */

function ImportTray({
  pending, setPending, penName, consent, setConsent, clientName, setClientName, progress, onImport,
}: {
  pending: Pending[]
  setPending: React.Dispatch<React.SetStateAction<Pending[]>>
  penName: string | null
  consent: boolean
  setConsent: (v: boolean) => void
  clientName: string
  setClientName: (v: string) => void
  progress: Progress | null
  onImport: () => void
}) {
  return (
    <section className="pen-panel mt-6 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="pen-display text-[20px]">
          {penName ? `${pending.length} on “${penName}”` : 'Ready to import'}
        </h2>
        {pending.length > 0 && (
          <button className="pen-mono text-[11px] underline" style={{ color: 'var(--dim)' }} onClick={() => setPending([])}>
            clear
          </button>
        )}
      </div>

      <ul className="mt-4">
        {pending.map((p, i) => (
          <li key={`${p.file.name}-${i}`} className="flex items-center gap-3 border-t py-2.5" style={{ borderColor: 'var(--hair)' }}>
            <input type="checkbox" className="pen-act-box" checked={p.picked}
                   onChange={(e) => setPending((prev) => prev.map((x, j) => (j === i ? { ...x, picked: e.target.checked } : x)))} />
            <span className="min-w-0 flex-1 truncate text-[14px]">{p.file.name}</span>
            <span className="pen-mono text-[11px]" style={{ color: 'var(--dim)' }}>{fmtMB(p.file.size)}</span>
            <span className="pen-mono text-[11px]" style={{ color: 'var(--faint)' }}>
              {new Date(p.file.lastModified).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="pen-label">Who was this with (optional)</span>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)}
                 placeholder="e.g. the Hendersons"
                 className="mt-1.5 w-full rounded-lg border px-3 py-2 text-[14px] outline-none"
                 style={{ borderColor: 'var(--line)', background: 'var(--panel)' }} />
          <span className="mt-1 block text-[11.5px]" style={{ color: 'var(--faint)' }}>
            Naming them is what lets meetings build on each other.
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg p-3.5" style={{ background: 'var(--warn-wash)', border: '1px solid #EFE2C4' }}>
          <input type="checkbox" className="pen-act-box mt-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-[12.5px] leading-snug" style={{ color: 'var(--warn)' }}>
            Everyone recorded agreed to it, and this recording contains no patient or medical information.
          </span>
        </label>
      </div>

      {progress ? (
        <div className="mt-5">
          <div className="pen-mono flex justify-between text-[11px]" style={{ color: 'var(--soft)' }}>
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

/* =================================================================== detail */

function Detail({
  session, tab, setTab, chatOpen, onToggleChat, onNotes, onDelete, onPatch,
}: {
  session: PenSession
  tab: 'note' | 'transcript'
  setTab: (t: 'note' | 'transcript') => void
  chatOpen: boolean
  onToggleChat: () => void
  onNotes: (type?: MeetingType) => void
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
  const [tState, setTState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const dirtyT = useRef(false)
  useEffect(() => {
    setTEdits(session.transcript_edits ?? {})
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="pen-display text-[29px] leading-[1.12]">
            {session.title || n.headline || session.source_name || 'Untitled'}
          </h2>
          <div className="pen-mono mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]" style={{ color: 'var(--dim)' }}>
            <span>{session.recorded_at ? new Date(session.recorded_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
            <span style={{ color: 'var(--faint)' }}>·</span>
            <span>{fmtDur(session.duration_sec ?? 0)}</span>
            {session.client_name && (<><span style={{ color: 'var(--faint)' }}>·</span><span>{session.client_name}</span></>)}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="pen-pill" data-s={session.status}>{session.status}</span>
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
      <div className="mt-5 flex items-center justify-between gap-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex gap-1">
          {(['note', 'transcript'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="pen-mono px-3 py-2.5 text-[11.5px] uppercase tracking-wider"
                    style={{
                      color: tab === t ? 'var(--ink)' : 'var(--dim)',
                      borderBottom: tab === t ? '2px solid var(--ink)' : '2px solid transparent',
                      marginBottom: -1,
                    }}>
              {t}{t === 'transcript' && utts.length ? ` ${utts.length}` : ''}
            </button>
          ))}
        </div>
        {n.meeting_type && (
          <label className="flex items-center gap-2 pb-1.5">
            <span className="pen-label">Type</span>
            <select value={session.meeting_type ?? n.meeting_type} disabled={busy}
                    onChange={(e) => regenerate(e.target.value as MeetingType)}
                    className="pen-mono rounded-md border px-2 py-1 text-[11px] outline-none"
                    style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--soft)' }}>
              {(Object.keys(TYPE_LABEL) as MeetingType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tab === 'transcript' ? (
        <div className="pen-panel mt-6 p-6">
          {utts.length ? (
            <TranscriptEditor
              utterances={utts}
              edits={tEdits}
              saveState={tState}
              onEdit={(i, text) => { dirtyT.current = true; setTEdits((prev) => ({ ...prev, [String(i)]: text })) }}
            />
          ) : session.transcript?.text ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{session.transcript.text}</p>
          ) : (
            <Muted>No transcript yet.</Muted>
          )}
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
            <div className="pen-sec">
              <span className="pen-label">Summary</span>
              <p className="mt-2 text-[16.5px]">{n.summary}</p>
            </div>
          )}

          {!!n.people?.length && (
            <div className="pen-sec">
              <span className="pen-label">In the room</span>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {n.people.map((p, i) => (
                  <span key={i} className="pen-who" title={p.note}>
                    <span className="pen-avatar">{initials(p.name || p.role)}</span>
                    <span className="text-[13.5px]">
                      {p.name || <em style={{ color: 'var(--dim)' }}>{p.role || 'unknown'}</em>}
                      {p.name && p.role && <span style={{ color: 'var(--dim)' }}> · {p.role}</span>}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {!!n.actions?.length && (
            <div className="pen-sec">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="pen-label">Next actions</span>
                <span className="pen-mono text-[10px]" style={{ color: 'var(--faint)' }}>
                  {done.size}/{n.actions.length} done
                </span>
              </div>
              <div className="mt-1.5">
                {n.actions.map((a, i) => (
                  <div key={i} className="pen-act pen-doable" data-done={done.has(i)}>
                    <input type="checkbox" className="pen-act-box" checked={done.has(i)} onChange={() => toggleAction(i)} />
                    <div className="min-w-0 flex-1">
                      <div className="pen-act-text text-[15px] leading-snug">{a.action}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {(a.owner || a.due || a.priority === 'high') && (
                          <div className="pen-mono flex flex-wrap items-center gap-x-2 text-[10.5px]" style={{ color: 'var(--dim)' }}>
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

          {!!n.missed?.length && (
            <div className="pen-sec">
              <div className="pen-missed p-5">
                <span className="pen-label" style={{ color: 'var(--warn)' }}>You might have missed</span>
                <ul className="mt-2.5 space-y-3">
                  {n.missed.map((m, i) => (
                    <li key={i} className="pen-doable text-[15px] leading-snug">
                      {m.item}
                      {m.why && <div className="mt-0.5 text-[13px]" style={{ color: 'var(--warn)' }}>{m.why}</div>}
                      <div className="mt-1.5">
                        <DeliverableActions onPick={(kind) => setSheet({ kind, item: m.item })} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!!n.decisions?.length && (
            <div className="pen-sec">
              <span className="pen-label">Decided</span>
              <ul className="mt-2 space-y-2">
                {n.decisions.map((d, i) => (
                  <li key={i} className="text-[15px]">
                    {d.decision}
                    {d.who && <span className="pen-mono ml-2 text-[10.5px]" style={{ color: 'var(--dim)' }}>{d.who}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!n.open_questions?.length && (
            <div className="pen-sec">
              <span className="pen-label">Still open</span>
              <ul className="mt-2 list-disc space-y-2.5 pl-5 text-[15px]">
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

          {n.meeting_type === 'showing' && n.showing && <ShowingBlock showing={n.showing} />}
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
              <li key={i} className="text-[15px]">
                <span className="font-medium capitalize">{r.feature}</span>
                <span style={{ color: 'var(--dim)' }}> · {r.who} · </span>
                <span style={{ color: sentimentColor(r.sentiment) }}>{r.sentiment}</span>
                {r.quote && <div className="mt-0.5 text-[14px] italic" style={{ color: 'var(--soft)' }}>“{r.quote}”</div>}
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
              <li key={i} className="text-[15px]">
                {o.objection}<span style={{ color: 'var(--dim)' }}> · {o.who}</span>
                {o.quote && <div className="mt-0.5 text-[14px] italic" style={{ color: 'var(--soft)' }}>“{o.quote}”</div>}
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
              <li key={i} className="flex items-baseline gap-2 text-[15px]">
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
            <p className="mb-2 mt-1 text-[12.5px]" style={{ color: 'var(--soft)' }}>
              Inferred from what they reacted to, not from what they said.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[15px]">
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
    const t = session.meeting_type ?? session.notes?.meeting_type
    if (t === 'showing') setSuggestions(['What did they actually like?', 'What were the objections?', 'Did they say they’d come back?'])
    else if (t === 'clinical') setSuggestions(['What needs doing today?', 'Who owes me something?', 'What did I agree to follow up on?'])
    else setSuggestions(['What did I commit to?', 'What did I miss?', 'Was anything left unresolved?'])
  }, [session.id, session.meeting_type, session.notes?.meeting_type])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat.length, thinking])

  async function ask(question: string) {
    if (!question.trim() || thinking) return
    setError(null)
    setThinking(true)
    setQ('')
    try {
      const r = await fetch('/api/pen/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, question }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'could not get an answer')
      onChat({ ...session, chat: ((await r.json()) as { chat: ChatTurn[] }).chat })
    } catch (e) {
      setError((e as Error).message)
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
            <button className="pen-mono text-[10px] underline" style={{ color: 'var(--dim)' }} onClick={reset}>clear</button>
          )}
          <button className="pen-mono text-[14px] leading-none xl:hidden" style={{ color: 'var(--dim)' }} onClick={onClose}>×</button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {chat.length === 0 && (
          <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
            Answers come only from this recording. If it isn’t in there, it’ll say so rather than guess.
          </p>
        )}
        {chat.map((t, i) => (
          <div key={i} className="pen-chat-msg px-3.5 py-2.5 text-[14px] leading-relaxed" data-role={t.role}>
            {t.content}
          </div>
        ))}
        {thinking && (
          <div className="pen-chat-msg px-3.5 py-3" data-role="assistant">
            <span className="pen-dots"><span /><span /><span /></span>
          </div>
        )}
        {error && <p className="text-[12.5px]" style={{ color: 'var(--bad)' }}>{error}</p>}
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
          className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border px-3 py-2 text-[14px] outline-none"
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
  return <p className="text-[14px]" style={{ color: 'var(--dim)' }}>{children}</p>
}

function Banner({ children, tone, onClose }: { children: React.ReactNode; tone: 'bad' | 'warn'; onClose?: () => void }) {
  const bad = tone === 'bad'
  return (
    <div className="mt-4 flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-[13px]"
         style={{
           background: bad ? 'var(--bad-wash)' : 'var(--warn-wash)',
           color: bad ? 'var(--bad)' : 'var(--warn)',
           border: `1px solid ${bad ? '#EFD6D2' : '#EFE2C4'}`,
         }}>
      <div>{children}</div>
      {onClose && <button onClick={onClose} className="pen-mono shrink-0 text-[15px] leading-none">×</button>}
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
