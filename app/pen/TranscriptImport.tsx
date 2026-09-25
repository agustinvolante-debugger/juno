'use client'

// "Import a transcript": bring text from another recorder instead of audio.
//
// Pocket's free plan exports text but not audio; Otter and Plaud export text; subtitle files
// come from everywhere. The text becomes a recording with notes, search and people, and
// nothing is transcribed. A live preview shows how the text was read (turns, speakers) before
// anything is saved, so a paste that came out as one wall of text is visible up front.

import { useMemo, useState } from 'react'
import type { PersonCard } from '@/lib/pen/people'
import { parseTranscript } from '@/lib/pen/transcript-import'
import { postJson, errMessage } from '@/lib/pen/http'
import PeoplePicker, { type Picked } from './PeoplePicker'

export default function TranscriptImport({
  people,
  onClose,
  onImported,
}: {
  people: PersonCard[]
  onClose: () => void
  onImported: (id: string) => void
}) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const preview = useMemo(() => (text.trim() ? parseTranscript(text) : null), [text])
  const speakers = preview ? Object.values(preview.names) : []

  async function readFile(f: File) {
    setErr(null)
    if (f.size > 2_000_000) return setErr('That file is too large for a transcript. Is it audio? Use Add audio files instead.')
    setText(await f.text())
    setFileName(f.name)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 90))
  }

  async function submit() {
    if (!text.trim()) return setErr('Paste a transcript or choose a file.')
    if (!consent) return setErr('Confirm that everyone agreed to be recorded.')
    setBusy(true)
    setErr(null)
    try {
      const j = await postJson<{ id: string }>('/api/pen/import-transcript', {
        text,
        title: title.trim() || undefined,
        source_name: fileName ?? undefined,
        people: picked.map((p) => (p.id ? { id: p.id } : { name: p.name })),
        consent: true,
      })
      onImported(j.id)
    } catch (e) {
      setErr(errMessage(e, 'Could not import that transcript.'))
      setBusy(false)
    }
  }

  return (
    <div className="pen-tximp-back" onClick={onClose}>
      <div className="pen-tximp" role="dialog" aria-modal="true" aria-label="Import a transcript" onClick={(e) => e.stopPropagation()}>
        <div className="pen-tximp-head">
          <div>
            <span className="pen-label">Import a transcript</span>
            <p className="pen-tximp-lede">From Pocket, Otter, Plaud or any recorder that gives you text. You get the notes, search and people, same as a recording.</p>
          </div>
          <button type="button" className="pen-imp-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="pen-tximp-body">
          <label className="pen-tximp-file">
            <input type="file" accept=".txt,.srt,.vtt,.md,text/plain" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
            <span>{fileName ? `Loaded ${fileName}` : 'Choose a .txt, .srt or .vtt file'}</span>
          </label>
          <textarea
            id="tximp-text"
            className="pen-tximp-text"
            rows={9}
            value={text}
            onChange={(e) => { setText(e.target.value); setFileName(null) }}
            placeholder={'…or paste it here. Lines like\nSarah: We love the kitchen.\nTom: Parking is the thing.\nbecome named speakers.'}
          />
          {preview && (
            <p className="pen-tximp-preview">
              {`${preview.utterances.length} ${preview.utterances.length === 1 ? 'turn' : 'turns'}`}
              {speakers.length ? ` · ${speakers.join(', ')}` : ' · no speaker names found'}
              {preview.estSec ? ` · about ${Math.max(1, Math.round(preview.estSec / 60))} min of talk` : ''}
            </p>
          )}

          <label className="pen-su-field">
            <span className="pen-label">Title <em>optional</em></span>
            <input id="tximp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Maple Avenue viewing" maxLength={90} />
          </label>

          <div className="pen-su-field">
            <span className="pen-label">Who was on this call <em>optional</em></span>
            <PeoplePicker people={people} value={picked} onChange={setPicked} />
          </div>

          <button className="pen-consent" data-on={consent} onClick={() => setConsent(!consent)} role="switch" aria-checked={consent} type="button">
            <span className="pen-consent-track"><span className="pen-consent-knob" /></span>
            <span className="pen-consent-text">Everyone in this conversation agreed to be recorded.</span>
          </button>

          {err && <div className="pen-su-err">{err}</div>}
        </div>

        <div className="pen-tximp-foot">
          <button type="button" className="pen-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="pen-btn pen-btn-accent" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? 'Importing…' : 'Import and write notes'}
          </button>
        </div>
      </div>
    </div>
  )
}
