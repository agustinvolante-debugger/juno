'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchIcon, ReturnIcon, CloseIcon, CheckIcon } from './Icons'

// One command field replaces the old stack of input bars (Brief me / Monitor / Add videos /
// Set up). Pick a mode, type, Enter. Each mode calls the same API the old bar did. On phones it
// becomes a bottom sheet opened from the header's search icon.
type Mode = 'brief' | 'monitor' | 'videos' | 'setup'
type Msg = { role: 'user' | 'assistant'; content: string }

const MODES: { id: Mode; en: string; es: string; hintEn: string; hintEs: string; phEn: string; phEs: string }[] = [
  { id: 'brief', en: 'Brief', es: 'Resumen', hintEn: 'A 30-second briefing on any topic, pinned as a section.', hintEs: 'Un resumen de 30 segundos sobre cualquier tema, fijado como sección.', phEn: 'Brief me on… a company, a game, a sector', phEs: 'Resúmeme… una empresa, un partido, un sector' },
  { id: 'monitor', en: 'Monitor', es: 'Monitorear', hintEn: 'Track a developing story; new developments are flagged.', hintEs: 'Sigue una historia en desarrollo; las novedades se marcan.', phEn: 'Monitor… an earnings date, an election, a deal', phEs: 'Monitorear… resultados, una elección, un acuerdo' },
  { id: 'videos', en: 'Videos', es: 'Videos', hintEn: 'Name a few YouTube channels; get a shelf of new uploads.', hintEs: 'Nombra canales de YouTube y arma un estante de videos nuevos.', phEn: 'Videos like… Veritasium, Fern, Neo', phEs: 'Videos como… Veritasium, Fern, Neo' },
  { id: 'setup', en: 'Set up', es: 'Configurar', hintEn: 'Tell it what you follow; it proposes sections to keep.', hintEs: 'Cuéntale qué sigues y te propone secciones.', phEn: 'I follow… sports, a sector, a city', phEs: 'Sigo… deportes, un sector, una ciudad' },
]

type Hit = { t: string; l: string; s: string }

