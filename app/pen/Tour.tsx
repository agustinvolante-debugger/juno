'use client'

// The first-run tour: one part of the screen at a time, with a short explanation.
//
// Built the way Janus's tour is, because that one works: the dim is four plain panels around
// the highlighted element (a single full-screen translucent layer with transitions composites
// badly in some browsers), a ring on the target, and a card placed below it or above it.
// A step whose target isn't on screen (the sidebar on a phone, WhatsApp before it's set up)
// is skipped in the direction of travel. It ends on "Upload a recording".

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import HowToPlayer from './how-to/HowToPlayer'

type Lang = 'en' | 'es' | 'pt'
// `video` shows the how-to (film/HowToScene.tsx) in the card: English only until it's translated.
type Step = { target?: string; title: string; body: string; video?: boolean }

const UI = {
  en: { next: 'Next', back: 'Back', skip: 'Skip tour', upload: 'Upload a recording', later: 'I’ll do it later', of: 'of' },
  es: { next: 'Siguiente', back: 'Atrás', skip: 'Saltar', upload: 'Subir una grabación', later: 'Lo hago después', of: 'de' },
  pt: { next: 'Próximo', back: 'Voltar', skip: 'Pular', upload: 'Enviar uma gravação', later: 'Faço depois', of: 'de' },
} as const

const STEPS: Record<Lang, Step[]> = {
  en: [
    { video: true, title: 'See it in under a minute', body: 'From plugging in the pen to asking about a call on WhatsApp. Then Next walks you through your own screen.' },
    { title: 'Welcome to Juno Pen', body: 'In one minute: how to add a recording, and everything you get back from it.' },
    { target: '.pen-drop-side', title: 'Add a recording', body: 'Drop in audio from the pen, your phone or any recorder. With the pen plugged in, Connect pen finds new recordings for you.' },
    { target: '.pen-tximp-open', title: 'Already have a transcript?', body: 'Paste text from Pocket, Otter or Plaud and get the same notes, people and search.' },
    { target: '.pen-wa-side, .pen-wa-phone', title: 'Or send it on WhatsApp', body: 'Link your phone once. Then send recordings to the Juno Pen chat and ask about any call from there.' },
    { target: '.pen-rail .pen-row', title: 'Your sample recording', body: 'We added a sample viewing so you can see the result: the summary, the to-dos, what you nearly missed, and who said what.' },
    { target: '.pen-search', title: 'Ask anything', body: 'Search across every call you record. Type @ to ask about one person, like “what did @Sarah say about parking?”' },
    { target: '.pen-home-cards', title: 'Everything still to do', body: 'Open to-dos, things you nearly missed and the people you talk to, gathered from all your calls.' },
    { target: '.pen-acct2-btn', title: 'Make it yours', body: 'In Settings, add your name so Juno knows which voice is you, pick your languages, and link WhatsApp.' },
    { title: 'Ready for your first recording?', body: 'Upload one now. The notes arrive in a few minutes, and a briefing lands in your inbox.' },
  ],
  es: [
    { title: 'Bienvenido a Juno Pen', body: 'En un minuto: cómo agregar una grabación y todo lo que recibes de vuelta.' },
    { target: '.pen-drop-side', title: 'Agrega una grabación', body: 'Sube audio del lápiz, tu celular o cualquier grabadora. Con el lápiz conectado, Connect pen encuentra las grabaciones nuevas.' },
    { target: '.pen-tximp-open', title: '¿Ya tienes una transcripción?', body: 'Pega el texto de Pocket, Otter o Plaud y recibe las mismas notas, personas y búsqueda.' },
    { target: '.pen-wa-side, .pen-wa-phone', title: 'O mándalo por WhatsApp', body: 'Vincula tu celular una vez. Después envía grabaciones al chat de Juno Pen y pregunta por cualquier reunión desde ahí.' },
    { target: '.pen-rail .pen-row', title: 'Tu grabación de ejemplo', body: 'Agregamos una visita de ejemplo para que veas el resultado: el resumen, las tareas, lo que casi se te pasa y quién dijo qué.' },
    { target: '.pen-search', title: 'Pregunta lo que quieras', body: 'Busca en todas tus reuniones. Escribe @ para preguntar por una persona, como “¿qué dijo @Sofía del estacionamiento?”' },
    { target: '.pen-home-cards', title: 'Todo lo pendiente', body: 'Tareas abiertas, lo que casi se te pasa y las personas con las que hablas, de todas tus reuniones.' },
    { target: '.pen-acct2-btn', title: 'Hazlo tuyo', body: 'En Ajustes, agrega tu nombre para que Juno sepa cuál voz es la tuya, elige tus idiomas y vincula WhatsApp.' },
    { title: '¿Listo para tu primera grabación?', body: 'Sube una ahora. Las notas llegan en unos minutos, y te enviamos un resumen al correo.' },
  ],
  pt: [
    { title: 'Bem-vindo ao Juno Pen', body: 'Em um minuto: como adicionar uma gravação e tudo o que você recebe de volta.' },
    { target: '.pen-drop-side', title: 'Adicione uma gravação', body: 'Envie áudio da caneta, do celular ou de qualquer gravador. Com a caneta conectada, o Connect pen encontra as gravações novas.' },
    { target: '.pen-tximp-open', title: 'Já tem uma transcrição?', body: 'Cole o texto do Pocket, Otter ou Plaud e receba as mesmas notas, pessoas e busca.' },
    { target: '.pen-wa-side, .pen-wa-phone', title: 'Ou mande pelo WhatsApp', body: 'Vincule seu celular uma vez. Depois envie gravações para a conversa do Juno Pen e pergunte sobre qualquer reunião dali.' },
    { target: '.pen-rail .pen-row', title: 'Sua gravação de exemplo', body: 'Adicionamos uma visita de exemplo para você ver o resultado: o resumo, as tarefas, o que quase passou batido e quem disse o quê.' },
    { target: '.pen-search', title: 'Pergunte qualquer coisa', body: 'Busque em todas as suas reuniões. Digite @ para perguntar sobre uma pessoa, como “o que a @Sofia disse sobre a vaga?”' },
    { target: '.pen-home-cards', title: 'Tudo o que está pendente', body: 'Tarefas abertas, o que quase passou batido e as pessoas com quem você fala, de todas as reuniões.' },
    { target: '.pen-acct2-btn', title: 'Deixe do seu jeito', body: 'Em Configurações, adicione seu nome para o Juno saber qual voz é a sua, escolha seus idiomas e vincule o WhatsApp.' },
    { title: 'Pronto para a primeira gravação?', body: 'Envie uma agora. As notas chegam em alguns minutos, e um resumo chega no seu e-mail.' },
  ],
}

