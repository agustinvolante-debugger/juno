'use client'
import { useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

// Always-visible input row (peer to Brief me / Add videos). Submitting starts a short
// setup conversation that renders inline below the row.
export default function SetupChat() {
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

  const active = msgs.length > 0 || proposals.length > 0

  return (
    <div className="border-t border-neutral-200 px-7 py-2.5 dark:border-neutral-800">
      <form
        onSubmit={(e) => { e.preventDefault(); send() }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="✨ Set up my feed — tell me what you're into (sports, a sector, a city…)"
          className="min-w-[260px] flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm transition-colors placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950"
        />
        <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
          {busy ? 'Thinking…' : 'Set up ▸'}
        </button>
      </form>

      {active && (
        <div className="mt-3 max-w-2xl text-sm">
          <div className="mb-2 flex flex-col gap-1.5">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'self-end rounded-lg bg-neutral-900 px-3 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'self-start rounded-lg border border-neutral-300 bg-white px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-950'}>
                {m.content}
              </div>
            ))}
            {questions.length > 0 && <div className="self-start text-neutral-600 dark:text-neutral-400">• {questions.join('\n• ')}</div>}
          </div>

          {proposals.length > 0 && (
            <div className="my-2 flex flex-col gap-1.5">
              <div className="text-neutral-600 dark:text-neutral-400">Keep these? ✓ saves it · ✗ skips:</div>
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
        </div>
      )}
    </div>
  )
}
