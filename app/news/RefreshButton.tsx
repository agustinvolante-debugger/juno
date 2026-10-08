'use client'
import { useState } from 'react'
import { softRefresh } from './soft'

export default function RefreshButton({ label, lang = 'en' }: { label?: string; lang?: string }) {
  const es = lang === 'es'
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          // One button refreshes everything: the shared sections (cron) AND the user's own
          // monitors + pinned topics (refresh-mine; 401s harmlessly when signed out).
          await Promise.allSettled([
            fetch('/api/news/cron'),
            fetch('/api/news/refresh-mine', { method: 'POST' }),
          ])
        } finally {
          setBusy(false)
          softRefresh()
        }
      }}
      type="button"
      className={label ? 'db-btn is-ink' : 'db-textbtn'}
      title={es ? 'Actualizar las noticias ahora' : 'Refresh the news now'}
    >
      {busy ? (es ? 'Actualizando…' : 'Refreshing…') : label || (es ? 'Actualizar' : 'Refresh')}
    </button>
  )
}
