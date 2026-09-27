'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { postJson, errMessage } from '@/lib/pen/http'
import { useCopy, useLang } from './LangContext'
import { LOCALE, type Copy } from '@/lib/pen/i18n'

// Feature 4 — one button, four states, localised. Never a page-level spinner: the work is
// scoped to this recording, so the feedback should be too.

const SPRING = { type: 'spring' as const, stiffness: 480, damping: 30 }

type State = 'idle' | 'sending' | 'sent' | 'failed'

const MAX_EXTRA = 5

const SB_EN = {
  sendFailed: 'Could not send the briefing.',
  sending: 'Sending',
  sentToN: (n: number) => `Sent to ${n}`,
  sentToYou: 'Sent to you',
  notSent: 'Not sent',
  send: 'Send briefing',
  writeFirst: 'Write the notes first — there is nothing to brief yet',
  lastSent: (d: string) => `Last sent ${d}`,
  sendTitle: 'Email yourself the summary, what you missed, and what is still open',
  alsoTitle: 'Also send to someone else',
  alsoSendTo: 'Also send to',
  always: 'always included',
  remove: (e: string) => `Remove ${e}`,
  limit: (n: number) => `Limit ${n}`,
  hint: (n: number) => `Enter to add. Up to ${n}. They receive the same briefing, and replies come back to you.`,
}

const SB: Copy<typeof SB_EN> = {
  en: SB_EN,
  es: {
    sendFailed: 'No se pudo enviar el resumen.',
    sending: 'Enviando',
    sentToN: (n) => `Enviado a ${n}`,
    sentToYou: 'Enviado a ti',
    notSent: 'No se envió',
    send: 'Enviar resumen',
    writeFirst: 'Primero escribe las notas: todavía no hay nada que resumir',
    lastSent: (d) => `Último envío: ${d}`,
    sendTitle: 'Envíate por correo el resumen, lo que se te pasó y lo que sigue pendiente',
    alsoTitle: 'Enviar también a otra persona',
    alsoSendTo: 'Enviar también a',
    always: 'siempre incluido',
    remove: (e) => `Quitar ${e}`,
    limit: (n) => `Máximo ${n}`,
    hint: (n) => `Enter para agregar. Hasta ${n}. Reciben el mismo resumen, y las respuestas te llegan a ti.`,
  },
  pt: {
    sendFailed: 'Não foi possível enviar o resumo.',
    sending: 'Enviando',
    sentToN: (n) => `Enviado para ${n}`,
    sentToYou: 'Enviado para você',
    notSent: 'Não enviado',
    send: 'Enviar resumo',
    writeFirst: 'Escreva as notas primeiro — ainda não há nada para resumir',
    lastSent: (d) => `Último envio: ${d}`,
    sendTitle: 'Mande para o seu e-mail o resumo, o que passou batido e o que ainda está em aberto',
    alsoTitle: 'Enviar também para outra pessoa',
    alsoSendTo: 'Enviar também para',
    always: 'sempre incluído',
    remove: (e) => `Remover ${e}`,
    limit: (n) => `Máximo ${n}`,
    hint: (n) => `Enter para adicionar. Até ${n}. Eles recebem o mesmo resumo, e as respostas voltam para você.`,
  },
}

export default function SendBriefing({
  sessionId,
  sentAt,
  onSent,
  disabled,
  selfEmail,
}: {
  sessionId: string
  sentAt: string | null
  onSent: (iso: string) => void
  disabled?: boolean
  /** Shown as the always-included recipient, so it is clear who gets it. */
  selfEmail?: string
}) {
  const T = useCopy(SB)
  const lang = useLang()
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [extras, setExtras] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [sentTo, setSentTo] = useState<string[]>([])
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function addDraft() {
    // Accepts a pasted list as easily as a single address.
    const parts = draft.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!parts.length) return
    setExtras((prev) => Array.from(new Set([...prev, ...parts])).slice(0, MAX_EXTRA))
    setDraft('')
  }

  async function send() {
    if (state === 'sending') return
    // An address typed but not yet committed should still be included, rather than silently
    // dropped because the user pressed Send instead of Enter.
    const pending = draft.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
    const also = Array.from(new Set([...extras, ...pending])).slice(0, MAX_EXTRA)

    setError(null)
    setState('sending')
    try {
      const j = await postJson<{ briefing_sent_at?: string; to?: string[] }>('/api/pen/briefing', {
        id: sessionId,
        ...(also.length ? { also } : {}),
      })
      setState('sent')
      setSentTo(j.to ?? [])
      setOpen(false)
      setDraft('')
      onSent(j.briefing_sent_at ?? new Date().toISOString())
      window.setTimeout(() => setState('idle'), 3600)
    } catch (e) {
      setError(errMessage(e, T.sendFailed))
      setState('failed')
      window.setTimeout(() => setState('idle'), 6000)
    }
  }

  const others = sentTo.length - 1
  const label =
    state === 'sending'
      ? T.sending
      : state === 'sent'
        ? others > 0
          ? T.sentToN(sentTo.length)
          : T.sentToYou
        : state === 'failed'
          ? T.notSent
          : T.send

  return (
    <div className="relative flex items-center gap-1.5" ref={wrap}>
      <motion.button
        className="pen-brief"
        data-state={state}
        onClick={send}
        disabled={disabled || state === 'sending'}
        whileTap={{ scale: 0.97 }}
        transition={SPRING}
        title={
          disabled
            ? T.writeFirst
            : sentAt
              ? T.lastSent(new Date(sentAt).toLocaleString(LOCALE[lang]))
              : T.sendTitle
        }
      >
        <span className="pen-brief-icon">
          <AnimatePresence mode="wait" initial={false}>
            {state === 'sending' ? (
              <motion.span
                key="spin"
                className="pen-spin"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={SPRING}
              />
            ) : state === 'sent' ? (
              <motion.svg
                key="tick"
                viewBox="0 0 20 20"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 640, damping: 22 }}
              >
                <motion.path
                  d="M4 10.5 L8 14.5 L16 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </motion.svg>
            ) : (
              <motion.svg
                key="mail"
                viewBox="0 0 20 20"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={SPRING}
              >
                <rect x="2.6" y="4.8" width="14.8" height="10.4" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3.4 6.2 L10 11 L16.6 6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* A popover rather than a permanent second field: the common case is a note to self,
          and an always-visible recipients box would imply otherwise. */}
      <button
        className="pen-brief-more"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        title={T.alsoTitle}
      >
        {extras.length ? `+${extras.length}` : '+'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="pen-brief-pop"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={SPRING}
          >
            <div className="pen-label">{T.alsoSendTo}</div>
            {selfEmail && (
              <p className="pen-brief-self">
                {selfEmail} <span>{T.always}</span>
              </p>
            )}

            {extras.length > 0 && (
              <div className="pen-brief-chips">
                {extras.map((e) => (
                  <span key={e} className="pen-brief-chip">
                    {e}
                    <button onClick={() => setExtras((p) => p.filter((x) => x !== e))} aria-label={T.remove(e)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                addDraft()
              }}
            >
              <input
                className="pen-brief-input"
                type="email"
                multiple
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={addDraft}
                placeholder={extras.length >= MAX_EXTRA ? T.limit(MAX_EXTRA) : 'name@company.com'}
                disabled={extras.length >= MAX_EXTRA}
              />
            </form>
            <p className="pen-brief-hint">
              {T.hint(MAX_EXTRA)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && state === 'failed' && (
          <motion.div
            className="pen-brief-err"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