const PAD = 8
const GAP = 14
const CARD_W = 340

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

export default function Tour({ lang, onClose, onUpload }: { lang: Lang; onClose: () => void; onUpload: () => void }) {
  const steps = STEPS[lang]
  const ui = UI[lang]
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
    setVh(window.innerHeight)
    if (!step.target) return setRect(null)
    const el = visibleTarget(step.target)
    if (!el) {
      const next = i + dir
      if (next >= 0 && next < steps.length) setI(next)
      else setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    if (r.top < 70 || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: 'center' })
      requestAnimationFrame(() => setRect(el.getBoundingClientRect()))
    } else setRect(r)
  }, [step, i, dir, steps.length])

  useLayoutEffect(locate, [locate])
  useEffect(() => {
    const on = () => locate()
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('scroll', on, true)
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
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - 16))
    const below = rect.bottom + PAD + GAP
    const top = below + 230 < vh ? below : Math.max(16, rect.top - PAD - GAP - 230)
    return { left, top, w }
  }, [rect, vw, vh, step.video])

  if (!host) return null
  // Whole pixels, so the four panels meet with no hairline of undimmed page between them.
  const hole = rect && {
    x: Math.floor(rect.left - PAD),
    y: Math.floor(rect.top - PAD),
    w: Math.ceil(rect.width + PAD * 2),
    h: Math.ceil(rect.height + PAD * 2),
  }

  return createPortal(
    <div className="pen-tour" role="dialog" aria-modal="true" aria-label={step.title}>
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

      <div className="pen-tour-card" style={{ left: card.left, top: card.top, width: card.w }}>
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
              <button type="button" className="pen-btn pen-btn-accent" onClick={() => { onClose(); onUpload() }}>{ui.upload}</button>
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
