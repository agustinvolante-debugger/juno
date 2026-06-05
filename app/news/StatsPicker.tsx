'use client'
import { useState } from 'react'

type Cat = { id: string; label: string; group: string }

export default function StatsPicker({ selected, catalog }: { selected: string[]; catalog: Cat[] }) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string[]>(selected)
  const [busy, setBusy] = useState(false)
  const groups = Array.from(new Set(catalog.map((c) => c.group)))

  async function save() {
    setBusy(true)
    try {
      await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { stats: sel } }) })
      location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex items-center self-center pl-3">
      <button onClick={() => setOpen((o) => !o)} title="customize stats" className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm dark:border-neutral-700">⚙</button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] w-72 overflow-auto rounded-lg border border-neutral-300 bg-white p-3 text-neutral-900 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide">Stats to show</div>
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">{g}</div>
              {catalog.filter((c) => c.group === g).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={sel.includes(c.id)}
                    onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ))}
          <div className="sticky bottom-0 mt-2 flex gap-2 bg-white pt-2 dark:bg-neutral-900">
            <button onClick={save} disabled={busy} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{busy ? '…' : 'Save'}</button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
