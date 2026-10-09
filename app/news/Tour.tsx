'use client'

// First-run tour of the Daily Brief, built like Juno Pen's (app/pen/Tour.tsx): four plain dim
// panels around the highlighted part of the page, a ring on it, and a card below or above it.
// A step whose target isn't on screen (the rail on a phone) is skipped in the direction of travel.
// Opens by itself the first time a signed-in reader arrives (prefs.layout.onboarded unset), and
// again from the avatar menu ("Show the tutorial", event db:tour). Closing it marks it seen.

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

type Step = { target?: string; title: string; body: string }

const STEPS: Record<'en' | 'es', Step[]> = {
  en: [
    { title: 'Welcome to your Daily Brief', body: 'Your news, markets and the stories you follow, on one page that keeps itself up to date. One minute to see how it works.' },
    { target: '.db-briefing', title: 'Today’s briefing', body: 'Three lines on what matters this morning, written fresh each day. Tap Listen to hear it read out.' },
    { target: '#db-top', title: 'Top stories', body: 'The biggest stories across every section, with the same story from several outlets grouped. The more you read, the more it leans to what you like.' },
    { target: '.db-cmd-trigger, .db-cmd-field', title: 'Ask about anything', body: 'Type a company, a country or a team to get a quick briefing. Choose Monitor to follow a developing story, or Set up to build sections around what you care about.' },
    { target: '.db-sections > section .db-sec-ctl', title: 'Make each section yours', body: 'The menu on every section moves it up or down, shrinks it, tells it what to focus on, or hides it. On a computer, drag the handle to reorder.' },
    { target: '.db-row-acts, .db-act', title: 'Save for later', body: 'The star keeps a story in Saved, so you can come back to it on any device.' },
    { target: '.db-mm', title: 'Your markets', body: 'Edit chooses which markets you see: indexes, US bonds, Chile’s figures, or any company by name.' },
    { target: '.db-avatar', title: 'Your profile and help', body: 'Your profile changes what you read, watch, track and the language. This tutorial is here too.' },
    { title: 'You’re all set', body: 'Everything refreshes on its own while the page is open, including the sections you add. Enjoy the read.' },
  ],
  es: [
    { title: 'Bienvenido a tu Daily Brief', body: 'Tus noticias, los mercados y las historias que sigues, en una página que se actualiza sola. Un minuto para ver cómo funciona.' },
    { target: '.db-briefing', title: 'El resumen de hoy', body: 'Tres líneas con lo importante de la mañana, escritas de nuevo cada día. Toca Escuchar para oírlo en voz alta.' },
    { target: '#db-top', title: 'Lo principal', body: 'Las noticias más importantes de todas las secciones, con la misma historia de varios medios agrupada. Mientras más lees, más se ajusta a tus gustos.' },
    { target: '.db-cmd-trigger, .db-cmd-field', title: 'Pregunta por lo que quieras', body: 'Escribe una empresa, un país o un equipo y recibe un resumen al tiro. Elige Monitorear para seguir una historia en desarrollo, o Configurar para armar secciones con lo que te interesa.' },
    { target: '.db-sections > section .db-sec-ctl', title: 'Cada sección a tu gusto', body: 'El menú de cada sección la sube o la baja, la achica, le dice en qué enfocarse o la oculta. En el computador, arrastra la manilla para ordenar.' },
    { target: '.db-row-acts, .db-act', title: 'Guardar para después', body: 'La estrella deja una noticia en Guardados, para volver a ella desde cualquier dispositivo.' },
    { target: '.db-mm', title: 'Tus mercados', body: 'Editar elige qué mercados ves: índices, bonos de EE. UU., las cifras de Chile o cualquier empresa por su nombre.' },
    { target: '.db-avatar', title: 'Tu perfil y ayuda', body: 'En Tu perfil cambias qué lees, ves y sigues, y el idioma. Este tutorial también está aquí.' },
    { title: 'Todo listo', body: 'Todo se actualiza solo mientras la página está abierta, también las secciones que agregues. Buena lectura.' },
  ],
}

const PAD = 8
const GAP = 14
const CARD_W = 340

function visibleTarget(selector: string): Element | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (r.right <= 0 || r.left >= window.innerWidth) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
    return el
  }
  return null
}

