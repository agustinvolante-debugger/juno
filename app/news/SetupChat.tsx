'use client'
import { useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function SetupChat() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [proposals, setProposals] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<Record<string, 'saving' | 'done'>>({})

  async function send() {
    const t = input.trim()
    if (!t) return
    const next = [...msgs, { role: 'user' as const, content: t }]
    setMsgs(next)
    setInput('')
    setQuestions([])
    setBusy(true)
    try {
      const r = await fetch('/api/news/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const res = await r.json()
      if (res.reply) setMsgs([...next, { role: 'assistant', content: res.reply }])
      if (res.type === 'questions') setQuestions(res.questions || [])
      if (res.type === 'done') setProposals(res.topics || [])
    } finally {
      setBusy(false)
    }
  }

  async function keep(topic: string) {
    setSaved((s) => ({ ...s, [topic]: 'saving' }))
    try {
      await fetch('/api/news/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: topic }),
      })
      setSaved((s) => ({ ...s, [topic]: 'done' }))
    } catch {
      setSaved((s) => {
        const n = { ...s }
        delete n[topic]
        return n
      })
    }
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="border-b border-neutral-200 bg-neutral-100 px-7 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <summary className="cursor-pointer font-bold">✨ Set up my feed</summary>
      <div className="mt-3 max-w-2xl">
        <div className="mb-2 flex flex-col gap-1.5">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'self-end rounded-lg bg-neutral-900 px-3 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'self-start rounded-lg border border-neutral-300 bg-white px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-950'}>
              {m.content}
            </div>
          ))}
          {questions.length > 0 && <div className="self-start text-neutral-600">• {questions.join('\n• ')}</div>}
        </div>

        {proposals.length > 0 && (
          <div className="my-2 flex flex-col gap-1.5">
            <div className="text-neutral-600">Keep these? ✓ saves it · ✗ skips:</div>
            {proposals.map((t) => (
              <div key={t} className={`flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-950 ${saved[t] === 'done' ? 'opacity-60' : ''}`}>
                <span className="flex-1">{t}</span>
                {saved[t] === 'done' ? (
                  <span className="text-green-700">saved ✓</span>
                ) : (
                  <>
                    <button onClick={() => keep(t)} disabled={!!saved[t]} className="h-7 w-8 rounded bg-green-700 font-bold text-white disabled:opacity-50">{saved[t] === 'saving' ? '…' : '✓'}</button>
                    <button onClick={() => setProposals((p) => p.filter((x) => x !== t))} className="h-7 w-8 rounded bg-neutral-200 font-bold dark:bg-neutral-800">✗</button>
                  </>
                )}
              </div>
            ))}
            {Object.values(saved).includes('done') && (
              <button onClick={() => location.reload()} className="mt-1 self-start rounded-md bg-neutral-900 px-3.5 py-1.5 font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">Show my sections ▸</button>
            )}
          </div>
        )}

        {proposals.length === 0 && (
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Tell me what you're into…" className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
            <button onClick={send} disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 font-bold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{busy ? '…' : 'Send'}</button>
          </div>
        )}
      </div>
    </details>
  )
}
