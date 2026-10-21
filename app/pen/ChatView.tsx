'use client'

// The archive conversation, as a place rather than a modal.
//
// It used to be a ⌘K palette over a scrim: asking a question blocked the app, and leaving
// destroyed the thread. Now it is a view like any other — the sidebar keeps the threads, you
// can walk away mid-answer and come back, and the answer stays put while you open the
// recordings it cites.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { Citation, Mention } from '@/lib/pen/store'
import type { WebAction } from '@/lib/pen/agent-io'
import { useTagPicker, TagMenu, TaggedText, type Taggable } from './TagPicker'
import type { DocKind } from '@/lib/pen/docs'
import { postJson, errMessage } from '@/lib/pen/http'
import { useCopy, useLang } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'
import { httpTransport, runChat, type AgentTurn, type ChatBody, type ChatTransport } from './chat-stream'
import { chatMockOn, mockTransport, MOCK_THREAD } from './chat-mock'
import { AskCard, DraftCard, LinkCards, ProgressSteps, RichText, UndoButton, type ActState } from './chat-agent'
import './chat-agent.css'

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.7 }

type Quick = { kind: DocKind; label: string; hint: string }[]

const CV_EN = {
  /** Kept in sync with ACTIONS in lib/pen/artifact.ts — the server decides what each one writes. */
  quick: [
    { kind: 'summary', label: 'Build summary', hint: 'Write this up as a standalone summary' },
    { kind: 'prep', label: 'Draft prep doc', hint: 'What to know walking into the next meeting' },
    { kind: 'checklist', label: 'Make a checklist', hint: 'The outstanding actions, to tick off' },
  ] as Quick,
  loadFailed: 'That conversation could not be loaded.',
  searchFailed: 'Could not search the archive.',
  docFailed: 'Could not write that document.',
  loading: 'Loading…',
  emptyTitle: 'Ask across everything you have recorded.',
  emptyBody: 'Not one meeting — all of them. Answers cite the recordings they came from, and you can turn any answer into a page you keep.',
  reading: 'Reading the archive',
  dismiss: 'Dismiss',
  turnInto: 'Turn this into',
  writing: 'Writing…',
  followUp: 'Ask a follow-up… type @ to name a recording',
  askAnything: 'Ask anything across every recording… type @ to name one',
  readOnly: 'Your plan has ended, so asking is off. Your past chats stay here to read.',
  reactivate: 'Reactivate',
  asking: 'Asking…',
  ask: 'Ask',
  recent: 'Recent',
  pages: 'Pages',
  retry: 'Try again',
  actionFailed: 'That didn’t go through.',
}

