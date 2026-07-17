'use client'
import { useState } from 'react'

export default function RefreshButton({ label }: { label?: string }) {
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
          location.reload()
        }
      }}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50 dark:border-neutral-700"
      title="refresh news"
    >
      {busy ? '…' : label || '↻'}
    </button>
  )
}
