'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { postJson, errMessage } from '@/lib/pen/http'
import { AnimatePresence, motion } from 'motion/react'
import type { Deliverable } from '@/lib/pen/store'
import EmailOpen from './EmailOpen'
import { useCopy } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'

// Apple-sheet presentation: rises from the bottom, backdrop blurs, Escape or a tap outside
// dismisses. Anchored low rather than centred because it is a response to something you
// clicked further up the page — the note stays visible behind it.

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 32, mass: 0.9 }

const DS_EN = {
  kinds: { email: 'Draft email', memo: 'Memo', tracker: 'Task card', linkedin: 'LinkedIn note' } as Record<Deliverable['kind'], string>,
  buttons: { email: 'Email', memo: 'Memo', tracker: 'Task card', linkedin: 'LinkedIn note' } as Record<Deliverable['kind'], string>,
  hints: { email: 'A follow-up you can send', memo: 'A short note for your team', tracker: 'Task, owner, due date, to paste in a tracker', linkedin: 'A connection request' } as Record<Deliverable['kind'], string>,
  draft: 'Draft',
  draftFor: (item: string) => `Draft from: ${item}`,
  findOnLinkedIn: (n: string) => `Find ${n} on LinkedIn`,
  chars: (n: number) => `${n} / 300 characters`,
  draftFailed: 'Could not draft that.',
  copyBlocked: 'Copying is blocked here — select the text and copy it manually.',
  drafting: 'Drafting…',
  couldnt: 'Couldn’t draft this',
  close: 'Close',
  from: (item: string) => `From: “${item}”`,
  editFirst: 'Edit it before you send — it’s a draft, not a decision.',
  copied: 'Copied',
  copy: 'Copy',
}

const DS: Copy<typeof DS_EN> = {
  en: DS_EN,
  es: {
    kinds: { email: 'Borrador de correo', memo: 'Memo', tracker: 'Ficha de tarea', linkedin: 'Nota de LinkedIn' },
    buttons: { email: 'Correo', memo: 'Memo', tracker: 'Ficha de tarea', linkedin: 'Nota de LinkedIn' },
    hints: { email: 'Un seguimiento listo para enviar', memo: 'Una nota breve para tu equipo', tracker: 'Tarea, responsable y fecha, para pegar en tu planilla', linkedin: 'Una solicitud de conexión' },
    draft: 'Redactar',
    draftFor: (item) => `Redactar a partir de: ${item}`,
    findOnLinkedIn: (n) => `Buscar a ${n} en LinkedIn`,
    chars: (n) => `${n} / 300 caracteres`,
    draftFailed: 'No se pudo redactar.',
    copyBlocked: 'Aquí no se puede copiar automáticamente: selecciona el texto y cópialo a mano.',
    drafting: 'Redactando…',
    couldnt: 'No se pudo redactar',
    close: 'Cerrar',
    from: (item) => `De: “${item}”`,
    editFirst: 'Revísalo antes de enviarlo: es un borrador, no una decisión.',
    copied: 'Copiado',
    copy: 'Copiar',
  },
  pt: {
    kinds: { email: 'Rascunho de e-mail', memo: 'Memorando', tracker: 'Ficha de tarefa', linkedin: 'Nota do LinkedIn' },
    buttons: { email: 'E-mail', memo: 'Memorando', tracker: 'Ficha de tarefa', linkedin: 'Nota do LinkedIn' },
    hints: { email: 'Um follow-up pronto para enviar', memo: 'Uma nota curta para a equipe', tracker: 'Tarefa, responsável e prazo, para colar na planilha', linkedin: 'Um pedido de conexão' },
    draft: 'Redigir',
    draftFor: (item) => `Redigir a partir de: ${item}`,
    findOnLinkedIn: (n) => `Buscar ${n} no LinkedIn`,
    chars: (n) => `${n} / 300 caracteres`,
    draftFailed: 'Não foi possível redigir.',
    copyBlocked: 'Não dá para copiar automaticamente aqui — selecione o texto e copie manualmente.',
    drafting: 'Redigindo…',
    couldnt: 'Não foi possível redigir',
    close: 'Fechar',
    from: (item) => `De: “${item}”`,
    editFirst: 'Revise antes de enviar — é um rascunho, não uma decisão.',
    copied: 'Copiado',
    copy: 'Copiar',
  },
}

export type SheetRequest = {
  kind: Deliverable['kind']
  item: string
  /** One conversation of an event: drafted from its own lines. `name` is who it was with, if confirmed. */
  conversation?: { pieces: { session: string; segment: string }[]; name?: string | null; search?: string | null }
}

