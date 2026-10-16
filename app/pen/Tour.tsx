'use client'

// The first-run tour: one part of the screen at a time, with a short explanation.
//
// Built the way Janus's tour is, because that one works: the dim is four plain panels around
// the highlighted element (a single full-screen translucent layer with transitions composites
// badly in some browsers), a ring on the target, and a card placed below it or above it.
// A step whose target isn't on screen (the sidebar on a phone, WhatsApp before it's set up)
// is skipped in the direction of travel.
//
// 16 Oct, rewritten for the assistant-first layout: six stops, the same on a computer (sidebar
// expanded or collapsed: each target exists in both, as the icon when collapsed) and on a phone
// (the phone shell's own elements, the tab bar). It ends by opening the sample recording.

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import HowToPlayer from './how-to/HowToPlayer'

type Lang = 'en' | 'es' | 'pt'
// `target` is a selector list; the first match on screen wins. `phone` replaces it on a phone.
// `video` shows the how-to (film/HowToScene.tsx) in the card: English only until it's translated.
type Step = { id: string; target?: string; phone?: string; title: string; body: string; video?: boolean }
type Copy = { ui: { next: string; back: string; skip: string; upload: string; open: string; later: string; of: string }; steps: Step[]; waLinked: Pick<Step, 'title' | 'body'> }

const T_WA = '[data-tour="wa"]'
const T_JUNO = '.pen-juno'
const T_ADD = '.pen-add-btn'
const T_ADD_M = '.pen-m-tab[data-tab="upload"]'
const T_TODAY = '.pen-today'
const T_ASK = '.pen-search'
const T_ASK_M = '.pen-m-tab[data-tab="search"]'
const T_FIRST = '[data-tour="recordings"]'
const T_FIRST_M = '.pen-m-tab[data-tab="recordings"]'

const COPY: Record<Lang, Copy> = {
  en: {
    ui: { next: 'Next', back: 'Back', skip: 'Skip tour', upload: 'Upload a recording', open: 'Open the sample', later: 'I’ll look later', of: 'of' },
    steps: [
      { id: 'video', video: true, title: 'See it in under a minute', body: 'From plugging in the pen to asking about a call on WhatsApp. Then Next walks you through your own screen.' },
      { id: 'juno', target: T_JUNO, title: 'Juno speaks first', body: 'Here’s what I heard and what I can do. One tap and it’s done.' },
      { id: 'add', target: T_ADD, phone: T_ADD_M, title: 'Add anything', body: 'The pen, an audio file, a transcript, or your Granola and Notion notes. It all starts here.' },
      { id: 'wa', target: T_WA, title: 'Get Juno on WhatsApp', body: 'One tap opens WhatsApp with the message ready. Press Send and I’ll text you what to do next. Reply STOP anytime.' },
      { id: 'today', target: T_TODAY, title: 'Today', body: 'What’s due, and what you owe people. Tick it off, or let me draft the email.' },
      { id: 'ask', target: T_ASK, phone: T_ASK_M, title: 'Ask anything', body: 'Search every call you’ve recorded. Type @ to ask about one person, like “what did @Sarah say about pricing?”' },
      { id: 'first', target: T_FIRST, phone: T_FIRST_M, title: 'Your first recording', body: 'Open the sample to see the summary and up to three things I can do for you, each one tap.' },
    ],
    waLinked: { title: 'Juno on WhatsApp', body: 'I text you first: reminders, a brief before you meet someone, what I can do after a call. Reply STOP anytime.' },
  },
  es: {
    ui: { next: 'Siguiente', back: 'Atrás', skip: 'Saltar', upload: 'Subir una grabación', open: 'Abrir el ejemplo', later: 'Lo veo después', of: 'de' },
    steps: [
      { id: 'juno', target: T_JUNO, title: 'Juno habla primero', body: 'Esto es lo que escuché y lo que puedo hacer. Un toque y listo.' },
      { id: 'add', target: T_ADD, phone: T_ADD_M, title: 'Agrega lo que sea', body: 'El lápiz, un archivo de audio, una transcripción o tus notas de Granola y Notion. Todo empieza aquí.' },
      { id: 'wa', target: T_WA, title: 'Agrega a Juno en WhatsApp', body: 'Un toque abre WhatsApp con el mensaje listo. Toca Enviar y te escribo qué hacer después. Responde STOP cuando quieras.' },
      { id: 'today', target: T_TODAY, title: 'Hoy', body: 'Lo que vence y lo que les debes a otros. Márcalo como hecho o deja que redacte el correo.' },
      { id: 'ask', target: T_ASK, phone: T_ASK_M, title: 'Pregunta lo que quieras', body: 'Busca en todas tus reuniones. Escribe @ para preguntar por una persona, como “¿qué dijo @Sofía del precio?”' },
      { id: 'first', target: T_FIRST, phone: T_FIRST_M, title: 'Tu primera grabación', body: 'Abre el ejemplo para ver el resumen y hasta tres cosas que puedo hacer por ti, cada una con un toque.' },
    ],
    waLinked: { title: 'Juno en WhatsApp', body: 'Te escribo primero: recordatorios, un resumen antes de cada reunión y lo que puedo hacer después de una llamada. Responde STOP cuando quieras.' },
  },
  pt: {
    ui: { next: 'Próximo', back: 'Voltar', skip: 'Pular', upload: 'Enviar uma gravação', open: 'Abrir o exemplo', later: 'Vejo depois', of: 'de' },
    steps: [
      { id: 'juno', target: T_JUNO, title: 'O Juno fala primeiro', body: 'Isto é o que eu ouvi e o que posso fazer. Um toque e pronto.' },
      { id: 'add', target: T_ADD, phone: T_ADD_M, title: 'Adicione o que quiser', body: 'A caneta, um arquivo de áudio, uma transcrição ou suas notas do Granola e do Notion. Tudo começa aqui.' },
      { id: 'wa', target: T_WA, title: 'Adicione o Juno no WhatsApp', body: 'Um toque abre o WhatsApp com a mensagem pronta. Toque em Enviar e eu te mando o que fazer depois. Responda STOP quando quiser.' },
      { id: 'today', target: T_TODAY, title: 'Hoje', body: 'O que vence e o que você deve aos outros. Marque como feito ou deixe que eu escreva o e-mail.' },
      { id: 'ask', target: T_ASK, phone: T_ASK_M, title: 'Pergunte qualquer coisa', body: 'Busque em todas as suas reuniões. Digite @ para perguntar sobre uma pessoa, como “o que a @Sofia disse sobre o preço?”' },
      { id: 'first', target: T_FIRST, phone: T_FIRST_M, title: 'Sua primeira gravação', body: 'Abra o exemplo para ver o resumo e até três coisas que posso fazer por você, cada uma com um toque.' },
    ],
    waLinked: { title: 'O Juno no WhatsApp', body: 'Eu te escrevo primeiro: lembretes, um resumo antes das reuniões e o que posso fazer depois de uma ligação. Responda STOP quando quiser.' },
  },
}

