'use client'
import { useState } from 'react'

// Opt-in toggle for the daily email digest (stored in prefs.layout.digest), plus a one-click
// "send me one now" test.
export default function DigestToggle({ on, lang = 'en' }: { on: boolean; lang?: string }) {
  const [enabled, setEnabled] = useState(on)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const es = lang === 'es'

  async function toggle() {
    setBusy(true)
    try {
      await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { digest: !enabled } }) })
      setEnabled((v) => !v)
    } finally { setBusy(false) }
  }

  async function test() {
    setBusy(true)
    try {
      const r = await fetch('/api/news/digest', { method: 'POST' })
      setSent((await r.json())?.ok === true)
    } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span>📧 {es ? 'Email diario:' : 'Daily email:'}</span>
      <button onClick={toggle} disabled={busy} className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${enabled ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'border border-neutral-300 dark:border-neutral-700'}`}>
        {enabled ? (es ? 'Activado' : 'On') : (es ? 'Desactivado' : 'Off')}
      </button>
      {enabled && (
        <button onClick={test} disabled={busy} className="text-[11px] underline hover:text-neutral-900 dark:hover:text-neutral-100">
          {sent ? (es ? '✓ enviado' : '✓ sent') : busy ? '…' : es ? 'enviar prueba' : 'send test'}
        </button>
      )}
    </span>
  )
}
