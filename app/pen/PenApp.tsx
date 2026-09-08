'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PenSession } from '@/lib/pen/store'
import { prepareAudio, fmtMB, fmtDur } from '@/lib/pen/encode'

// The File System Access API isn't in the default TS lib.
type FsHandle = { kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> }
type FsDir = { name: string; values: () => AsyncIterable<FsHandle> }
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FsDir>
  }
}

const AUDIO_RE = /\.(wav|mp3|m4a|aac|ogg|opus|webm|amr|3gp|wma|flac)$/i

type Pending = { file: File; picked: boolean }
type Progress = { name: string; phase: string; pct: number }

export default function PenApp({ initial, loadError }: { initial: PenSession[]; loadError: string | null }) {
  const [sessions, setSessions] = useState<PenSession[]>(initial)
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null)
  const [pending, setPending] = useState<Pending[]>([])
  const [penName, setPenName] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [clientName, setClientName] = useState('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [tab, setTab] = useState<'notes' | 'transcript'>('notes')
  const fileInput = useRef<HTMLInputElement>(null)

  const active = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId])

  // Feature-detect after mount. Reading window during render makes the server and client
  // disagree (server: no picker, client: picker), which is a hydration mismatch and makes
  // the fallback banner flash on every load.
  const [mounted, setMounted] = useState(false)
  const [supportsPicker, setSupportsPicker] = useState(false)
  useEffect(() => {
    setMounted(true)
    setSupportsPicker(typeof window.showDirectoryPicker === 'function')
  }, [])

  const refresh = useCallback(async () => {
    const r = await fetch('/api/pen/sessions', { cache: 'no-store' })
    if (!r.ok) return
    const j = (await r.json()) as { sessions: PenSession[] }
    setSessions(j.sessions)
  }, [])

  // Anything mid-transcription gets polled. This also covers the case where the webhook
  // isn't configured (local dev) or never fires.
  useEffect(() => {
    const busy = sessions.filter((s) => s.status === 'transcribing')
    if (!busy.length) return
    const t = setInterval(async () => {
      for (const s of busy) {
        const r = await fetch(`/api/pen/transcribe?id=${s.id}`, { cache: 'no-store' })
        if (!r.ok) continue
        const j = (await r.json()) as { session?: PenSession }
        if (j.session && j.session.status !== 'transcribing') {
          setSessions((prev) => prev.map((x) => (x.id === j.session!.id ? j.session! : x)))
          if (j.session.status === 'transcribed') void makeNotes(j.session.id)
        }
      }
    }, 6000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.map((s) => `${s.id}:${s.status}`).join(',')])

  /* ---------------------------------------------------------------- connect */

  async function connectPen() {
    setErr(null)
    try {
      const dir = await window.showDirectoryPicker!({ id: 'pen-recorder', mode: 'read' })
      const found: File[] = []
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && AUDIO_RE.test(entry.name) && entry.getFile) {
          found.push(await entry.getFile())
        }
      }
      if (!found.length) {
        setErr(`No audio files in "${dir.name}". Cheap recorders often keep them in a subfolder — try picking that folder directly.`)
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
    const list = Array.from(files).filter((f) => AUDIO_RE.test(f.name))
    if (!list.length) {
      setErr('Those files don’t look like audio.')
      return
    }
    setPenName(null)
    setPending((prev) => [...prev, ...list.map((f) => ({ file: f, picked: true }))])
  }

  /* ----------------------------------------------------------------- import */

  async function importPicked() {
    setErr(null)
    const picked = pending.filter((p) => p.picked)
    if (!picked.length) return
    if (!consent) {
      setErr('Confirm consent first. Florida is an all-party-consent state and you are a licensed agent.')
      return
    }

    for (const { file } of picked) {
      try {
        setProgress({ name: file.name, phase: 'Preparing audio', pct: 5 })
        const prep = await prepareAudio(file)

        setProgress({ name: file.name, phase: 'Getting upload slot', pct: 15 })
        const urlRes = await fetch('/api/pen/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, prep.mime === 'audio/wav' ? '.wav' : '') }),
        })
        if (!urlRes.ok) throw new Error((await urlRes.json()).error ?? 'could not get upload URL')
        const { path, signedUrl } = (await urlRes.json()) as { path: string; signedUrl: string }

        await putWithProgress(signedUrl, prep.blob, prep.mime, (pct) =>
          setProgress({ name: file.name, phase: `Uploading (${prep.note})`, pct: 15 + pct * 0.6 }),
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
        if (!sRes.ok) throw new Error((await sRes.json()).error ?? 'could not save session')
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
          if (!tRes.ok) {
            const msg = (await tRes.json()).error ?? 'transcription failed to start'
            setErr(msg)
          } else {
            setSessions((prev) =>
              prev.map((x) => (x.id === session.id ? { ...x, status: 'transcribing' as const } : x)),
            )
          }
        }
      } catch (e) {
        setErr(`${file.name}: ${(e as Error).message}`)
      }
    }
    setProgress(null)
    setPending([])
    void refresh()
  }

  async function makeNotes(id: string) {
    const r = await fetch('/api/pen/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!r.ok) {
      setErr((await r.json()).error ?? 'could not write notes')
      return
    }
    const j = (await r.json()) as { session: PenSession }
    setSessions((prev) => prev.map((x) => (x.id === j.session.id ? j.session : x)))
  }

  /* ------------------------------------------------------------------- view */

  const grouped = useMemo(() => groupByDay(sessions), [sessions])

  return (
    <main className="mx-auto max-w-[1320px] px-5 pb-20 pt-7 sm:px-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--pen-line)' }}>
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Pen</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: 'var(--pen-dim)' }}>
            Plug in the pen, get the showing written up.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {supportsPicker && (
            <button className="pen-btn pen-btn-primary" onClick={connectPen}>
              Connect pen
            </button>
          )}
          <button className="pen-btn" onClick={() => fileInput.current?.click()}>
            Add files
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="audio/*"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>
      </header>

      {loadError && (
        <Banner tone="bad">
          Couldn&apos;t load recordings: {loadError}
          <div className="mt-1 text-[12.5px]" style={{ color: 'var(--pen-soft)' }}>
            If this says a relation doesn&apos;t exist, run <span className="pen-mono">lib/pen/schema.sql</span> in the
            Supabase SQL editor and create a private bucket called <span className="pen-mono">pen-audio</span>.
          </div>
        </Banner>
      )}
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {mounted && !supportsPicker && (
        <Banner tone="warn">
          This browser can&apos;t read a folder directly. Use Chrome or Edge for the one-click
          &ldquo;Connect pen&rdquo; flow, or drag the files in below.
        </Banner>
      )}

      {/* ------------------------------------------------------- import tray */}
      {(pending.length > 0 || progress) && (
        <section className="pen-panel mt-5 rounded-xl p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">
              {penName ? `${pending.length} recording${pending.length === 1 ? '' : 's'} on “${penName}”` : 'Ready to import'}
            </h2>
            {pending.length > 0 && (
              <button
                className="text-[12.5px] underline"
                style={{ color: 'var(--pen-dim)' }}
                onClick={() => setPending([])}
              >
                clear
              </button>
            )}
          </div>

          <ul className="mt-3 divide-y" style={{ borderColor: 'var(--pen-line-soft)' }}>
            {pending.map((p, i) => (
              <li key={`${p.file.name}-${i}`} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={p.picked}
                  onChange={(e) =>
                    setPending((prev) => prev.map((x, j) => (j === i ? { ...x, picked: e.target.checked } : x)))
                  }
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.file.name}</span>
                <span className="pen-mono text-[12px]" style={{ color: 'var(--pen-dim)' }}>
                  {fmtMB(p.file.size)}
                </span>
                <span className="pen-mono text-[12px]" style={{ color: 'var(--pen-faint)' }}>
                  {new Date(p.file.lastModified).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] uppercase tracking-wide" style={{ color: 'var(--pen-dim)' }}>
                Buyer name (optional, but it&apos;s what makes showings compound)
              </span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. the Hendersons"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-[14px] outline-none"
                style={{ borderColor: 'var(--pen-line)', background: '#fff' }}
              />
            </label>
            <label className="flex items-start gap-2.5 rounded-lg p-3" style={{ background: 'var(--pen-warn-soft)' }}>
              <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-[12.5px] leading-snug" style={{ color: 'var(--pen-warn)' }}>
                Everyone recorded gave permission. Florida requires all-party consent and you hold a
                licence, so nothing is processed without this.
              </span>
            </label>
          </div>

          {progress ? (
            <div className="mt-4">
              <div className="flex justify-between text-[12.5px]" style={{ color: 'var(--pen-soft)' }}>
                <span className="truncate">{progress.name}</span>
                <span className="pen-mono">{progress.phase}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--pen-line)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress.pct}%`, background: 'var(--pen-accent)' }}
                />
              </div>
            </div>
          ) : (
            <button className="pen-btn pen-btn-primary mt-4" onClick={importPicked} disabled={!pending.some((p) => p.picked)}>
              Import {pending.filter((p) => p.picked).length || ''} and transcribe
            </button>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------ body */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* sidebar */}
        <aside>
          <div
            className="pen-drop p-5 text-center"
            data-over={dragOver}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
            }}
          >
            <p className="text-[13px]" style={{ color: 'var(--pen-dim)' }}>
              Drop recordings here
            </p>
          </div>

          {sessions.length === 0 ? (
            <p className="mt-5 text-[13.5px] leading-relaxed" style={{ color: 'var(--pen-dim)' }}>
              Nothing yet. Plug the pen into USB, hit <strong>Connect pen</strong>, and pick the drive
              that appears.
            </p>
          ) : (
            <div className="mt-5">
              {grouped.map(([day, rows]) => (
                <div key={day} className="mb-4">
                  <div
                    className="pen-mono mb-1 text-[10.5px] uppercase tracking-widest"
                    style={{ color: 'var(--pen-faint)' }}
                  >
                    {day}
                  </div>
                  {rows.map((s) => (
                    <div
                      key={s.id}
                      className="pen-row px-1 py-2.5"
                      data-active={s.id === activeId}
                      onClick={() => {
                        setActiveId(s.id)
                        setTab('notes')
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="pen-row-title min-w-0 flex-1 truncate text-[14px] font-medium">
                          {s.title || s.client_name || s.source_name || 'Untitled showing'}
                        </span>
                        <span className="pen-pill" data-s={s.status}>
                          {s.status}
                        </span>
                      </div>
                      <div className="pen-mono mt-1 text-[11.5px]" style={{ color: 'var(--pen-faint)' }}>
                        {fmtDur(s.duration_sec ?? 0)}
                        {s.client_name ? ` · ${s.client_name}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* detail */}
        <section>
          {!active ? (
            <div className="pen-panel rounded-xl p-10 text-center">
              <p className="text-[14px]" style={{ color: 'var(--pen-dim)' }}>
                Pick a showing on the left.
              </p>
            </div>
          ) : (
            <Detail
              session={active}
              tab={tab}
              setTab={setTab}
              onNotes={() => makeNotes(active.id)}
              onPatch={async (patch) => {
                await fetch(`/api/pen/sessions/${active.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(patch),
                })
                setSessions((prev) => prev.map((x) => (x.id === active.id ? { ...x, ...patch } : x)))
              }}
            />
          )}
        </section>
      </div>
    </main>
  )
}

/* ==================================================================== detail */

function Detail({
  session,
  tab,
  setTab,
  onNotes,
  onPatch,
}: {
  session: PenSession
  tab: 'notes' | 'transcript'
  setTab: (t: 'notes' | 'transcript') => void
  onNotes: () => void
  onPatch: (patch: Partial<Pick<PenSession, 'user_notes' | 'title' | 'client_name'>>) => Promise<void>
}) {
  const [draft, setDraft] = useState(session.user_notes ?? '')
  const [saved, setSaved] = useState(true)
  useEffect(() => {
    setDraft(session.user_notes ?? '')
    setSaved(true)
  }, [session.id, session.user_notes])

  // Debounced autosave so his own notes never need a save button.
  useEffect(() => {
    if (draft === (session.user_notes ?? '')) return
    setSaved(false)
    const t = setTimeout(async () => {
      await onPatch({ user_notes: draft })
      setSaved(true)
    }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const n = session.notes ?? {}
  const utts = session.transcript?.utterances ?? []

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px] font-semibold leading-snug tracking-tight">
            {session.title || session.source_name || 'Untitled showing'}
          </h2>
          <div className="pen-mono mt-1 text-[12px]" style={{ color: 'var(--pen-dim)' }}>
            {session.recorded_at ? new Date(session.recorded_at).toLocaleString() : '—'} ·{' '}
            {fmtDur(session.duration_sec ?? 0)}
            {session.client_name ? ` · ${session.client_name}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pen-pill" data-s={session.status}>
            {session.status}
          </span>
          {session.status === 'transcribed' && (
            <button className="pen-btn" onClick={onNotes}>
              Write the notes
            </button>
          )}
          {session.status === 'noted' && (
            <button className="pen-btn" onClick={onNotes}>
              Redo notes
            </button>
          )}
        </div>
      </div>

      {session.error && <Banner tone="bad">{session.error}</Banner>}

      <div className="mt-4 flex gap-1 border-b" style={{ borderColor: 'var(--pen-line)' }}>
        {(['notes', 'transcript'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-2 text-[13.5px] font-medium capitalize"
            style={{
              color: tab === t ? 'var(--pen-ink)' : 'var(--pen-dim)',
              borderBottom: tab === t ? '2px solid var(--pen-ink)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
            {t === 'transcript' && utts.length ? ` (${utts.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'notes' ? (
        <div className="mt-5 space-y-5">
          {/* His own notes first, deliberately. What he wrote is the spine of the note. */}
          <div className="pen-panel rounded-xl p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12px] uppercase tracking-wide" style={{ color: 'var(--pen-dim)' }}>
                Your notes
              </span>
              <span className="pen-mono text-[11px]" style={{ color: 'var(--pen-faint)' }}>
                {saved ? 'saved' : 'saving…'}
              </span>
            </div>
            <textarea
              className="pen-notes"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Anything you want to remember. Type during the showing or right after — this stays yours and the extraction below is separate."
            />
          </div>

          {session.status === 'transcribing' && <Muted>Transcribing. This runs on its own, you can close the tab.</Muted>}
          {session.status === 'uploaded' && <Muted>Uploaded, waiting to be sent for transcription.</Muted>}
          {session.status === 'transcribed' && !n.summary && (
            <Muted>Transcript is ready. Hit &ldquo;Write the notes&rdquo; to run the extraction.</Muted>
          )}

          {n.summary && (
            <div className="pen-panel rounded-xl p-5">
              <Label>Summary</Label>
              <p className="mt-1.5 text-[15px] leading-relaxed">{n.summary}</p>
            </div>
          )}

          {!!n.reactions?.length && (
            <div className="pen-panel rounded-xl p-5">
              <Label>Room by room</Label>
              <ul className="mt-2 space-y-2.5">
                {n.reactions.map((r, i) => (
                  <li key={i} className="text-[14px]">
                    <span className="font-medium capitalize">{r.feature}</span>
                    <span style={{ color: 'var(--pen-dim)' }}> · {r.who} · </span>
                    <span style={{ color: sentimentColor(r.sentiment) }}>{r.sentiment}</span>
                    {r.quote && (
                      <div className="mt-0.5 text-[13.5px] italic" style={{ color: 'var(--pen-soft)' }}>
                        “{r.quote}”
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!n.objections?.length && (
            <div className="pen-panel rounded-xl p-5">
              <Label>Objections</Label>
              <ul className="mt-2 space-y-2.5">
                {n.objections.map((o, i) => (
                  <li key={i} className="text-[14px]">
                    {o.objection}
                    <span style={{ color: 'var(--pen-dim)' }}> · {o.who}</span>
                    {o.quote && (
                      <div className="mt-0.5 text-[13.5px] italic" style={{ color: 'var(--pen-soft)' }}>
                        “{o.quote}”
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!n.signals?.length && (
            <div className="pen-panel rounded-xl p-5">
              <Label>Buying signals</Label>
              <ul className="mt-2 space-y-2">
                {n.signals.map((s, i) => (
                  <li key={i} className="text-[14px]">
                    <span className="pen-pill" data-s={s.strength === 'strong' ? 'noted' : 'uploaded'}>
                      {s.strength}
                    </span>{' '}
                    {s.signal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!n.revealed_criteria?.length && (
            <div className="pen-panel rounded-xl p-5" style={{ borderColor: '#d5e6dc', background: 'var(--pen-accent-soft)' }}>
              <Label>What they actually want</Label>
              <p className="mb-2 mt-0.5 text-[12.5px]" style={{ color: 'var(--pen-soft)' }}>
                Inferred from what they reacted to, not from what they said.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[14px]">
                {n.revealed_criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {!!n.followups?.length && (
            <div className="pen-panel rounded-xl p-5">
              <Label>Follow-ups</Label>
              <ul className="mt-2 space-y-1.5 text-[14px]">
                {n.followups.map((f, i) => (
                  <li key={i}>
                    {f.action}
                    {f.due && <span style={{ color: 'var(--pen-dim)' }}> · {f.due}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="pen-panel mt-5 rounded-xl p-5">
          {utts.length ? (
            <div>
              {utts.map((u, i) => (
                <div key={i} className="pen-utt">
                  <div className="pen-spk">Speaker {u.speaker}</div>
                  <div className="text-[14.5px] leading-relaxed">{u.text}</div>
                </div>
              ))}
            </div>
          ) : session.transcript?.text ? (
            <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{session.transcript.text}</p>
          ) : (
            <Muted>No transcript yet.</Muted>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================== helpers */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] uppercase tracking-wide" style={{ color: 'var(--pen-dim)' }}>
      {children}
    </span>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13.5px]" style={{ color: 'var(--pen-dim)' }}>
      {children}
    </p>
  )
}

function Banner({
  children,
  tone,
  onClose,
}: {
  children: React.ReactNode
  tone: 'bad' | 'warn'
  onClose?: () => void
}) {
  return (
    <div
      className="mt-4 flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-[13px]"
      style={{
        background: tone === 'bad' ? 'var(--pen-bad-soft)' : 'var(--pen-warn-soft)',
        color: tone === 'bad' ? 'var(--pen-bad)' : 'var(--pen-warn)',
        border: `1px solid ${tone === 'bad' ? '#efd6d2' : '#f0e2c2'}`,
      }}
    >
      <div>{children}</div>
      {onClose && (
        <button onClick={onClose} className="pen-mono shrink-0 text-[15px] leading-none">
          ×
        </button>
      )}
    </div>
  )
}

function sentimentColor(s: string) {
  if (s === 'loved') return 'var(--pen-accent)'
  if (s === 'liked') return '#3f7a58'
  if (s === 'disliked') return 'var(--pen-bad)'
  return 'var(--pen-soft)'
}

function groupByDay(sessions: PenSession[]): [string, PenSession[]][] {
  const map = new Map<string, PenSession[]>()
  for (const s of sessions) {
    const d = new Date(s.recorded_at ?? s.created_at)
    const key = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
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
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPct((e.loaded / e.total) * 100)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`upload failed ${xhr.status}: ${xhr.responseText.slice(0, 200)}`))
    xhr.onerror = () => reject(new Error('upload network error'))
    xhr.send(blob)
  })
}
