'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ArchiveTurn, Citation } from '@/lib/pen/store'

// Feature 2 — Cmd+K over the whole archive.
//
// Sits above the layout as a sheet rather than a page, because it is a question you ask in
// passing and then dismiss. Citations render as pills that select the recording behind them,
// which is what keeps an archive-wide answer trustworthy: every claim is one click from source.

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.8 }

const STARTERS = [
  'What did I commit to this week, across everything?',
  'What are the recurring objections?',
  'Which follow-ups have I still not done?',
  'Summarise everything I recorded this week',
]

export default function ArchivePalette({
  open,
  onOpenChange,
  onCite,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCite: (sessionId: string) => void
}) {
  const [messages, setMessages] = useState<ArchiveTurn[]>([])
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  /* ------------------------------------------------------------ shortcuts */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
      if (e.key === 'Escape' && open) onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Load history the first time it's opened, not on mount — this shouldn't cost a request
  // on every page load for a panel most visits never open.
  useEffect(() => {
    if (!open || loaded) return
    setLoaded(true)
    fetch('/api/pen/archive-chat', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j) => setMessages(j.messages ?? []))
      .catch(() => {})
  }, [open, loaded])

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking])

  /* ----------------------------------------------------------------- asks */
  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || thinking) return
      setError(null)
      setThinking(true)
      setQ('')
      // Optimistic: the question appears immediately, the answer lands when it lands.
      setMessages((prev) => [...prev, { role: 'user', content: question, ts: Date.now() }])
      try {
        const r = await fetch('/api/pen/archive-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        })
        if (!r.ok) throw new Error((await r.json()).error ?? 'could not search the archive')
        setMessages(((await r.json()) as { messages: ArchiveTurn[] }).messages)
      } catch (e) {
        setError((e as Error).message)
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setThinking(false)
      }
    },
    [thinking],
  )

  async function reset() {
    await fetch('/api/pen/archive-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    })
    setMessages([])
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="pen-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => onOpenChange(false)}
          />
          <div className="pen-palette-wrap">
          <motion.div
            className="pen-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Ask your archive"
            initial={{ opacity: 0, y: 26, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={SPRING}
          >
            <div className="pen-palette-head">
              <span className="pen-label">Ask your archive</span>
              <div className="flex items-center gap-3">
                {messages.length > 0 && (
                  <button className="pen-mono text-[10px] underline" style={{ color: 'var(--dim)' }} onClick={reset}>
                    clear
                  </button>
                )}
                <kbd className="pen-kbd">esc</kbd>
              </div>
            </div>

            <div className="pen-palette-body">
              {messages.length === 0 && !thinking && (
                <div className="px-1 py-1">
                  <p className="text-[14px] leading-relaxed" style={{ color: 'var(--dim)' }}>
                    Ask about everything you have recorded, not just the one open. Answers cite the
                    recordings they came from.
                  </p>
                  <div className="mt-4 flex flex-col gap-1.5">
                    {STARTERS.map((s, i) => (
                      <motion.button
                        key={s}
                        className="pen-starter"
                        onClick={() => ask(s)}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.04 + i * 0.035 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <motion.div
                  key={`${m.ts}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING}
                  className={m.role === 'user' ? 'pen-pal-q' : 'pen-pal-a'}
                >
                  {m.role === 'user' ? (
                    m.content
                  ) : (
                    <AnswerWithCitations text={m.content} citations={m.citations ?? []} onCite={onCite} />
                  )}
                </motion.div>
              ))}

              {thinking && (
                <div className="pen-pal-a">
                  <span className="pen-mono text-[11px]" style={{ color: 'var(--dim)' }}>
                    Reading the archive
                  </span>
                  <span className="pen-dots ml-1.5">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}

              {error && (
                <p className="px-1 text-[12.5px]" style={{ color: 'var(--bad)' }}>
                  {error}
                </p>
              )}
              <div ref={endRef} />
            </div>

            <form
              className="pen-palette-foot"
              onSubmit={(e) => {
                e.preventDefault()
                ask(q)
              }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask across every recording…"
                className="pen-palette-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(q)
                  }
                }}
              />
              <motion.button
                type="submit"
                className="pen-btn pen-btn-accent"
                disabled={thinking || !q.trim()}
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
              >
                Ask
              </motion.button>
            </form>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/** Splits [1] / [1][3] markers out of the prose and renders each as a pill to its recording. */
function AnswerWithCitations({
  text,
  citations,
  onCite,
}: {
  text: string
  citations: Citation[]
  onCite: (sessionId: string) => void
}) {
  const byMarker = useMemo(() => new Map(citations.map((c) => [c.marker, c])), [citations])
  const parts = useMemo(() => text.split(/(\[\d+\])/g), [text])

  return (
    <div>
      <p className="text-[14.5px] leading-relaxed">
        {parts.map((p, i) => {
          const m = /^\[(\d+)\]$/.exec(p)
          if (!m) return <span key={i}>{p}</span>
          const c = byMarker.get(Number(m[1]))
          // A marker with no matching citation is dropped rather than shown as dead text.
          if (!c) return null
          return (
            <motion.button
              key={i}
              className="pen-cite"
              onClick={() => onCite(c.session_id)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
              title={c.quote ? `“${c.quote}”` : c.title}
            >
              {c.marker}
            </motion.button>
          )
        })}
      </p>

      {citations.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {citations.map((c) => (
            <motion.button
              key={`${c.marker}-${c.session_id}`}
              className="pen-cite-full"
              onClick={() => onCite(c.session_id)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING}
            >
              <span className="pen-cite-n">{c.marker}</span>
              <span className="truncate">{c.title}</span>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
