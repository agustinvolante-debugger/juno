'use client'
import { useState } from 'react'

type Tier = 'top' | 'normal' | 'muted'

// Global source tiers: ⭐ floats a source to the top of every section, 🚫 hides it everywhere.
// Click a source to cycle normal → top → muted → normal.
export default function SourcesManager({
  sources, top, muted, lang = 'en',
}: { sources: string[]; top: string[]; muted: string[]; lang?: string }) {
  const [open, setOpen] = useState(false)
  const init: Record<string, Tier> = {}
  for (const s of sources) init[s] = top.includes(s) ? 'top' : muted.includes(s) ? 'muted' : 'normal'
  const [tiers, setTiers] = useState<Record<string, Tier>>(init)
  const [busy, setBusy] = useState(false)
  const es = lang === 'es'

  const cycle = (s: string) =>
    setTiers((t) => ({ ...t, [s]: t[s] === 'normal' ? 'top' : t[s] === 'top' ? 'muted' : 'normal' }))

  async function save() {
    setBusy(true)
    try {
      const out = { top: [] as string[], muted: [] as string[] }
      for (const [s, t] of Object.entries(tiers)) { if (t === 'top') out.top.push(s); else if (t === 'muted') out.muted.push(s) }
      await fetch('/api/news/source-tiers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) })
      location.reload()
    } finally { setBusy(false) }
  }

  const icon = (t: Tier) => (t === 'top' ? '⭐' : t === 'muted' ? '🚫' : '–')
  const nTop = Object.values(tiers).filter((t) => t === 'top').length
  const nMuted = Object.values(tiers).filter((t) => t === 'muted').length

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setOpen((o) => !o)}
        title={es ? 'Prioriza o silencia fuentes' : 'Prioritise or mute sources'}
        className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-bold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        ⚙ {es ? 'Fuentes' : 'Sources'}{nTop || nMuted ? ` (${nTop ? '⭐' + nTop : ''}${nMuted ? ' 🚫' + nMuted : ''})` : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1 max-h-[60vh] w-72 overflow-auto rounded-lg border border-neutral-300 bg-white text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
            <div className="sticky top-0 border-b border-neutral-200 bg-white px-3 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              {es ? 'Toca para alternar: ⭐ arriba · 🚫 oculta' : 'Tap to cycle: ⭐ top · 🚫 hide'}
            </div>
            {sources.map((s) => (
              <button key={s} onClick={() => cycle(s)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <span className={tiers[s] === 'muted' ? 'text-neutral-400 line-through' : ''}>{s}</span>
                <span className="w-5 text-center text-[13px]">{icon(tiers[s])}</span>
              </button>
            ))}
            <div className="sticky bottom-0 flex gap-2 border-t border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
              <button onClick={save} disabled={busy} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{busy ? '…' : es ? 'Guardar' : 'Save'}</button>
              <button onClick={() => setOpen(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">{es ? 'Cerrar' : 'Close'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
