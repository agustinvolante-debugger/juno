'use client'
import { useState } from 'react'
import { flagFor } from '@/lib/news/feeds'

type CatItem = { id: string; label: string; country: string; group: string }
type StatVal = { value: string; sub: string; good: boolean | null }

// Markets belt, browsable by country (with flags). Each country expands to its categories with
// live values; ⭐ pins a stat to the scrolling ticker. Individual tickers can be added (quoted via CNBC).
export default function MarketMenu({
  catalog, stats, selected, countryOrder, lang = 'en',
}: { catalog: CatItem[]; stats: Record<string, StatVal>; selected: string[]; countryOrder: string[]; lang?: string }) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string[]>(selected)
  const [busy, setBusy] = useState(false)
  const [ticker, setTicker] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const es = lang === 'es'

  const live = catalog.filter((c) => stats[c.id])
  const countries = countryOrder.filter((co) => live.some((c) => c.country === co))

  async function save() {
    setBusy(true)
    try {
      await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { stats: sel } }) })
      location.reload()
    } finally { setBusy(false) }
  }
  function toggle(id: string) { setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])) }

  async function addTicker() {
    const sym = ticker.trim().toUpperCase()
    if (!sym) return
    setAdding(true); setErr('')
    try {
      const r = await fetch('/api/news/tickers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym }) })
      if (r.ok) location.reload()
      else { setAdding(false); setErr(es ? `No encontrado: ${sym}` : `Not found: ${sym}`) }
    } catch { setAdding(false); setErr('error') }
  }
  async function removeTicker(sym: string) {
    await fetch('/api/news/tickers?symbol=' + encodeURIComponent(sym), { method: 'DELETE' })
    location.reload()
  }

  return (
    <div className="relative flex items-center self-center pl-3">
      <button
        onClick={() => setOpen((o) => !o)}
        title={es ? 'Mercados por país' : 'Markets by country'}
        className="whitespace-nowrap rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-bold transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        🌍 {es ? 'Mercados' : 'Markets'} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 max-h-[78vh] w-80 overflow-auto rounded-lg border border-neutral-300 bg-white text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
              <span className="text-[11px] font-bold uppercase tracking-wide">{es ? 'Mercados por país' : 'Markets by country'}</span>
              <span className="text-[10px] text-neutral-400">{es ? '★ fija al ticker' : '★ pins to ticker'}</span>
            </div>

            {countries.map((co, ci) => {
              const items = live.filter((c) => c.country === co)
              const groups = Array.from(new Set(items.map((c) => c.group)))
              return (
                <details key={co} open={ci === 0} className="border-b border-neutral-100 dark:border-neutral-800">
                  <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-[13px] font-bold hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <span>{flagFor(co)} {co}</span>
                    <span className="text-[10px] font-normal text-neutral-400">{items.filter((c) => sel.includes(c.id)).length || ''}</span>
                  </summary>
                  <div className="pb-1">
                    {groups.map((g) => (
                      <div key={g} className="px-3 pb-1.5">
                        <div className="mb-0.5 mt-1 text-[9.5px] font-bold uppercase tracking-wide text-neutral-400">{g}</div>
                        {items.filter((c) => c.group === g).map((c) => {
                          const v = stats[c.id]
                          const on = sel.includes(c.id)
                          const isTicker = c.country === 'Stocks'
                          return (
                            <button key={c.id} onClick={() => toggle(c.id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                              <span className={`w-3 text-[13px] ${on ? 'text-amber-500' : 'text-neutral-300 dark:text-neutral-600'}`}>{on ? '★' : '☆'}</span>
                              <span className="flex-1 text-[12.5px]">{c.label}</span>
                              <span className="text-[12.5px] font-bold tabular-nums">{v.value}</span>
                              {v.sub && <span className={`w-14 text-right text-[10.5px] tabular-nums ${v.good === true ? 'text-green-600' : v.good === false ? 'text-red-600' : 'text-neutral-400'}`}>{v.sub}</span>}
                              {isTicker && <span role="button" title={es ? 'Quitar' : 'Remove'} onClick={(e) => { e.stopPropagation(); removeTicker(c.id.slice(3).toUpperCase()) }} className="ml-0.5 text-[11px] text-neutral-300 hover:text-red-600 dark:text-neutral-600">✕</span>}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}

            <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wide text-neutral-400">📈 {es ? 'Agregar acción' : 'Add a ticker'}</div>
              <div className="flex gap-1.5">
                <input
                  value={ticker}
                  onChange={(e) => { setTicker(e.target.value); setErr('') }}
                  onKeyDown={(e) => e.key === 'Enter' && addTicker()}
                  placeholder="AAPL, TSLA, NVDA…"
                  className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12.5px] uppercase placeholder:normal-case placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
                />
                <button onClick={addTicker} disabled={adding} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{adding ? '…' : '+'}</button>
              </div>
              {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
              <button onClick={save} disabled={busy} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{busy ? '…' : es ? 'Guardar ticker' : 'Save ticker'}</button>
              <button onClick={() => setOpen(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">{es ? 'Cerrar' : 'Close'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
