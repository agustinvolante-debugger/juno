'use client'
import { useState } from 'react'

// "What else would you like to see?" — collects requests from any signed-in user (Carlos,
// Martin…) and emails them to the owner.
export default function Suggest({ lang = 'en' }: { lang?: string }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const es = lang === 'es'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setState('sending')
    try {
      await fetch('/api/news/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.trim() }) })
      setState('done')
      setText('')
    } catch { setState('idle') }
  }

  if (state === 'done') {
    return <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[13px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">✓ {es ? '¡Gracias! Lo recibimos.' : 'Thanks — got it. We read every request.'}</div>
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/40">
      <span className="text-[13px] font-semibold">💡 {es ? '¿Qué más te gustaría ver?' : 'What else would you like to see?'}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={es ? 'una sección, un país, una fuente…' : 'a section, a country, a source…'}
        className="min-w-[200px] flex-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950"
      />
      <button disabled={state === 'sending'} className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {state === 'sending' ? '…' : es ? 'Enviar' : 'Send'}
      </button>
    </form>
  )
}
