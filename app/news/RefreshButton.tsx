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
          await fetch('/api/news/cron')
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
