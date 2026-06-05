'use client'
import { useState } from 'react'

// Per-section instruction editor. Lets the user tell the AI what to prioritise/drop in a
// curated section (e.g. "only $50M+ rounds, AI/fintech"). Saves + re-curates on the server.
export default function SectionTune({ section, instruction = '', lang = 'en' }: { section: string; instruction?: string; lang?: string }) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState(instruction)
  const [busy, setBusy] = useState(false)
  const es = lang === 'es'

  async function save() {
    setBusy(true)
    try {
      await fetch('/api/news/section-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, instruction: val }),
      })
      location.reload()
    } finally { setBusy(false) }
  }

  return (
    <span className="relative font-normal normal-case tracking-normal">
      <button
        onClick={() => setOpen((o) => !o)}
        title={es ? 'Indica qué priorizar en esta sección' : 'Tell the AI what to prioritise here'}
        className={`text-[11px] ${instruction ? 'text-amber-600 dark:text-amber-500' : 'text-neutral-400'} hover:text-neutral-900 dark:hover:text-neutral-100`}
      >
        {instruction ? '✎ tuned' : '✎ tune'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-neutral-300 bg-white p-2.5 text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
            <div className="mb-1.5 text-[11px] text-neutral-500">{es ? 'Qué priorizar en esta sección:' : 'What to prioritise in this section:'}</div>
            <textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={3}
              placeholder={es ? 'p. ej. solo rondas >$50M, AI/fintech' : 'e.g. only $50M+ rounds, AI/fintech only'}
              className="w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12.5px] focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={save} disabled={busy} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{busy ? (es ? 'Aplicando…' : 'Applying…') : (es ? 'Aplicar' : 'Apply')}</button>
              {val && <button onClick={() => setVal('')} className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">{es ? 'limpiar' : 'clear'}</button>}
            </div>
          </div>
        </>
      )}
    </span>
  )
}