const CV: Copy<typeof CV_EN> = {
  en: CV_EN,
  es: {
    quick: [
      { kind: 'summary', label: 'Armar resumen', hint: 'Escribirlo como un resumen independiente' },
      { kind: 'prep', label: 'Preparar la próxima reunión', hint: 'Lo que hay que saber antes de la próxima reunión' },
      { kind: 'checklist', label: 'Hacer una lista', hint: 'Las tareas pendientes, para ir marcándolas' },
    ],
    loadFailed: 'No se pudo cargar esa conversación.',
    searchFailed: 'No se pudo buscar en el archivo.',
    docFailed: 'No se pudo escribir ese documento.',
    loading: 'Cargando…',
    emptyTitle: 'Pregunta sobre todo lo que has grabado.',
    emptyBody: 'No una reunión: todas. Las respuestas citan las grabaciones de donde salen, y puedes convertir cualquier respuesta en una página que se guarda.',
    reading: 'Leyendo el archivo',
    dismiss: 'Cerrar',
    turnInto: 'Convertir en',
    writing: 'Escribiendo…',
    followUp: 'Haz otra pregunta… escribe @ para nombrar una grabación',
    askAnything: 'Pregunta lo que quieras sobre todas tus grabaciones… escribe @ para nombrar una',
    readOnly: 'Tu plan terminó, así que las preguntas están apagadas. Tus chats anteriores siguen aquí para leer.',
    reactivate: 'Reactivar',
    asking: 'Preguntando…',
    ask: 'Preguntar',
    recent: 'Recientes',
    pages: 'Páginas',
    retry: 'Reintentar',
    actionFailed: 'Eso no se pudo hacer.',
  },
  pt: {
    quick: [
      { kind: 'summary', label: 'Montar resumo', hint: 'Escrever como um resumo independente' },
      { kind: 'prep', label: 'Preparar a próxima reunião', hint: 'O que saber antes da próxima reunião' },
      { kind: 'checklist', label: 'Fazer uma lista', hint: 'As tarefas pendentes, para ir marcando' },
    ],
    loadFailed: 'Não foi possível carregar essa conversa.',
    searchFailed: 'Não foi possível buscar no arquivo.',
    docFailed: 'Não foi possível escrever esse documento.',
    loading: 'Carregando…',
    emptyTitle: 'Pergunte sobre tudo o que você gravou.',
    emptyBody: 'Não uma reunião — todas. As respostas citam as gravações de onde vieram, e você pode transformar qualquer resposta numa página que fica salva.',
    reading: 'Lendo o arquivo',
    dismiss: 'Fechar',
    turnInto: 'Transformar em',
    writing: 'Escrevendo…',
    followUp: 'Faça outra pergunta… digite @ para citar uma gravação',
    askAnything: 'Pergunte qualquer coisa sobre todas as gravações… digite @ para citar uma',
    readOnly: 'Seu plano terminou, então as perguntas estão desligadas. Seus chats anteriores continuam aqui para ler.',
    reactivate: 'Reativar',
    asking: 'Perguntando…',
    ask: 'Perguntar',
    recent: 'Recentes',
    pages: 'Páginas',
    retry: 'Tentar de novo',
    actionFailed: 'Isso não deu certo.',
  },
}

