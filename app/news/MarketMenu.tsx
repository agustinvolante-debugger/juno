'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { softRefresh } from './soft'
import { CODE } from './parts'
import { SlidersIcon, CloseIcon, CheckIcon, SearchIcon } from './Icons'

type CatItem = { id: string; label: string; country: string; group: string }
type StatVal = { value: string; sub: string; good: boolean | null }
type Hit = { symbol: string; name: string; exchange: string }

const COUNTRY_ES: Record<string, string> = {
  'United States': 'Estados Unidos', 'Euro Area': 'Zona euro', 'United Kingdom': 'Reino Unido', Germany: 'Alemania',
  France: 'Francia', Japan: 'Japón', China: 'China', 'Hong Kong': 'Hong Kong', India: 'India', Canada: 'Canadá',
  Australia: 'Australia', Chile: 'Chile', Brazil: 'Brasil', Argentina: 'Argentina', Global: 'Global', Stocks: 'Acciones',
}
const GROUP_ES: Record<string, string> = {
  Markets: 'Mercados', 'Economic Data': 'Datos económicos', 'Commodities & FX': 'Materias primas y divisas', Stocks: 'Acciones',
}
const shortCode = (co: string) => CODE[co] || (co === 'Stocks' ? '$' : co === 'Global' ? 'GL' : co.slice(0, 2).toUpperCase())

