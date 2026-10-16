'use client'

// One tap to Juno on WhatsApp (16 Oct). The tap asks for a fresh LINK code and opens
// wa.me/<number>?text=LINK%20<code>, so WhatsApp opens with the message already typed and the
// user only presses Send. A phone opens WhatsApp in the same window (the app takes over); a
// computer opens a new tab (WhatsApp Web or the desktop app). Under it, one short line with
// the code in case the text didn't arrive pre-filled.
//
// The page then watches for the LINK message to land (GET /api/pen/whatsapp/link) and, once
// the phone is linked, refreshes the server data so every "Get Juno on WhatsApp" in the app
// turns into "Open WhatsApp" without a reload.
//
//   variant 'button'  a primary pill (Settings)
//   variant 'line'    the "Next from Juno" row on Home: the whole row is the tap
//   variant 'pill'    a secondary pill beside "Upload a recording" (first week)
//   variant 'link'    a quiet text link ("Get it on WhatsApp next time", the upload toast)
//
// WaChatSheet is the phone's Chat tab before a phone is linked: the one tap, or the web chat.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import { MARKS } from './brand-marks'
import { useCopy } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'

const GW_EN = {
  cta: 'Get Juno on WhatsApp',
  line: 'Get Juno on WhatsApp so I can text you what to do next',
  oneTap: 'one tap',
  nextTime: 'Get it on WhatsApp next time',
  opening: 'Opening WhatsApp…',
  again: 'Open WhatsApp again',
  fallback: (code: string, n: string) => `Just press Send. If the message isn’t there, send LINK ${code} to ${n}. The code lasts 30 minutes.`,
  scan: 'Or scan this with your phone’s camera: WhatsApp opens with the message ready.',
  qrAria: 'QR code that opens WhatsApp with the message ready',
  linked: 'You’re on WhatsApp. I’ll text you there.',
  failed: 'Couldn’t open WhatsApp. Try again.',
  sheetTitle: 'Juno on WhatsApp',
  sheetBody: 'Ask about any call, send recordings, and get reminders before you need them, right where you already text. Reply STOP anytime.',
  webChat: 'Use the web chat instead',
  close: 'Close',
}

const GW: Copy<typeof GW_EN> = {
  en: GW_EN,
  es: {
    cta: 'Agrega a Juno en WhatsApp',
    line: 'Agrega a Juno en WhatsApp y te escribo qué hacer después',
    oneTap: 'un toque',
    nextTime: 'La próxima, recíbelo en WhatsApp',
    opening: 'Abriendo WhatsApp…',
    again: 'Abrir WhatsApp otra vez',
    fallback: (code, n) => `Solo toca Enviar. Si el mensaje no aparece, envía LINK ${code} al ${n}. El código dura 30 minutos.`,
    scan: 'O escanéalo con la cámara del celular: WhatsApp se abre con el mensaje listo.',
    qrAria: 'Código QR que abre WhatsApp con el mensaje listo',
    linked: 'Ya estás en WhatsApp. Te escribo por ahí.',
    failed: 'No se pudo abrir WhatsApp. Inténtalo otra vez.',
    sheetTitle: 'Juno en WhatsApp',
    sheetBody: 'Pregunta por cualquier reunión, envía grabaciones y recibe recordatorios antes de necesitarlos, donde ya chateas. Responde STOP cuando quieras.',
    webChat: 'Usar el chat web',
    close: 'Cerrar',
  },
  pt: {
    cta: 'Adicione o Juno no WhatsApp',
    line: 'Adicione o Juno no WhatsApp e eu te mando o que fazer depois',
    oneTap: 'um toque',
    nextTime: 'Da próxima vez, receba no WhatsApp',
    opening: 'Abrindo o WhatsApp…',
    again: 'Abrir o WhatsApp de novo',
    fallback: (code, n) => `É só tocar em Enviar. Se a mensagem não aparecer, envie LINK ${code} para ${n}. O código vale por 30 minutos.`,
    scan: 'Ou escaneie com a câmera do celular: o WhatsApp abre com a mensagem pronta.',
    qrAria: 'QR code que abre o WhatsApp com a mensagem pronta',
    linked: 'Você está no WhatsApp. Eu te escrevo por lá.',
    failed: 'Não foi possível abrir o WhatsApp. Tente de novo.',
    sheetTitle: 'O Juno no WhatsApp',
    sheetBody: 'Pergunte sobre qualquer reunião, envie gravações e receba lembretes antes de precisar, onde você já conversa. Responda STOP quando quiser.',
    webChat: 'Usar o chat na web',
    close: 'Fechar',
  },
}

/** +1 269 778 2307 from 12697782307. Good enough for US numbers, harmless for the rest. */
export function prettyNumber(n: string): string {
  const d = n.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return `+${d}`
}