export default function Tour({ lang = 'en', autoStart = false }: { lang?: string; autoStart?: boolean }) {
  const L = lang === 'es' ? 'es' : 'en'
  const steps = STEPS[L]
  const es = L === 'es'
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [host, setHost] = useState<Element | null>(null)
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)

  useEffect(() => {
    setHost(document.querySelector('.db-root') ?? document.body)
    // Let the page settle (fonts, briefing) before the first step measures anything.
    const t = autoStart ? setTimeout(() => setOpen(true), 900) : null
    const on = () => { setI(0); setDir(1); setOpen(true) }
    window.addEventListener('db:tour', on)
    return () => { if (t) clearTimeout(t); window.removeEventListener('db:tour', on) }
  }, [autoStart])

  const close = useCallback(() => {
    setOpen(false)
    // Seen: don't open by itself again (the avatar menu still can).
    void fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { onboarded: true } }) })
  }, [])

  const step = steps[i]
  const last = i === steps.length - 1

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
    const tall = r.height > window.innerHeight * 0.55
    if (r.top < 70 || (!tall && r.bottom > window.innerHeight - 40)) {
      el.scrollIntoView({ block: tall ? 'start' : 'center' })
      requestAnimationFrame(() => setRect(el.getBoundingClientRect()))
    } else setRect(r)
  }, [step, i, dir, steps.length])

  useLayoutEffect(() => { if (open) locate() }, [open, locate])
  useEffect(() => {
    if (!open) return
    const on = () => locate()
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true) }
  }, [open, locate])

  const go = useCallback((d: 1 | -1) => {
    setDir(d)
    setI((n) => Math.max(0, Math.min(steps.length - 1, n + d)))
  }, [steps.length])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' && !last) go(1)
      else if (e.key === 'ArrowLeft' && i > 0) go(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, go, close, last, i])

  const card = useMemo(() => {
    const w = Math.min(CARD_W, vw - 32)
    if (!rect) return { left: (vw - w) / 2, top: Math.max(24, vh / 2 - 130), w }
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - 16))
    const below = rect.bottom + PAD + GAP
    const top = below + 220 < vh ? below : Math.max(16, rect.top - PAD - GAP - 220)
    return { left, top: Math.min(top, vh - 236), w }
  }, [rect, vw, vh])

  if (!open || !host) return null
  const hole = rect && {
    x: Math.floor(rect.left - PAD),
    y: Math.floor(Math.max(rect.top - PAD, 0)),
    w: Math.ceil(rect.width + PAD * 2),
    h: Math.ceil(Math.min(rect.height + PAD * 2, vh - Math.max(rect.top - PAD, 0))),
  }

  return createPortal(
    <div className="db-tour" role="dialog" aria-modal="true" aria-label={step.title}>
      {hole ? (
        <>
          <div className="db-tour-dim" style={{ left: 0, top: 0, width: '100%', height: Math.max(0, hole.y) }} />
          <div className="db-tour-dim" style={{ left: 0, top: hole.y + hole.h, width: '100%', bottom: 0 }} />
          <div className="db-tour-dim" style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }} />
          <div className="db-tour-dim" style={{ left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h }} />
          <div className="db-tour-ring" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
        </>
      ) : (
        <div className="db-tour-dim" style={{ inset: 0 }} />
      )}
      <div className="db-tour-card" style={{ left: card.left, top: card.top, width: card.w }}>
        <div className="db-tour-count">{`${i + 1} ${es ? 'de' : 'of'} ${steps.length}`}</div>
        <h2 className="db-tour-title">{step.title}</h2>
        <p className="db-tour-body">{step.body}</p>
        <div className="db-tour-dots" aria-hidden>{steps.map((_, k) => <span key={k} className={k === i ? 'is-on' : ''} />)}</div>
        <div className="db-tour-actions">
          {last ? (
            <button type="button" className="db-btn is-ink db-tour-go" onClick={close} autoFocus>{es ? 'Empezar a leer' : 'Start reading'}</button>
          ) : (
            <>
              <button type="button" className="db-tour-skip" onClick={close}>{es ? 'Saltar' : 'Skip'}</button>
              <span className="db-tour-nav">
                {i > 0 && <button type="button" className="db-btn" onClick={() => go(-1)}>{es ? 'Atrás' : 'Back'}</button>}
                <button type="button" className="db-btn is-ink" onClick={() => go(1)} autoFocus>{es ? 'Siguiente' : 'Next'}</button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>,
    host,
  )
}
