'use client'

// The archive conversation, as a place rather than a modal.
//
// It used to be a ⌘K palette over a scrim: asking a question blocked the app, and leaving
// destroyed the thread. Now it is a view like any other — the sidebar keeps the threads, you
// can walk away mid-answer and come back, and the answer stays put while you open the
// recordings it cites.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ArchiveTurn, Citation } from '@/lib/pen/store'
import type { DocKind } from '@/lib/pen/docs'
import { postJson, errMessage } from '@/lib/pen/http'

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.7 }

/** Kept in sync with ACTIONS in lib/pen/artifact.ts — the server decides what each one writes. */
const QUICK: { kind: DocKind; label: string; hint: string }[] = [
  { kind: 'summary', label: 'Build summary', hint: 'Write this up as a standalone summary' },
  { kind: 'prep', label: 'Draft prep doc', hint: 'What to know walking into the next meeting' },
  { kind: 'checklist', label: 'Make a checklist', hint: 'The outstanding actions, to tick off' },
]

export default function ChatView({
  chatId,
  seed,
  onSeedConsumed,
  onCite,
  onThreadChanged,
  onDocCreated,
}: {
  chatId: string | null
  /** A question typed into the header search; asked as soon as the view mounts. */
  seed?: string | null
  onSeedConsumed?: () => void
  onCite: (sessionId: string) => void
  /** A thread was created or its last message changed — refresh the sidebar. */
  onThreadChanged: (chatId: string) => void
  onDocCreated: (docId: string) => void
}) {
  const [messages, setMessages] = useState<ArchiveTurn[]>([])
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [making, setMaking] = useState<DocKind | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // `id` tracks the thread the answers belong to. A brand-new thread has no id until the
  // first answer comes back, so it is state rather than a prop.
  const [id, setId] = useState<string | null>(chatId)
  useEffect(() => setId(chatId), [chatId])

  useEffect(() => {
    if (!chatId) {
      setMessages([])
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    fetch(`/api/pen/chats/${chatId}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { chat: { messages: ArchiveTurn[] } }) : null))
      .then((j) => {
        if (!alive) return
        setMessages(j?.chat?.messages ?? [])
        setError(j ? null : 'That conversation could not be loaded.')
      })
      .catch(() => alive && setError('That conversation could not be loaded.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [chatId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking, making])

  useEffect(() => {
    if (!chatId && !seed) requestAnimationFrame(() => inputRef.current?.focus())
  }, [chatId, seed])

  // A question typed in the header is asked on arrival rather than dropped into the composer
  // for a second Enter. Consumed immediately so a re-render can't ask it twice.
  useEffect(() => {
    if (!seed) return
    onSeedConsumed?.()
    void ask(seed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  async function ask(question: string) {
    const text = question.trim()
    if (!text || thinking) return
    setError(null)
    setQ('')
    setThinking(true)
    // The question shows immediately; the archive pass takes a while and an empty screen
    // during it reads as a dropped request.
    const optimistic: ArchiveTurn = { role: 'user', content: text, ts: Date.now() }
    setMessages((m) => [...m, optimistic])
    try {
      const j = await postJson<{ chat: { id: string; messages: ArchiveTurn[] } }>('/api/pen/chats', {
        ...(id ? { id } : {}),
        question: text,
      })
      setMessages(j.chat.messages)
      setId(j.chat.id)
      onThreadChanged(j.chat.id)
    } catch (e) {
      setMessages((m) => m.filter((x) => x !== optimistic))
      setQ(text) // Give the question back rather than making them retype it.
      setError(errMessage(e, 'Could not search the archive.'))
    } finally {
      setThinking(false)
    }
  }

  async function make(kind: DocKind) {
    if (!id || making) return
    setError(null)
    setMaking(kind)
    try {
      const j = await postJson<{ doc: { id: string } }>('/api/pen/docs', { chat_id: id, kind })
      onDocCreated(j.doc.id)
    } catch (e) {
      setError(errMessage(e, 'Could not write that document.'))
    } finally {
      setMaking(null)
    }
  }

  const answered = messages.some((m) => m.role === 'assistant')

  return (
    <div className="pen-chatview">
      <div className="pen-chatview-body">
        {loading && (
          <p className="pen-mono text-[11px]" style={{ color: 'var(--dim)' }}>
            Loading…
          </p>
        )}

        {!loading && messages.length === 0 && (
          <div className="pen-chat-empty">
            <h2 className="pen-display text-[26px] leading-tight">Ask across everything you have recorded.</h2>
            <p className="mt-3 max-w-[46ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              Not one meeting — all of them. Answers cite the recordings they came from, and you can
              turn any answer into a page you keep.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div
            key={`${m.ts}-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className={m.role === 'user' ? 'pen-turn-q' : 'pen-turn-a'}
          >
            {m.role === 'user' ? (
              m.content
            ) : (
              <AnswerWithCitations text={m.content} citations={m.citations ?? []} onCite={onCite} />
            )}
          </motion.div>
        ))}

        {thinking && (
          <div className="pen-turn-a">
            <span className="pen-mono text-[11px]" style={{ color: 'var(--dim)' }}>
              Reading the archive
            </span>
            <span className="pen-dots" aria-hidden>
              <span /><span /><span />
            </span>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              className="pen-chat-error"
              role="alert"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
            >
              <span>{error}</span>
              <button className="pen-chat-error-x" onClick={() => setError(null)} aria-label="Dismiss">
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick actions live under the thread, not inside a message: they act on the whole
            conversation, and pinning them to one answer implied otherwise. */}
        {answered && !thinking && (
          <div className="pen-quick">
            <span className="pen-label">Turn this into</span>
            <div className="pen-quick-row">
              {QUICK.map((a) => (
                <button
                  key={a.kind}
                  className="pen-quick-btn"
                  title={a.hint}
                  disabled={!!making}
                  onClick={() => make(a.kind)}
                >
                  {making === a.kind ? 'Writing…' : a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form
        className="pen-composer"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(q)
        }}
      >
        <textarea
          ref={inputRef}
          className="pen-composer-input"
          value={q}
          rows={1}
          placeholder={messages.length ? 'Ask a follow-up…' : 'Ask anything across every recording…'}
          onChange={(e) => {
            setQ(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 168)}px`
          }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the convention everywhere else.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(q)
            }
          }}
        />
        <button className="pen-btn pen-btn-primary" disabled={!q.trim() || thinking}>
          {thinking ? 'Asking…' : 'Ask'}
        </button>
      </form>
    </div>
  )
}

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
      <div className="pen-answer">
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
      </div>

      {citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
              {c.title}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