export default function ChatView({
  chatId,
  seed,
  onSeedConsumed,
  onCite,
  onThreadChanged,
  onDocCreated,
  recordings = [],
  suggestions = [],
  recent = [],
  onOpenRecent,
  pages = [],
  onOpenPage,
  readOnly = false,
}: {
  chatId: string | null
  /** The plan ended (lib/pen/access.ts): past threads stay readable, nothing new is asked. */
  readOnly?: boolean
  /** Starter questions for an empty chat, so the screen is never blank (phone). */
  suggestions?: string[]
  /** Recent threads to reopen from an empty chat (phone). */
  recent?: { id: string; title: string }[]
  onOpenRecent?: (id: string) => void
  /** Saved pages (pen_docs), newest first: they live here, under Recent, since the sidebar gave its slot to Calendar. */
  pages?: { id: string; title: string }[]
  onOpenPage?: (id: string) => void
  /** What @ can tag: people, and recordings (joined meetings once, under their first part). */
  recordings?: Taggable[]
  /** A question typed into the header search, with its @-tags; asked as soon as the view mounts. */
  seed?: { text: string; mentions: Mention[] } | null
  onSeedConsumed?: () => void
  onCite: (sessionId: string) => void
  /** A thread was created or its last message changed — refresh the sidebar. */
  onThreadChanged: (chatId: string) => void
  onDocCreated: (docId: string) => void
}) {
  const T = useCopy(CV)
  const lang = useLang()
  const [messages, setMessages] = useState<AgentTurn[]>([])
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // What the error's "Try again" re-sends: the question (given back to the composer) or the button press.
  const [retry, setRetry] = useState<(() => void) | null>(null)
  // The assistant's steps while it works (SSE `progress`), newest last.
  const [steps, setSteps] = useState<string[]>([])
  // Button presses on turns, keyed `kind:ts`, and the yes/no given on an ask, by turn ts.
  const [acts, setActs] = useState<Record<string, ActState>>({})
  const [answers, setAnswers] = useState<Record<number, boolean>>({})
  // ?chatmock=1 on localhost: a fake route and a sample thread (chat-mock.ts). Never production.
  const [mock, setMock] = useState(false)
  const transport = useRef<ChatTransport | null>(null)
  const abort = useRef<AbortController | null>(null)
  const [making, setMaking] = useState<DocKind | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Refs, not state, because both guards have to hold WITHIN a single render pass. Clearing
  // the seed via a parent setState does not take effect before the effect can run again, and
  // React re-invokes effects in development — which created three identical threads from one
  // click, 35ms apart, each POSTing without a thread id.
  const askedSeed = useRef<{ text: string } | null>(null)
  const inFlight = useRef(false)

  // `id` tracks the thread the answers belong to. A brand-new thread has no id until the
  // first answer comes back, so it is state rather than a prop.
  const [id, setId] = useState<string | null>(chatId)
  useEffect(() => setId(chatId), [chatId])

  useEffect(() => {
    if (chatMockOn()) {
      setMock(true)
      transport.current = mockTransport(MOCK_THREAD)
      setMessages(MOCK_THREAD)
      setId('mock-thread')
    }
    // No abort on unmount: React mounts this twice in development, and aborting here cancelled
    // the header question's request on the second mount (it never reached the route). A reply
    // that lands after a real unmount only sets state on a gone component, which is harmless.
  }, [])

  useEffect(() => {
    if (chatMockOn()) return
    setActs({})
    setAnswers({})
    if (!chatId) {
      // A header question already on its way stays on screen (this effect runs again on the
      // development remount, after the seed was asked).
      if (inFlight.current) return
      setMessages([])
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    fetch(`/api/pen/chats/${chatId}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { chat: { messages: AgentTurn[] } }) : null))
      .then((j) => {
        if (!alive) return
        setMessages(j?.chat?.messages ?? [])
        setError(j ? null : T.loadFailed)
      })
      .catch(() => alive && setError(T.loadFailed))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking, making, steps.length])

  useEffect(() => {
    if (!chatId && !seed) requestAnimationFrame(() => inputRef.current?.focus())
  }, [chatId, seed])

  // A question typed in the header is asked on arrival rather than dropped into the composer
  // for a second Enter. Consumed immediately so a re-render can't ask it twice.
  useEffect(() => {
    if (!seed || askedSeed.current === seed) return
    askedSeed.current = seed
    onSeedConsumed?.()
    void ask(seed.text, seed.mentions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  const tp = useTagPicker({ value: q, setValue: setQ, field: inputRef, options: recordings })

  async function ask(question: string, preset?: Mention[]) {
    if (readOnly) return
    const text = question.trim()
    // `thinking` is state and lags by a render; the ref closes the window in which two calls
    // can both pass this check and create two threads.
    if (!text || inFlight.current) return
    inFlight.current = true
    setError(null)
    setRetry(null)
    setQ('')
    setThinking(true)
    setSteps([])
    // The question shows immediately; the archive pass takes a while and an empty screen
    // during it reads as a dropped request.
    // Only tags still in the text: deleting the words untags it.
    const mentions = preset ?? tp.take(text)
    const optimistic: AgentTurn = { role: 'user', content: text, ...(mentions.length ? { mentions } : {}), ts: Date.now() }
    setMessages((m) => [...m, optimistic])
    try {
      await send({
        ...(id ? { id } : {}),
        question: text,
        ...(mentions.length ? { mentions: mentions.map((t) => ({ id: t.id, kind: t.kind ?? 'recording', label: t.label })) } : {}),
      })
    } catch (e) {
      if (abort.current?.signal.aborted) return
      setMessages((m) => m.filter((x) => x !== optimistic))
      setQ(text) // Give the question back rather than making them retype it.
      tp.setTags(mentions)
      setError(errMessage(e, T.searchFailed))
      setRetry(() => () => { setQ(''); void ask(text, mentions) })
    } finally {
      inFlight.current = false
      setThinking(false)
      setSteps([])
    }
  }

  /** One request to the route, JSON or streamed; the thread comes back whole either way. */
  async function send(body: ChatBody) {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    // Each step once: a tool that runs again ("Working on it…" twice) adds no new line (founder, 22 Oct).
    const step = (label: string) => setSteps((s) => (s.includes(label) ? s : [...s, label]))
    const j = await runChat(transport.current ?? httpTransport(lang), body, step, ctl.signal, lang)
    setMessages(j.chat.messages)
    setId(j.chat.id)
    // The mock thread is not a real chat: refreshing the sidebar would fetch it by id.
    if (!mock) onThreadChanged(j.chat.id)
  }

  /** A button on a turn (Yes/No, Send, Undo): the press goes to the route as an action. */
  async function act(action: WebAction, key: string): Promise<boolean> {
    if (readOnly || !id || inFlight.current) return false
    inFlight.current = true
    setError(null)
    setRetry(null)
    setThinking(true)
    setSteps([])
    setActs((a) => ({ ...a, [key]: 'busy' }))
    try {
      await send({ id, action })
      setActs((a) => ({ ...a, [key]: 'done' }))
      return true
    } catch (e) {
      if (abort.current?.signal.aborted) return false
      setActs((a) => ({ ...a, [key]: undefined }))
      setError(errMessage(e, T.actionFailed))
      setRetry(() => () => void act(action, key))
      return false
    } finally {
      inFlight.current = false
      setThinking(false)
      setSteps([])
    }
  }

  async function answer(ts: number, yes: boolean) {
    setAnswers((a) => ({ ...a, [ts]: yes }))
    // A failed press un-answers, so Yes/No come back alongside the error's Try again.
    if (!(await act({ kind: 'confirm', yes }, `confirm:${ts}`))) {
      setAnswers((a) => { const n = { ...a }; delete n[ts]; return n })
    }
  }

  async function make(kind: DocKind) {
    if (!id || making || mock) return
    setError(null)
    setMaking(kind)
    try {
      const j = await postJson<{ doc: { id: string } }>('/api/pen/docs', { chat_id: id, kind })
      onDocCreated(j.doc.id)
    } catch (e) {
      setError(errMessage(e, T.docFailed))
    } finally {
      setMaking(null)
    }
  }

  const answered = messages.some((m) => m.role === 'assistant')
  // The server keeps one pending draft: only the newest one in the thread can be sent.
  const lastDraft = messages.reduce((n, m, i) => (m.role === 'assistant' && m.parts?.draft ? i : n), -1)

  return (
    <div className="pen-chatview">
      <div className="pen-chatview-body">
        {loading && (
          <p className="pen-mono text-[13px]" style={{ color: 'var(--dim)' }}>
            {T.loading}
          </p>
        )}

        {!loading && messages.length === 0 && (
          <div className="pen-chat-empty">
            <h2 className="pen-display text-[26px] leading-tight">{T.emptyTitle}</h2>
            <p className="mt-3 max-w-[46ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              {T.emptyBody}
            </p>
            {suggestions.length > 0 && (
              <div className="pen-chat-sugg">
                {suggestions.map((sq) => (
                  <button type="button" key={sq} className="pen-chat-sugg-btn" onClick={() => void ask(sq)}>{sq}</button>
                ))}
              </div>
            )}
            {recent.length > 0 && onOpenRecent && (
              <div className="pen-chat-recent">
                <span className="pen-label">{T.recent}</span>
                {recent.map((r) => (
                  <button type="button" key={r.id} className="pen-chat-recent-btn" onClick={() => onOpenRecent(r.id)}>{r.title}</button>
                ))}
              </div>
            )}
            {pages.length > 0 && onOpenPage && (
              <div className="pen-chat-recent">
                <span className="pen-label">{T.pages}</span>
                {pages.slice(0, 6).map((d) => (
                  <button type="button" key={d.id} className="pen-chat-recent-btn" onClick={() => onOpenPage(d.id)}>{d.title}</button>
                ))}
              </div>
            )}
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
              <TaggedText text={m.content} mentions={m.mentions ?? []} onOpen={onCite} />
            ) : (
              <>
                <AnswerWithCitations text={m.content} citations={m.citations ?? []} onCite={onCite} />
                {m.parts && (m.parts.ask || m.parts.draft || m.parts.links?.length || m.parts.undoable) && (
                  <div className="pen-parts">
                    {m.parts.draft && (
                      <DraftCard
                        draft={m.parts.draft}
                        state={acts[`send:${m.ts}`]}
                        canSend={!readOnly && i === lastDraft && (!thinking || acts[`send:${m.ts}`] === 'busy')}
                        onSend={() => void act({ kind: 'send_draft' }, `send:${m.ts}`)}
                      />
                    )}
                    {m.parts.ask && (
                      <AskCard
                        ask={m.parts.ask}
                        live={!readOnly && !thinking && i === messages.length - 1}
                        answer={answers[m.ts]}
                        onAnswer={(yes) => void answer(m.ts, yes)}
                      />
                    )}
                    {!!m.parts.links?.length && <LinkCards links={m.parts.links} onOpenRecording={onCite} />}
                    {m.parts.undoable && (
                      <div className="pen-parts-foot">
                        <UndoButton
                          state={acts[`undo:${m.ts}`]}
                          disabled={readOnly || (thinking && acts[`undo:${m.ts}`] !== 'busy')}
                          onUndo={() => void act({ kind: 'undo', turn: m.ts }, `undo:${m.ts}`)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        ))}

        {thinking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <ProgressSteps steps={steps} fallback={T.reading} />
          </motion.div>
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
              <span className="pen-chat-error-msg">{error}</span>
              {retry && (
                <button type="button" className="pen-chat-retry" onClick={() => { const r = retry; setError(null); setRetry(null); r() }}>
                  {T.retry}
                </button>
              )}
              <button className="pen-chat-error-x" onClick={() => { setError(null); setRetry(null) }} aria-label={T.dismiss}>
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick actions live under the thread, not inside a message: they act on the whole
            conversation, and pinning them to one answer implied otherwise. */}
        {answered && !thinking && (
          <div className="pen-quick">
            <span className="pen-label">{T.turnInto}</span>
            <div className="pen-quick-row">
              {T.quick.map((a) => (
                <button
                  key={a.kind}
                  className="pen-quick-btn"
                  title={a.hint}
                  disabled={!!making}
                  onClick={() => make(a.kind)}
                >
                  {making === a.kind ? T.writing : a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} className="pen-chat-end" />
      </div>

      {readOnly ? (
        <div className="pen-composer pen-composer-off">
          <span>{T.readOnly}</span>
          <a href="/pen/settings/billing" className="pen-btn pen-btn-accent">{T.reactivate}</a>
        </div>
      ) : (
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
          placeholder={messages.length ? T.followUp : T.askAnything}
          onChange={(e) => {
            setQ(e.target.value)
            tp.sync(e.target.value, e.target.selectionStart ?? e.target.value.length)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 168)}px`
          }}
          onBlur={() => setTimeout(tp.close, 120)}
          aria-autocomplete="list"
          aria-expanded={tp.open}
          onKeyDown={(e) => {
            if (tp.onKey(e)) return
            // Enter sends, Shift+Enter breaks the line — the convention everywhere else.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(q)
            }
          }}
        />
        <TagMenu open={tp.open} matches={tp.matches} pick={tp.pick} setPick={tp.setPick} choose={tp.choose} up />
        <button className="pen-btn pen-btn-primary" disabled={!q.trim() || thinking}>
          {thinking ? T.asking : T.ask}
        </button>
      </form>
      )}
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
  const cite = (marker: number) => {
    const c = byMarker.get(marker)
    // A marker with no matching citation is dropped rather than shown as dead text.
    if (!c) return null
    return (
      <motion.button
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
  }

  return (
    <div>
      {/* Markdown-light, built as nodes (chat-agent.tsx RichText): never HTML from the model. */}
      <RichText text={text} cite={cite} className="pen-answer" />

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
