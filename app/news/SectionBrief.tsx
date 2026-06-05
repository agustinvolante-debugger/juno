'use client'
import { useState } from 'react'

export default function SectionBrief({ section }: { section: string }) {
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (text) {
    return <div className="whitespace-pre-line border-b border-neutral-100 bg-neutral-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed dark:border-neutral-800 dark:bg-neutral-900/60">{text}</div>
  }
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const r = await fetch('/api/news/section-brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section }),
          })
          const j = await r.json()
          setText(j.brief || j.error || 'No brief.')
        } catch {
          setText('Brief failed — try again.')
        } finally {
          setBusy(false)
        }
      }}
      className="w-full border-b border-neutral-100 px-3.5 py-1.5 text-left text-[11.5px] font-bold text-amber-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800"
    >
      {busy ? 'briefing…' : '✨ brief this section'}
    </button>
  )
}
