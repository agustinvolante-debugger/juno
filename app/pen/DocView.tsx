'use client'

// A page. The model wrote the first draft; from here it belongs to the user.
//
// Markdown in a plain textarea rather than a rich editor: what comes back is Markdown, the
// user pastes it into email and docs, and a WYSIWYG layer between them would be a lot of
// surface area for no gain. A live preview sits beside it so nobody has to read raw syntax.

import { useEffect, useRef, useState } from 'react'
import { patchJson, del, errMessage } from '@/lib/pen/http'
import type { PenDoc } from '@/lib/pen/docs'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export default function DocView({
  docId,
  onDeleted,
  onRenamed,
}: {
  docId: string
  onDeleted: () => void
  onRenamed: () => void
}) {
  const [doc, setDoc] = useState<PenDoc | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [save, setSave] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(true)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    setDoc(null)
    setError(null)
    fetch(`/api/pen/docs/${docId}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { doc: PenDoc }) : null))
      .then((j) => {
        if (!alive) return
        if (!j) return setError('That page could not be loaded.')
        setDoc(j.doc)
        setTitle(j.doc.title)
        setBody(j.doc.body)
        setSave('idle')
      })
      .catch(() => alive && setError('That page could not be loaded.'))
    return () => {
      alive = false
    }
  }, [docId])

  // Debounced autosave. The indicator is tri-state on purpose: a save indicator that says
  // "saved" after a failed write is worse than no indicator at all.
  function queue(patch: { title?: string; body?: string }) {
    if (timer.current) window.clearTimeout(timer.current)
    setSave('saving')
    timer.current = window.setTimeout(async () => {
      try {
        await patchJson(`/api/pen/docs/${docId}`, patch)
        setSave('saved')
        if (patch.title !== undefined) onRenamed()
      } catch (e) {
        setSave('failed')
        setError(errMessage(e, 'Could not save this page.'))
      }
    }, 700)
  }

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  async function remove() {
    if (!window.confirm('Delete this page? This cannot be undone.')) return
    try {
      await del(`/api/pen/docs/${docId}`)
      onDeleted()
    } catch (e) {
      setError(errMessage(e, 'Could not delete this page.'))
    }
  }

  if (error && !doc) {
    return (
      <div className="pen-panel px-8 py-14 text-center">
        <p className="text-[15px]" style={{ color: 'var(--bad)' }}>{error}</p>
      </div>
    )
  }
  if (!doc) {
    return (
      <div className="pen-panel px-8 py-14 text-center">
        <p className="pen-mono text-[13px]" style={{ color: 'var(--dim)' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[280px]">
          <input
            className="pen-doc-title"
            value={title}
            maxLength={200}
            onChange={(e) => {
              setTitle(e.target.value)
              queue({ title: e.target.value })
            }}
          />
          <div className="pen-mono mt-2 flex flex-wrap items-center gap-x-2.5 text-[13px]" style={{ color: 'var(--dim)' }}>
            <span>{KIND_LABEL[doc.kind] ?? 'Page'}</span>
            <span style={{ color: 'var(--faint)' }}>·</span>
            <span>{new Date(doc.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
            {doc.source_ids.length > 0 && (
              <>
                <span style={{ color: 'var(--faint)' }}>·</span>
                <span>{doc.source_ids.length} recording{doc.source_ids.length === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pen-save" data-s={save}>
            {save === 'saving' ? 'saving' : save === 'saved' ? 'saved' : save === 'failed' ? 'not saved' : ''}
          </span>
          <button className="pen-btn" onClick={() => setPreview((v) => !v)}>
            {preview ? 'Edit only' : 'Preview'}
          </button>
          <button className="pen-btn" onClick={() => void navigator.clipboard?.writeText(body)}>
            Copy
          </button>
          <button className="pen-btn pen-btn-quiet" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="pen-chat-error mt-4" role="alert">
          <span>{error}</span>
          <button className="pen-chat-error-x" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className={preview ? 'pen-doc-split' : 'pen-doc-single'}>
        <textarea
          className="pen-doc-body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            queue({ body: e.target.value })
          }}
          spellCheck
        />
        {preview && <div className="pen-doc-preview">{renderMarkdown(body)}</div>}
      </div>
    </div>
  )
}

const KIND_LABEL: Record<string, string> = {
  summary: 'Summary',
  prep: 'Prep doc',
  checklist: 'Checklist',
  note: 'Page',
}

/**
 * A deliberately small Markdown renderer: headings, bullets, task boxes, bold, and
 * paragraphs. That is the whole vocabulary the artifact prompt is allowed to emit, so a
 * full parser (and its bundle, and its HTML-injection surface) buys nothing here. Text is
 * rendered as React children throughout — never dangerouslySetInnerHTML.
 */
function renderMarkdown(src: string) {
  const lines = src.split('\n')
  const out: React.ReactNode[] = []
  let list: React.ReactNode[] = []

  const flush = () => {
    if (!list.length) return
    out.push(<ul key={`ul-${out.length}`} className="pen-md-ul">{list}</ul>)
    list = []
  }

  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (task) {
      list.push(
        <li key={i} className="pen-md-task" data-done={task[1].toLowerCase() === 'x'}>
          <span className="pen-md-box" aria-hidden>{task[1].toLowerCase() === 'x' ? '✓' : ''}</span>
          <span>{inline(task[2])}</span>
        </li>,
      )
      return
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      list.push(<li key={i}>{inline(bullet[1])}</li>)
      return
    }
    flush()
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      out.push(
        <p key={i} className="pen-md-h" data-l={level}>
          {inline(h[2])}
        </p>,
      )
      return
    }
    if (!line.trim()) return
    out.push(<p key={i} className="pen-md-p">{inline(line)}</p>)
  })
  flush()
  return out
}

/** Bold only. Anything else passes through as the literal text the model wrote. */
function inline(s: string): React.ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  )
}
