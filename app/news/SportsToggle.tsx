'use client'
import { useState } from 'react'

// Sports sections (team topics, golf) stay off Today unless this is on. Per user, in prefs.layout.sports.
export default function SportsToggle({ on, count, lang = 'en' }: { on: boolean; count: number; lang?: string }) {
  const [busy, setBusy] = useState(false)
  const es = lang === 'es'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      className="db-toggle"
      onClick={async () => {
        setBusy(true)
        await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { sports: !on } }) })
        location.reload()
      }}
    >
      <span className="db-switch" data-on={on ? '1' : '0'} aria-hidden />
      <span>{es ? 'Deportes' : 'Sports'}{!on && count ? ` (${count})` : ''}</span>
    </button>
  )
}