const PAD = 8
const GAP = 14
const CARD_W = 340
// The card's height, near enough, for deciding whether it fits under or over the target.
const CARD_H = 230

/** The first element matching the selector that is actually on screen. */
function visibleTarget(selector: string): Element | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (r.right <= 0 || r.left >= window.innerWidth) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    return el
  }
  return null
}

export default function Tour({
  lang,
  phone = false,
  linked = false,
  onClose,
  onUpload,
  onOpenFirst,
}: {
  lang: Lang
  /** The phone shell: steps point at its tab bar instead of the sidebar. */
  phone?: boolean
  /** WhatsApp (or iMessage) is linked: the WhatsApp step explains what Juno sends, not how to link. */
  linked?: boolean
  onClose: () => void
  onUpload: () => void
  /** Opens the sample (or newest) recording. Absent with no recordings: the tour ends on Upload. */
  onOpenFirst?: () => void
}) {
  const { ui } = COPY[lang]
  const steps = useMemo(
    () => COPY[lang].steps.map((st) => ({
      ...st,
      ...(st.id === 'wa' && linked ? COPY[lang].waLinked : {}),
      target: phone && st.phone ? st.phone : st.target,
    })),
    [lang, linked, phone],
  )
  const [i, setI] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [host, setHost] = useState<Element | null>(null)
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])

  const step = steps[i]
  const last = i === steps.length - 1

  // Find this step's target; skip the step if it isn't on screen.
  const locate = useCallback(() => {
    setVw(window.innerWidth)
    // The visible height: on a phone Safari's bars take part of innerHeight's screen.
    setVh(Math.round(window.visualViewport?.height ?? window.innerHeight))
    if (!step.target) return setRect(null)
    const el = visibleTarget(step.target)
    if (!el) {
      const next = i + dir
      if (next >= 0 && next < steps.length) setI(next)
      else setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    // Out of view (Today and the WhatsApp row sit below the fold on a phone): scroll it in. A
    // target taller than the screen (the Juno card on a phone) is lined up with the top instead.
    const tall = r.height > window.innerHeight * 0.6
    if (tall ? r.top < 0 || r.top > window.innerHeight * 0.3 : r.top < 8 || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'instant' })
      requestAnimationFrame(() => setRect(el.getBoundingClientRect()))
    } else setRect(r)
  }, [step, i, dir, steps.length])

  useLayoutEffect(locate, [locate])
  useEffect(() => {
    const on = () => locate()
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    // Safari's bars growing and shrinking change the visible height without a window resize.
    window.visualViewport?.addEventListener('resize', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('scroll', on, true)
      window.visualViewport?.removeEventListener('resize', on)
    }
  }, [locate])

  const go = useCallback((d: 1 | -1) => {
    setDir(d)
    setI((n) => Math.max(0, Math.min(steps.length - 1, n + d)))
  }, [steps.length])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && !last) go(1)
      else if (e.key === 'ArrowLeft' && i > 0) go(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [go, onClose, last, i])

  // Where the card goes: under the target if it fits, otherwise above; centred when there is
  // no target. Always inside the screen.
  const card = useMemo(() => {
    if (step.video) {
      // Wide enough to watch; centred, and tall screens get it a little above the middle.
      const w = Math.min(860, vw - 32)
      return { left: (vw - w) / 2, top: Math.max(16, Math.min(80, vh * 0.06)), w }
    }
    const w = Math.min(CARD_W, vw - 32)
    if (!rect) return { left: (vw - w) / 2, top: Math.max(24, vh / 2 - 130), w }
    // A sidebar icon (the collapsed sidebar, or any narrow target at the left edge): beside it,
    // so the card doesn't cover the page it is pointing out of.
    if (!phone && rect.width < 280 && rect.right + PAD + GAP + w < vw - 16 && rect.left < vw * 0.3) {
      const top = Math.max(16, Math.min(rect.top - PAD, vh - CARD_H - 16))
      return { left: rect.right + PAD + GAP, top, w }
    }
    // A target that fills most of the screen (the Juno card): the card sits inside its lower
    // right corner, where the offers' row ends, instead of over the middle of it.
    if (!phone && rect.height > vh * 0.6 && rect.width > w * 2) {
      const top = Math.max(16, Math.min(rect.bottom, vh) - CARD_H - 28)
      return { left: rect.right - w - 28, top, w }
    }
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - 16))
    const below = rect.bottom + PAD + GAP
    const above = rect.top - PAD - GAP - CARD_H
    // Under it, else over it, else (a target nearly as tall as the screen) over its lower part,
    // clear of a phone's tab bar.
    const top = below + CARD_H < vh ? below : above >= 16 ? above : Math.max(16, vh - CARD_H - (phone ? 96 : 24))
    return { left, top, w }
  }, [rect, vw, vh, step.video, phone])

  if (!host) return null
  // Whole pixels, so the four panels meet with no hairline of undimmed page between them.
  const hole = rect && {
    x: Math.floor(rect.left - PAD),
    y: Math.floor(rect.top - PAD),
    w: Math.ceil(rect.width + PAD * 2),
    h: Math.ceil(rect.height + PAD * 2),
  }

  return createPortal(
    <div className="pen-tour" role="dialog" aria-modal="true" aria-label={step.title} data-step={step.id}>
      {hole ? (
        <>
          <div className="pen-tour-dim" style={{ left: 0, top: 0, width: '100%', height: Math.max(0, hole.y) }} />
          <div className="pen-tour-dim" style={{ left: 0, top: hole.y + hole.h, width: '100%', bottom: 0 }} />
          <div className="pen-tour-dim" style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }} />
          <div className="pen-tour-dim" style={{ left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h }} />
          <div className="pen-tour-ring" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
        </>
      ) : (
        <div className="pen-tour-dim" style={{ inset: 0 }} />
      )}

      <div className="pen-tour-card" style={{ left: card.left, top: card.top, width: card.w, maxHeight: vh ? Math.max(220, vh - card.top - 12) : undefined }}>
        <div className="pen-tour-count">{`${i + 1} ${ui.of} ${steps.length}`}</div>
        <h2 className="pen-tour-title">{step.title}</h2>
        <p className="pen-tour-body">{step.body}</p>
        {step.video && (
          <div className="pen-tour-video">
            <HowToPlayer chapters={false} />
          </div>
        )}
        <div className="pen-tour-actions">
          {last ? (
            <>
              <button type="button" className="pen-btn" onClick={onClose}>{ui.later}</button>
              {onOpenFirst ? (
                <button type="button" className="pen-btn pen-btn-accent" onClick={() => { onClose(); onOpenFirst() }} autoFocus>{ui.open}</button>
              ) : (
                <button type="button" className="pen-btn pen-btn-accent" onClick={() => { onClose(); onUpload() }} autoFocus>{ui.upload}</button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="pen-tour-skip" onClick={onClose}>{ui.skip}</button>
              <span className="pen-tour-nav">
                {i > 0 && <button type="button" className="pen-btn" onClick={() => go(-1)}>{ui.back}</button>}
                <button type="button" className="pen-btn pen-btn-accent" onClick={() => go(1)} autoFocus>{ui.next}</button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>,
    host,
  )
}