export default function DeliverableSheet({
  request,
  sessionId,
  onClose,
}: {
  request: SheetRequest | null
  sessionId: string
  onClose: () => void
}) {
  const T = useCopy(DS)
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && request) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request, onClose])

  useEffect(() => {
    if (!request) {
      setDeliverable(null)
      setError(null)
      setCopied(false)
      setDraft('')
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    setDeliverable(null)
    postJson<{ deliverable: Deliverable }>('/api/pen/deliverable', {
      id: sessionId,
      kind: request.kind,
      item: request.item,
      ...(request.conversation ? { conversation: { pieces: request.conversation.pieces } } : {}),
    })
      .then((j) => {
        if (!alive) return
        setDeliverable(j.deliverable)
        setDraft(j.deliverable.body)
      })
      .catch((e) => alive && setError(errMessage(e, T.draftFailed)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.kind, request?.item, request?.conversation?.pieces[0]?.segment, sessionId])

  async function copy() {
    if (await writeClipboard(draft)) {
      setError(null)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      setError(T.copyBlocked)
    }
  }

  return (
    <AnimatePresence>
      {request && (
        <>
          <motion.div
            className="pen-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <div className="pen-sheet-wrap">
            <motion.div
              className="pen-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={T.kinds[request.kind]}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={SPRING}
            >
              <div className="pen-sheet-grip" />

              <div className="pen-sheet-head">
                <div className="min-w-0">
                  <div className="pen-label">{T.kinds[request.kind]}</div>
                  <div className="pen-sheet-title">
                    {loading ? T.drafting : (deliverable?.title ?? T.couldnt)}
                  </div>
                </div>
                <button className="pen-sheet-x" onClick={onClose} aria-label={T.close}>
                  ×
                </button>
              </div>

              <div className="pen-sheet-body">
                <p className="pen-sheet-ref">{T.from(request.item)}</p>

                {loading && (
                  <div className="pen-sheet-skeleton">
                    {[92, 78, 96, 61, 84, 44].map((w, i) => (
                      <motion.span
                        key={i}
                        style={{ width: `${w}%` }}
                        initial={{ opacity: 0.3 }}
                        animate={{ opacity: [0.3, 0.62, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.09 }}
                      />
                    ))}
                  </div>
                )}

                {error && (
                  <p className="text-[14.5px]" style={{ color: 'var(--bad)' }}>
                    {error}
                  </p>
                )}

                {deliverable && !loading && (
                  <motion.textarea
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="pen-sheet-text"
                    value={draft}
                    spellCheck
                    onChange={(e) => setDraft(e.target.value)}
                  />
                )}

                {request.kind === 'email' && deliverable && !loading && (
                  <EmailOpen draft={draft} sessionId={sessionId} onCopy={writeClipboard} />
                )}

                {request.kind === 'linkedin' && deliverable && !loading && (
                  <div className="pen-sheet-li">
                    <span data-over={draft.length > 300}>{T.chars(draft.length)}</span>
                    {request.conversation?.name && (
                      <a
                        href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(request.conversation.search || request.conversation.name)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {T.findOnLinkedIn(request.conversation.name)}
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="pen-sheet-foot">
                <span className="pen-mono text-[13px]" style={{ color: 'var(--faint)' }}>
                  {deliverable ? T.editFirst : ''}
                </span>
                <motion.button
                  className="pen-copy"
                  data-done={copied}
                  onClick={copy}
                  disabled={!deliverable || loading}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING}
                >
                  <span className="pen-copy-icon">
                    <AnimatePresence mode="wait" initial={false}>
                      {copied ? (
                        <motion.svg
                          key="tick"
                          viewBox="0 0 20 20"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 620, damping: 24 }}
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
                            transition={{ duration: 0.28, ease: 'easeOut' }}
                          />
                        </motion.svg>
                      ) : (
                        <motion.svg
                          key="box"
                          viewBox="0 0 20 20"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 620, damping: 24 }}
                        >
                          <rect x="6.5" y="6.5" width="10" height="10" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                          <path d="M13.2 4H5.2A1.2 1.2 0 0 0 4 5.2v8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </motion.svg>
                      )}
                    </AnimatePresence>
                  </span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? 'copied' : 'copy'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                    >
                      {copied ? T.copied : T.copy}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * navigator.clipboard needs a secure context AND permission, and is missing or blocked in
 * several in-app browsers and older Safari. Fall back to the execCommand trick so Copy works
 * everywhere rather than only on the happy path.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // Off-screen but still focusable — display:none would make the selection fail.
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** The hover row that appears beside an action or takeaway. */
/**
 * One "Draft" menu per item (critique P2): it used to be three chips on every action, open
 * question and missed item, ninety of them on a long phone page. `linkedin` adds the
 * connection note where a person is the subject.
 */
export function DeliverableActions({ onPick, linkedin = false, item }: { onPick: (kind: Deliverable['kind']) => void; linkedin?: boolean; item?: string }) {
  const T = useCopy(DS)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // The menu sits in .pen-root, above the page, so no card or column can clip it. Under the
  // button, kept inside the screen: a button near the right edge opens the menu leftward.
  const place = () => {
    if (!btn.current) return
    const r = btn.current.getBoundingClientRect()
    const w = menu.current?.offsetWidth ?? 268
    const h = menu.current?.offsetHeight ?? 200
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12))
    const below = r.bottom + 6
    setAt({ top: below + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 6) : below, left })
  }
  useLayoutEffect(() => {
    if (open) place()
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (!wrap.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        if (!items.length) return
        e.preventDefault()
        const at = items.indexOf(document.activeElement as HTMLElement)
        items[e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length].focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    // It follows its button when the page scrolls (a tap's leftover scroll must not close it).
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])
  const kinds: Deliverable['kind'][] = linkedin ? ['email', 'memo', 'tracker', 'linkedin'] : ['email', 'memo', 'tracker']
  return (
    <div className="pen-do" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="pen-do-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={item ? T.draftFor(item) : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {T.draft}
        <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 8 4 4 4-4" /></svg>
      </button>
      {open && createPortal(
        <div
          ref={menu}
          className="pen-do-menu"
          role="menu"
          style={{ position: 'fixed', top: at?.top ?? -9999, left: at?.left ?? -9999 }}
        >
          {kinds.map((k) => (
            <button key={k} type="button" role="menuitem" className="pen-do-item" onClick={() => { setOpen(false); onPick(k) }}>
              <span className="pen-do-item-l">{T.buttons[k]}</span>
              <span className="pen-do-item-h">{T.hints[k]}</span>
            </button>
          ))}
        </div>,
        btn.current?.closest('.pen-root') ?? document.body,
      )}
    </div>
  )
}