// Choose which markets sit on your panel. One picker, two shells: a popover from the rail on
// desktop, a bottom sheet from the chip strip on phones (the rail is hidden there).
// Picks are a draft until Save; individual tickers are added straight away (quoted via CNBC).
export default function MarketMenu({
  catalog, stats, selected, countryOrder, lang = 'en', variant = 'rail',
}: {
  catalog: CatItem[]; stats: Record<string, StatVal>; selected: string[]; countryOrder: string[]; lang?: string
  variant?: 'rail' | 'chip'
}) {
  const es = lang === 'es'
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string[]>(selected)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [ticker, setTicker] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [hi, setHi] = useState(0)
  const [searching, setSearching] = useState(false)
  const live = useMemo(() => catalog.filter((c) => stats[c.id]), [catalog, stats])
  const countries = countryOrder.filter((co) => live.some((c) => c.country === co))
  const firstPicked = live.find((c) => selected.includes(c.id))?.country
  const [country, setCountry] = useState<string>(firstPicked || countries[0] || '')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) { setSel(selected); setQ(''); setErr('') } }, [open, selected])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  useEffect(() => {
    const term = ticker.trim()
    if (!open || term.length < 1) { setHits([]); return }
    let live = true
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const j = await (await fetch('/api/news/symbols?q=' + encodeURIComponent(term))).json()
        if (live) { setHits(j.results || []); setHi(0) }
      } catch { if (live) setHits([]) } finally { if (live) setSearching(false) }
    }, 220)
    return () => { live = false; clearTimeout(t) }
  }, [ticker, open])

  const dirty = sel.length !== selected.length || sel.some((id) => !selected.includes(id))
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? live.filter((c) => `${c.label} ${c.country} ${COUNTRY_ES[c.country] || ''}`.toLowerCase().includes(needle))
    : live.filter((c) => c.country === country)
  const groups = Array.from(new Set(shown.map((c) => (needle ? c.country : c.group))))

  function toggle(id: string) { setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])) }
  async function save() {
    setBusy(true)
    try {
      await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { stats: sel } }) })
      setOpen(false)
      softRefresh()
    } finally { setBusy(false) }
  }
  async function addTicker(hit?: Hit) {
    const pick = hit || hits[hi]
    const sym = (pick?.symbol || ticker.trim()).toUpperCase()
    if (!sym) return
    setAdding(true); setErr('')
    try {
      const r = await fetch('/api/news/tickers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, name: pick?.name || '' }) })
      if (r.ok) { setTicker(''); setHits([]); setCountry('Stocks'); setSel((s) => (s.includes('tk_' + sym.toLowerCase()) ? s : [...s, 'tk_' + sym.toLowerCase()])); softRefresh() }
      else setErr(es ? `No encontramos ${sym}. Prueba con el símbolo, p. ej. AAPL.` : `Couldn't find ${sym}. Try the symbol, e.g. AAPL.`)
    } catch { setErr(es ? 'No se pudo agregar. Intenta de nuevo.' : "Couldn't add it. Try again.") } finally { setAdding(false) }
  }
  async function removeTicker(sym: string) {
    await fetch('/api/news/tickers?symbol=' + encodeURIComponent(sym), { method: 'DELETE' })
    softRefresh()
  }

  const label = (co: string) => (es ? COUNTRY_ES[co] || co : co === 'Stocks' ? 'Stocks' : co)
  const groupLabel = (g: string) => (needle ? label(g) : es ? GROUP_ES[g] || g : g)

  return (
    <div ref={rootRef} className={`db-mm is-${variant}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={variant === 'chip' ? 'db-mm-chip' : 'db-edit'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersIcon size={13} />
        <span>{es ? 'Editar' : 'Edit'}</span>
      </button>

      {open && <div className="db-mm-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div className="db-mm-panel" role="dialog" aria-label={es ? 'Tus mercados' : 'Your markets'}>
          <div className="db-mm-head">
            <div>
              <h3 className="db-mm-title">{es ? 'Tus mercados' : 'Your markets'}</h3>
              <p className="db-mm-sub">{es ? `${sel.length} en tu panel` : `${sel.length} on your panel`}</p>
            </div>
            <button type="button" className="db-iconbtn db-mm-close" aria-label={es ? 'Cerrar' : 'Close'} onClick={() => setOpen(false)}><CloseIcon /></button>
          </div>

          <label className="db-mm-search">
            <SearchIcon size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={es ? 'Buscar: Nasdaq, oro, Chile…' : 'Search: Nasdaq, gold, Chile…'} aria-label={es ? 'Buscar mercados' : 'Search markets'} />
          </label>

          {!needle && (
            <div className="db-mm-countries" role="tablist" aria-label={es ? 'País' : 'Country'}>
              {countries.map((co) => {
                const n = live.filter((c) => c.country === co && sel.includes(c.id)).length
                return (
                  <button key={co} type="button" role="tab" aria-selected={co === country} className="db-mm-country" onClick={() => setCountry(co)} title={label(co)}>
                    <span className="db-mm-code">{shortCode(co)}</span>
                    <span>{label(co)}</span>
                    {n > 0 && <span className="db-mm-n">{n}</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div className="db-mm-list">
            {groups.map((g) => (
              <div key={g} className="db-mm-group">
                <div className="db-mm-glabel">{groupLabel(g)}</div>
                {shown.filter((c) => (needle ? c.country : c.group) === g).map((c) => {
                  const v = stats[c.id]
                  const on = sel.includes(c.id)
                  const sub = (v.sub || '').trim()
                  const moved = /^[+-−]?\d[\d.,]*(%| bp)$/.test(sub) && /[1-9]/.test(sub)
                  const dir = moved ? (sub.startsWith('-') ? 'is-down' : 'is-up') : ''
                  return (
                    <div key={c.id} className={`db-mm-row${on ? ' is-on' : ''}`}>
                      <button type="button" role="checkbox" aria-checked={on} className="db-mm-pick" onClick={() => toggle(c.id)}>
                        <span className="db-mm-box" aria-hidden>{on && <CheckIcon size={12} />}</span>
                        <span className="db-mm-l">{c.label}</span>
                        <span className="db-mm-v">{v.value}</span>
                        <span className={`db-mm-c ${dir}`}>{v.sub}</span>
                      </button>
                      {c.country === 'Stocks' && (
                        <button type="button" className="db-iconbtn db-mm-rm" aria-label={es ? `Quitar ${c.label}` : `Remove ${c.label}`} onClick={() => removeTicker(c.id.slice(3).toUpperCase())}><CloseIcon size={13} /></button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            {!shown.length && <p className="db-mm-empty">{es ? 'Nada con ese nombre. Si es una acción, agrégala abajo.' : 'Nothing by that name. If it’s a stock, add it below.'}</p>}
          </div>

          <div className="db-mm-add">
            {ticker.trim() && (hits.length > 0 || searching) && (
              <ul className="db-mm-hits" role="listbox" id="db-mm-hits" aria-label={es ? 'Resultados' : 'Results'}>
                {hits.map((h, k) => (
                  <li key={h.symbol} role="option" aria-selected={k === hi}>
                    <button type="button" className="db-mm-hit" onMouseEnter={() => setHi(k)} onClick={() => addTicker(h)} disabled={adding}>
                      <span className="db-mm-hit-s">{h.symbol}</span>
                      <span className="db-mm-hit-n">{h.name}</span>
                      <span className="db-mm-hit-x">{h.exchange}</span>
                    </button>
                  </li>
                ))}
                {searching && !hits.length && <li className="db-mm-hit-wait">{es ? 'Buscando…' : 'Searching…'}</li>}
              </ul>
            )}
            <div className="db-mm-add-row">
              <input
                value={ticker}
                onChange={(e) => { setTicker(e.target.value); setErr('') }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHi((k) => Math.min(k + 1, hits.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((k) => Math.max(k - 1, 0)) }
                  else if (e.key === 'Enter') { e.preventDefault(); addTicker() }
                }}
                placeholder={es ? 'Agregar una acción: Microsoft, Tesla…' : 'Add a stock: Microsoft, Tesla…'}
                aria-label={es ? 'Buscar una acción por nombre o símbolo' : 'Search a stock by name or symbol'}
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="db-mm-hits"
                aria-autocomplete="list"
                autoComplete="off"
              />
              <button type="button" className="db-btn" onClick={() => addTicker()} disabled={adding || !ticker.trim()}>{adding ? (es ? 'Agregando…' : 'Adding…') : (es ? 'Agregar' : 'Add')}</button>
            </div>
          </div>
          {err && <p className="db-mm-err" role="alert">{err}</p>}

          <div className="db-mm-foot">
            <button type="button" className="db-btn is-ghost" onClick={() => setOpen(false)}>{es ? 'Cancelar' : 'Cancel'}</button>
            <button type="button" className="db-btn is-ink" onClick={save} disabled={busy || !dirty}>{busy ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar' : 'Save')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
