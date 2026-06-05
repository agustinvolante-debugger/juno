'use client'
import { useState } from 'react'

// Start monitoring a developing situation (a company, an event, an unfolding story).
export default function MonitorBar() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!q.trim()) return
        setBusy(true)
        try {
          await fetch('/api/news/monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q.trim() }) })
        } finally { location.reload() }
      }}
      className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-7 py-2.5 dark:border-neutral-800"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="👁 Monitor a situation — a company, an event, an unfolding story…"
        className="min-w-[260px] flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm transition-colors placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950"
      />
      <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {busy ? 'Tracking…' : 'Monitor ▸'}
      </button>
    </form>
  )
}
