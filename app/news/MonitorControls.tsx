'use client'
import { useState } from 'react'

// Per-monitor controls: ↻ re-checks for new developments, ✕ stops monitoring.
export default function MonitorControls({ query, lang = 'en' }: { query: string; lang?: string }) {
  const [busy, setBusy] = useState(false)
  const es = lang === 'es'

  async function refresh() {
    setBusy(true)
    try {
      await fetch('/api/news/monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, refresh: true }) })
      location.reload()
    } finally { setBusy(false) }
  }
  async function remove() {
    await fetch('/api/news/monitor?query=' + encodeURIComponent(query), { method: 'DELETE' })
    location.reload()
  }

  return (
    <span className="inline-flex items-center gap-2 font-normal normal-case">
      <button onClick={refresh} disabled={busy} title={es ? 'Buscar novedades' : 'Check for new developments'} className="text-[12px] text-neutral-400 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100">{busy ? '…' : '↻'}</button>
      <button onClick={remove} title={es ? 'Dejar de monitorear' : 'Stop monitoring'} className="text-[12px] text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">✕</button>
    </span>
  )
}