/** The link the tap opens: WhatsApp with "LINK <code>" typed to Juno's number. */
export function waLinkUrl(number: string, code: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(`LINK ${code}`)}`
}

function onPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900
}

function WaGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg className="pen-gw-glyph" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={MARKS.whatsapp.d} />
    </svg>
  )
}

type Sent = { code: string; waLink: string; qr: string }
type Linked = (phone: string) => void

/**
 * The tap, the code and the wait for the LINK message. Shared by every variant, so they all
 * behave the same: one request per tap, the same window rules, the same polling.
 */
function useOneTap(number: string, onLinked?: Linked) {
  const T = useCopy(GW)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const linkedRef = useRef(onLinked)
  linkedRef.current = onLinked

  const tap = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const phone = onPhone()
    // A computer: open the tab inside the click, before the request, or the browser counts
    // it as a pop-up. It is pointed at WhatsApp once the code arrives.
    const tab = phone ? null : window.open('', '_blank')
    try {
      const r = await fetch('/api/pen/whatsapp/link', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.code) throw new Error(j.error ?? T.failed)
      const url = waLinkUrl(j.number || number, j.code)
      setSent({ code: j.code, waLink: url, qr: j.qr ?? '' })
      if (phone) window.location.href = url
      else if (tab) {
        tab.opener = null
        tab.location.href = url
      } else window.open(url, '_blank', 'noopener')
    } catch (e) {
      tab?.close()
      setErr((e as Error).message || T.failed)
    } finally {
      setBusy(false)
    }
  }, [busy, number, T])

  // Watch for the LINK message to land. Every 3 s, and at once when the user comes back from
  // WhatsApp. Stops when the code would have expired anyway.
  useEffect(() => {
    if (!sent || done) return
    const until = Date.now() + 30 * 60 * 1000
    let stop = false
    const check = async () => {
      if (stop || Date.now() > until) return
      const j = await fetch('/api/pen/whatsapp/link').then((r) => r.json()).catch(() => ({}))
      if (!stop && j.phone) {
        stop = true
        setDone(true)
        if (linkedRef.current) linkedRef.current(j.phone)
        else router.refresh()
      }
    }
    const t = window.setInterval(check, 3000)
    const back = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', back)
    return () => {
      stop = true
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', back)
    }
  }, [sent, done, router])

  return { T, busy, sent, err, done, tap }
}

export default function GetWhatsApp({
  number,
  variant = 'button',
  label,
  qr = false,
  onLinked,
  className = '',
}: {
  /** Juno's WhatsApp number, digits only. */
  number: string
  variant?: 'button' | 'line' | 'pill' | 'link'
  /** Overrides the variant's own words. */
  label?: string
  /** On a computer, also show the QR once the code exists (Settings: WhatsApp lives on the phone). */
  qr?: boolean
  /** Called once the phone is linked. Default: refresh the page's server data. */
  onLinked?: Linked
  className?: string
}) {
  const { T, busy, sent, err, done, tap } = useOneTap(number, onLinked)
  const pretty = prettyNumber(number)
  const fbId = useId()

  let control: React.ReactNode
  if (variant === 'line') {
    control = (
      <button type="button" className="pen-next pen-gw-line" data-linked="false" onClick={() => void tap()} disabled={busy} aria-describedby={sent ? fbId : undefined}>
        <WaGlyph size={18} />
        <span className="pen-next-text">
          {busy ? T.opening : label ?? T.line}
          {!busy && <span className="pen-gw-onetap"> · {T.oneTap}</span>}
        </span>
        <Icon name="chevron" size={15} className="pen-next-go" />
      </button>
    )
  } else if (variant === 'link') {
    control = (
      <button type="button" className="pen-gw-link" onClick={() => void tap()} disabled={busy}>
        <WaGlyph size={15} />
        {busy ? T.opening : label ?? T.nextTime}
      </button>
    )
  } else {
    control = (
      <button
        type="button"
        className={variant === 'pill' ? 'pen-gw-pill' : 'pen-btn pen-btn-accent pen-gw-btn'}
        onClick={() => void tap()}
        disabled={busy}
      >
        <WaGlyph size={variant === 'pill' ? 17 : 18} />
        {busy ? T.opening : sent ? T.again : label ?? T.cta}
      </button>
    )
  }

  return (
    <div className={`pen-gw ${className}`} data-variant={variant} data-tour="wa">
      {control}
      {err && <p className="pen-gw-err" role="alert">{err}</p>}
      {done ? (
        <p className="pen-gw-fb" role="status">{T.linked}</p>
      ) : sent && (
        <div className="pen-gw-sent">
          {qr && sent.qr && (
            <div className="pen-gw-qr pen-wa-desk" aria-label={T.qrAria} role="img" dangerouslySetInnerHTML={{ __html: sent.qr }} />
          )}
          <div className="pen-gw-sent-text">
            <p id={fbId} className="pen-gw-fb" role="status">{T.fallback(sent.code, pretty)}</p>
            {qr && sent.qr && <p className="pen-gw-fb pen-wa-desk">{T.scan}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The phone's Chat tab before WhatsApp is linked: a small sheet over Home with the one tap, or
 * the web chat for anyone who would rather stay in the browser.
 */
export function WaChatSheet({ number, onWebChat, onClose }: { number: string; onWebChat: () => void; onClose: () => void }) {
  const T = useCopy(GW)
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  if (!host) return null
  return createPortal(
    <div className="pen-gw-sheet-wrap" onClick={onClose}>
      <div className="pen-gw-sheet" role="dialog" aria-modal="true" aria-labelledby="pen-gw-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="pen-gw-sheet-grip" aria-hidden="true" />
        <button type="button" className="pen-gw-sheet-x" onClick={onClose} aria-label={T.close}>
          <Icon name="close" size={18} />
        </button>
        <span className="pen-gw-sheet-mark" aria-hidden="true"><WaGlyph size={26} /></span>
        <h2 id="pen-gw-sheet-title" className="pen-gw-sheet-title">{T.sheetTitle}</h2>
        <p className="pen-gw-sheet-body">{T.sheetBody}</p>
        <GetWhatsApp number={number} variant="button" />
        <button type="button" className="pen-gw-sheet-web" onClick={onWebChat}>
          <Icon name="chat" size={17} />
          {T.webChat}
        </button>
      </div>
    </div>,
    host,
  )
}
