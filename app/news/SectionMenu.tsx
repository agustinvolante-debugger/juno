'use client'
import { useState } from 'react'
import Popover from './Popover'
import { MoreIcon } from './Icons'

type Kind = 'curated' | 'topic' | 'video' | 'uservideo'
const post = (body: object) => fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Every section control in one "⋯": minimize, tune (curated), brief on demand, hide / remove.
export default function SectionMenu({ id, kind, label, mini, instruction = '', canBrief = false, lang = 'en' }: {
  id: string; kind: Kind; label: string; mini: boolean; instruction?: string; canBrief?: boolean; lang?: string
}) {
  const es = lang === 'es'
  const [panel, setPanel] = useState<'' | 'tune' | 'brief'>('')
  const [val, setVal] = useState(instruction)
  const [busy, setBusy] = useState(false)
  const [brief, setBrief] = useState('')

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    try { await fn() } finally { location.reload() }
  }
  async function writeBrief() {
    setPanel('brief'); setBusy(true)
    try {
      const r = await fetch('/api/news/section-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: id }) })
      const j = await r.json()
      setBrief(j.brief || (es ? 'Sin resumen.' : 'No brief available.'))
    } catch { setBrief(es ? 'Falló. Intenta de nuevo.' : 'Brief failed. Try again.') } finally { setBusy(false) }
  }

  return (
    <Popover label={es ? `Opciones de ${label}` : `${label} options`} className="db-secmenu" trigger={<MoreIcon />}>
      {() => panel === 'tune' ? (
        <div className="db-menu-form">
          <label htmlFor={`tune-${id}`}>{es ? 'Qué priorizar en esta sección' : 'What to prioritise in this section'}</label>
          <textarea id={`tune-${id}`} rows={3} value={val} onChange={(e) => setVal(e.target.value)} placeholder={es ? 'p. ej. solo rondas >$50M, AI/fintech' : 'e.g. only $50M+ rounds, AI and fintech'} />
          <div className="db-menu-actions">
            <button type="button" className="db-btn is-ink" disabled={busy} onClick={() => act(() => fetch('/api/news/section-instruction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: id, instruction: val }) }))}>
              {busy ? (es ? 'Aplicando…' : 'Applying…') : (es ? 'Aplicar' : 'Apply')}
            </button>
            <button type="button" className="db-btn is-ghost" onClick={() => setPanel('')}>{es ? 'Atrás' : 'Back'}</button>
          </div>
        </div>
      ) : panel === 'brief' ? (
        <div className="db-menu-form">
          <p className="db-menu-brief">{busy ? (es ? 'Escribiendo…' : 'Writing…') : brief}</p>
          <div className="db-menu-actions"><button type="button" className="db-btn is-ghost" onClick={() => setPanel('')}>{es ? 'Atrás' : 'Back'}</button></div>
        </div>
      ) : (
        <>
          <button type="button" role="menuitem" className="db-menu-item" disabled={busy} onClick={() => act(() => post({ mini: { id, on: !mini } }))}>
            <span>{mini ? (es ? 'Expandir' : 'Expand') : (es ? 'Minimizar' : 'Minimize')}</span>
          </button>
          {kind === 'curated' && (
            <button type="button" role="menuitem" className="db-menu-item" onClick={() => setPanel('tune')}>
              <span>{es ? 'Ajustar la curaduría' : 'Tune curation'}</span>{instruction && <span className="db-menu-note">{es ? 'activa' : 'on'}</span>}
            </button>
          )}
          {canBrief && (
            <button type="button" role="menuitem" className="db-menu-item" onClick={writeBrief}><span>{es ? 'Resumir esta sección' : 'Brief this section'}</span></button>
          )}
          {(kind === 'curated' || kind === 'video') && (
            <button type="button" role="menuitem" className="db-menu-item" disabled={busy} onClick={() => act(() => post({ hide: id }))}><span>{es ? 'Ocultar sección' : 'Hide section'}</span></button>
          )}
          {kind === 'topic' && (
            <button type="button" role="menuitem" className="db-menu-item is-danger" disabled={busy} onClick={() => act(() => fetch('/api/news/topic?query=' + encodeURIComponent(label), { method: 'DELETE' }))}><span>{es ? 'Quitar tema' : 'Remove topic'}</span></button>
          )}
          {kind === 'uservideo' && (
            <button type="button" role="menuitem" className="db-menu-item is-danger" disabled={busy} onClick={() => act(() => fetch('/api/news/video-section?key=' + encodeURIComponent(id), { method: 'DELETE' }))}><span>{es ? 'Quitar sección' : 'Remove section'}</span></button>
          )}
        </>
      )}
    </Popover>
  )
}
