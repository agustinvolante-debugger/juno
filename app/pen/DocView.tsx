'use client'

// A page. The model wrote the first draft; from here it belongs to the user.
//
// Markdown in a plain textarea rather than a rich editor: what comes back is Markdown, the
// user pastes it into email and docs, and a WYSIWYG layer between them would be a lot of
// surface area for no gain. A live preview sits beside it so nobody has to read raw syntax.

import { useEffect, useRef, useState } from 'react'
import { patchJson, del, errMessage } from '@/lib/pen/http'
import type { PenDoc } from '@/lib/pen/docs'
import { useCopy, useLang } from './LangContext'
import { fmtDate, plural, type Copy } from '@/lib/pen/i18n'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

const DV_EN = {
  loadFailed: 'That page could not be loaded.',
  saveFailed: 'Could not save this page.',
  confirmDelete: 'Delete this page? This cannot be undone.',
  deleteFailed: 'Could not delete this page.',
  loading: 'Loading…',
  kinds: { summary: 'Summary', prep: 'Prep doc', checklist: 'Checklist', note: 'Page' } as Record<string, string>,
  page: 'Page',
  recordings: ['recording', 'recordings'] as [string, string],
  saving: 'saving',
  saved: 'saved',
  notSaved: 'not saved',
  editOnly: 'Edit only',
  preview: 'Preview',
  copy: 'Copy',
  delete: 'Delete',
  dismiss: 'Dismiss',
}

const DV: Copy<typeof DV_EN> = {
  en: DV_EN,
  es: {
    loadFailed: 'No se pudo cargar esa página.',
    saveFailed: 'No se pudo guardar esta página.',
    confirmDelete: '¿Borrar esta página? No se puede deshacer.',
    deleteFailed: 'No se pudo borrar esta página.',
    loading: 'Cargando…',
    kinds: { summary: 'Resumen', prep: 'Preparación', checklist: 'Lista', note: 'Página' },
    page: 'Página',
    recordings: ['grabación', 'grabaciones'],
    saving: 'guardando',
    saved: 'guardado',
    notSaved: 'sin guardar',
    editOnly: 'Solo editar',
    preview: 'Vista previa',
    copy: 'Copiar',
    delete: 'Borrar',
    dismiss: 'Cerrar',
  },
  pt: {
    loadFailed: 'Não foi possível carregar essa página.',
    saveFailed: 'Não foi possível salvar esta página.',
    confirmDelete: 'Apagar esta página? Não dá para desfazer.',
    deleteFailed: 'Não foi possível apagar esta página.',
    loading: 'Carregando…',
    kinds: { summary: 'Resumo', prep: 'Preparação', checklist: 'Lista', note: 'Página' },
    page: 'Página',
    recordings: ['gravação', 'gravações'],
    saving: 'salvando',
    saved: 'salvo',
    notSaved: 'não salvo',
    editOnly: 'Só editar',
    preview: 'Prévia',
    copy: 'Copiar',
    delete: 'Apagar',
    dismiss: 'Fechar',
  },
}

export default function DocView({
  docId,
  onDeleted,
  onRenamed,
}: {
  docId: string
  onDeleted: () => void
  onRenamed: () => void
}) {
  const T = useCopy(DV)
  const lang = useLang()
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
        if (!j) return setError(T.loadFailed)
        setDoc(j.doc)
        setTitle(j.doc.title)
        setBody(j.doc.body)
        setSave('idle')
      })
      .catch(() => alive && setError(T.loadFailed))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setError(errMessage(e, T.saveFailed))
      }
    }, 700)
  }

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  async function remove() {
    if (!window.confirm(T.confirmDelete)) return
    try {
      await del(`/api/pen/docs/${docId}`)
      onDeleted()
    } catch (e) {
      setError(errMessage(e, T.deleteFailed))
    }
  }

  if (error && !doc) {
    return (
      <div className="pen-panel px-8 py-14 text-center">
        <p className="text-[16.5px]" style={{ color: 'var(--bad)' }}>{error}</p>
      </div>
    )
  }
  if (!doc) {
    return (
      <div className="pen-panel px-8 py-14 text-center">
        <p className="pen-mono text-[13px]" style={{ color: 'var(--dim)' }}>{T.loading}</p>
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
            <span>{T.kinds[doc.kind] ?? T.page}</span>
            <span style={{ color: 'var(--faint)' }}>·</span>
            <span>{fmtDate(doc.created_at, lang, { dateStyle: 'medium' })}</span>
            {doc.source_ids.length > 0 && (
              <>
                <span style={{ color: 'var(--faint)' }}>·</span>
                <span>{plural(doc.source_ids.length, T.recordings)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pen-save" data-s={save}>
            {save === 'saving' ? T.saving : save === 'saved' ? T.saved : save === 'failed' ? T.notSaved : ''}
          </span>
          <button className="pen-btn" onClick={() => setPreview((v) => !v)}>
            {preview ? T.editOnly : T.preview}
          </button>
          <button className="pen-btn" onClick={() => void navigator.clipboard?.writeText(body)}>
            {T.copy}
          </button>
          <button className="pen-btn pen-btn-quiet" onClick={remove}>
            {T.delete}
          </button>
        </div>
      </div>

      {error && (
        <div className="pen-chat-error mt-4" role="alert">
          <span>{error}</span>
          <button className="pen-chat-error-x" onClick={() => setError(null)} aria-label={T.dismiss}>×</button>
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