export default function CommandBar({ authed, signInHref, lang = 'en' }: { authed: boolean; signInHref: string; lang?: string }) {
  const es = lang === 'es'
  const [mode, setMode] = useState<Mode>('brief')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [proposals, setProposals] = useState<string[]>([])
  const [kept, setKept] = useState<Record<string, 'saving' | 'done'>>({})
  const [hits, setHits] = useState<Hit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const m = MODES.find((x) => x.id === mode)!

  useEffect(() => {
    const focus = () => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }
    const esc = () => { setOpen(false); inputRef.current?.blur() }
    window.addEventListener('db:cmd-focus', focus)
    window.addEventListener('db:esc', esc)
    return () => { window.removeEventListener('db:cmd-focus', focus); window.removeEventListener('db:esc', esc) }
  }, [])

  // Close the panel on outside click (desktop). The phone sheet has its own backdrop.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Brief mode doubles as find-on-page: headlines already on the desk that match what you type.
  useEffect(() => {
    const term = q.trim().toLowerCase()
    if (mode !== 'brief' || term.length < 3) { setHits([]); return }
    const seen = new Set<string>()
    const out: Hit[] = []
    document.querySelectorAll<HTMLElement>('[data-row]').forEach((r) => {
      const a = r.querySelector<HTMLAnchorElement>('a[href]')
      const l = r.dataset.l || ''
      if (!a || seen.has(l)) return
      const t = (a.textContent || '').trim()
      if (t.toLowerCase().includes(term)) { seen.add(l); out.push({ t, l, s: r.querySelector('.db-src')?.textContent || '' }) }
    })
    setHits(out.slice(0, 5))
  }, [q, mode])

  const needsSignIn = !authed

  async function run() {
    const text = q.trim()
    if (!text || busy) return
    if (needsSignIn) { setErr(es ? 'Inicia sesión para usar esto.' : 'Sign in to use this.'); return }
    setErr('')
    if (mode === 'setup') return sendSetup(text)
    setBusy(true)
    try {
      const [url, body, dest] =
        mode === 'brief' ? ['/api/news/topic', { query: text }, '/news']
          : mode === 'monitor' ? ['/api/news/monitor', { query: text }, '/news?tab=monitors']
            : ['/api/news/video-section', { desc: text }, '/news?tab=videos']
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        const why = j.error === 'limit' ? (es ? 'Máximo 6 monitores. Quita uno primero.' : 'Six monitors max. Remove one first.')
          : j.error === 'no channels resolved' ? (es ? 'No encontré esos canales. Prueba con otros nombres.' : "Couldn't find those channels. Try their exact names.")
            : (es ? 'No funcionó. Intenta de nuevo.' : "That didn't work. Try again.")
        setErr(why)
        setBusy(false)
        return
      }
      window.location.href = dest
    } catch {
      setErr(es ? 'Sin conexión. Intenta de nuevo.' : 'Network error. Try again.')
      setBusy(false)
    }
  }

  async function sendSetup(text: string) {
    const next = [...msgs, { role: 'user' as const, content: text }]
    setMsgs(next); setQ(''); setQuestions([]); setBusy(true)
    try {
      const r = await fetch('/api/news/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) })
      const res = await r.json()
      if (res.reply) setMsgs([...next, { role: 'assistant', content: res.reply }])
      if (res.type === 'questions') setQuestions(res.questions || [])
      if (res.type === 'done') setProposals(res.topics || [])
      if (res.type === 'error') setErr(es ? 'No funcionó. Intenta de nuevo.' : "That didn't work. Try again.")
    } catch {
      setErr(es ? 'Sin conexión.' : 'Network error.')
    } finally { setBusy(false) }
  }

  async function keep(topic: string) {
    setKept((s) => ({ ...s, [topic]: 'saving' }))
    try {
      await fetch('/api/news/topic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: topic }) })
      setKept((s) => ({ ...s, [topic]: 'done' }))
    } catch {
      setKept((s) => { const n = { ...s }; delete n[topic]; return n })
    }
  }

  const busyLabel = useMemo(() => ({
    brief: es ? 'Preparando el resumen… ~10 s' : 'Writing your briefing… about 10 seconds',
    monitor: es ? 'Buscando la cobertura… ~10 s' : 'Gathering coverage… about 10 seconds',
    videos: es ? 'Buscando los canales… ~15 s' : 'Finding the channels… about 15 seconds',
    setup: es ? 'Pensando…' : 'Thinking…',
  }[mode]), [mode, es])

  return (
    <div ref={rootRef} className={`db-cmd${open ? ' is-open' : ''}`}>
      <button type="button" className="db-iconbtn db-cmd-trigger" aria-label={es ? 'Buscar y comandos' : 'Search and commands'} onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }}>
        <SearchIcon size={18} />
        <span>{es ? 'Buscar' : 'Search'}</span>
      </button>
      <div className="db-cmd-backdrop" onClick={() => setOpen(false)} />
      <div className="db-cmd-box" role="search">
        <form className="db-cmd-field" onSubmit={(e) => { e.preventDefault(); run() }}>
          <span className="db-cmd-mode" aria-hidden>{es ? m.es : m.en}</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setErr('') }}
            onFocus={() => setOpen(true)}
            placeholder={es ? m.phEs : m.phEn}
            aria-label={es ? `Comando: ${m.es}` : `Command: ${m.en}`}
            enterKeyHint="go"
          />
          <kbd className="db-kbd db-cmd-kbd" aria-hidden>⌘K</kbd>
          <button type="button" className="db-iconbtn db-cmd-close" aria-label={es ? 'Cerrar' : 'Close'} onClick={() => setOpen(false)}><CloseIcon /></button>
        </form>
        {open && (
          <div className="db-cmd-panel">
            <div className="db-chips" role="tablist" aria-label={es ? 'Modo' : 'Mode'}>
              {MODES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === x.id}
                  className="db-chip"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setMode(x.id); setErr(''); inputRef.current?.focus() }}
                >{es ? x.es : x.en}</button>
              ))}
            </div>
            <p className="db-cmd-hint">
              {es ? m.hintEs : m.hintEn}
              {!busy && q.trim() && !needsSignIn && <span className="db-cmd-enter"><ReturnIcon size={13} /> Enter</span>}
            </p>
            {needsSignIn && (
              <p className="db-cmd-note">{es ? 'Los modos de IA requieren iniciar sesión.' : 'The AI modes need you signed in.'} <a href={signInHref}>{es ? 'Iniciar sesión' : 'Sign in'}</a></p>
            )}
            {busy && <p className="db-cmd-busy" role="status"><span className="db-spin" aria-hidden />{busyLabel}</p>}
            {err && <p className="db-cmd-err" role="alert">{err}</p>}

            {hits.length > 0 && (
              <div className="db-cmd-hits">
                <div className="db-cmd-sub">{es ? 'Ya en tu portada' : 'Already on your desk'}</div>
                {hits.map((h) => (
                  <a key={h.l} href={h.l} target="_blank" rel="noopener noreferrer" className="db-cmd-hit">
                    <span>{h.t}</span><span className="db-src">{h.s}</span>
                  </a>
                ))}
              </div>
            )}

            {mode === 'setup' && (msgs.length > 0 || proposals.length > 0) && (
              <div className="db-setup">
                {msgs.map((x, i) => <p key={i} className={x.role === 'user' ? 'db-say is-me' : 'db-say'}>{x.content}</p>)}
                {questions.length > 0 && <ul className="db-setup-q">{questions.map((qq) => <li key={qq}>{qq}</li>)}</ul>}
                {proposals.length > 0 && (
                  <div className="db-setup-props">
                    <div className="db-cmd-sub">{es ? '¿Guardar estas secciones?' : 'Keep these sections?'}</div>
                    {proposals.map((t) => (
                      <div key={t} className="db-prop">
                        <span>{t}</span>
                        {kept[t] === 'done'
                          ? <span className="db-prop-ok"><CheckIcon size={14} /> {es ? 'guardada' : 'kept'}</span>
                          : <>
                            <button type="button" className="db-btn" disabled={!!kept[t]} onClick={() => keep(t)}>{kept[t] === 'saving' ? '…' : (es ? 'Guardar' : 'Keep')}</button>
                            <button type="button" className="db-btn is-ghost" onClick={() => setProposals((p) => p.filter((y) => y !== t))}>{es ? 'Omitir' : 'Skip'}</button>
                          </>}
                      </div>
                    ))}
                    {Object.values(kept).includes('done') && (
                      <button type="button" className="db-btn is-ink" onClick={() => location.reload()}>{es ? 'Ver mis secciones' : 'Show my sections'}</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
