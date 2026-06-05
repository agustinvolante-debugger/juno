'use client'
import { useState } from 'react'

export default function VideoBox() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!q.trim()) return
        setBusy(true)
        try {
          await fetch('/api/news/video-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desc: q.trim() }),
          })
        } finally {
          location.reload()
        }
      }}
      className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-7 py-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🎬 Add a video section — e.g. “Veritasium, Fern, Neo + similar”"
        className="min-w-[260px] flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
      <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {busy ? 'Building…' : 'Add videos ▸'}
      </button>
    </form>
  )
}
