'use client'

import { useEffect, useState } from 'react'
import { useCopy } from '../../LangContext'
import type { Copy } from '@/lib/pen/i18n'

const WA_EN = {
  startFailed: 'Could not start linking',
  title: 'Juno Pen on WhatsApp',
  lede: 'Plug the pen into your phone, send the recording to Juno Pen on WhatsApp, and the briefing comes back in the chat. You can also ask about any of your calls there.',
  notOn: 'WhatsApp isn’t switched on yet.',
  linked: (p: string) => `Linked to ${p}`,
  number: (n: string) => `Juno Pen's number is ${n}. Save it as a contact so it's easy to find.`,
  openChat: 'Open the chat',
  unlink: 'Unlink this phone',
  qrAria: 'QR code that opens WhatsApp',
  scan: 'Scan with your phone’s camera. WhatsApp opens with the message ready: just tap Send.',
  message: (code: string, n: string) => `The message is LINK ${code}, to ${n}. The code lasts 30 minutes.`,
  updates: 'This page updates by itself once you’re linked.',
  openWith: 'Open WhatsApp with the message',
  link: 'Link WhatsApp',
  howTitle: 'How to send a recording',
  steps: [
    'Plug the pen into your phone’s USB-C port.',
    'In the Juno Pen chat, tap + (Android: the paperclip), then Document, and pick the recording from the pen.',
    'Tap “Everyone agreed” to confirm everyone on the call agreed to be recorded. The briefing comes back in the chat.',
  ],
  fine: 'Any audio file works. A pen WAV fits up to about 50 minutes; MP3 or M4A, much longer. For longer recordings, upload on the website. Recordings sent this way pass through Vonage and WhatsApp on their way to us.',
}

const WA: Copy<typeof WA_EN> = {
  en: WA_EN,
  es: {
    startFailed: 'No se pudo empezar a vincular',
    title: 'Juno Pen en WhatsApp',
    lede: 'Conecta el lápiz a tu celular, envía la grabación a Juno Pen por WhatsApp y el resumen te llega en el chat. Ahí también puedes preguntar por cualquiera de tus reuniones.',
    notOn: 'WhatsApp todavía no está activado.',
    linked: (p) => `Vinculado a ${p}`,
    number: (n) => `El número de Juno Pen es ${n}. Guárdalo como contacto para encontrarlo fácil.`,
    openChat: 'Abrir el chat',
    unlink: 'Desvincular este celular',
    qrAria: 'Código QR que abre WhatsApp',
    scan: 'Escanéalo con la cámara del celular. WhatsApp se abre con el mensaje listo: solo toca Enviar.',
    message: (code, n) => `El mensaje es LINK ${code}, al ${n}. El código dura 30 minutos.`,
    updates: 'Esta página se actualiza sola cuando quedes vinculado.',
    openWith: 'Abrir WhatsApp con el mensaje',
    link: 'Vincular WhatsApp',
    howTitle: 'Cómo enviar una grabación',
    steps: [
      'Conecta el lápiz al puerto USB-C del celular.',
      'En el chat de Juno Pen, toca + (en Android, el clip), luego Documento, y elige la grabación del lápiz.',
      'Toca “Todos aceptaron” para confirmar que todos en la reunión aceptaron ser grabados. El resumen te llega en el chat.',
    ],
    fine: 'Sirve cualquier archivo de audio. Un WAV del lápiz aguanta hasta unos 50 minutos; un MP3 o M4A, mucho más. Para grabaciones más largas, súbelas en la web. Las grabaciones enviadas así pasan por Vonage y WhatsApp antes de llegar a nosotros.',
  },
  pt: {
    startFailed: 'Não foi possível começar a vincular',
    title: 'Juno Pen no WhatsApp',
    lede: 'Conecte a caneta ao celular, envie a gravação para o Juno Pen no WhatsApp e o resumo volta na conversa. Lá você também pode perguntar sobre qualquer reunião.',
    notOn: 'O WhatsApp ainda não está ativado.',
    linked: (p) => `Vinculado a ${p}`,
    number: (n) => `O número do Juno Pen é ${n}. Salve como contato para achar fácil.`,
    openChat: 'Abrir a conversa',
    unlink: 'Desvincular este celular',
    qrAria: 'QR code que abre o WhatsApp',
    scan: 'Escaneie com a câmera do celular. O WhatsApp abre com a mensagem pronta: é só tocar em Enviar.',
    message: (code, n) => `A mensagem é LINK ${code}, para ${n}. O código vale por 30 minutos.`,
    updates: 'Esta página se atualiza sozinha quando você estiver vinculado.',
    openWith: 'Abrir o WhatsApp com a mensagem',
    link: 'Vincular WhatsApp',
    howTitle: 'Como enviar uma gravação',
    steps: [
      'Conecte a caneta na entrada USB-C do celular.',
      'Na conversa do Juno Pen, toque em + (no Android, o clipe), depois em Documento, e escolha a gravação da caneta.',
      'Toque em “Todos concordaram” para confirmar que todos na reunião concordaram em ser gravados. O resumo volta na conversa.',
    ],
    fine: 'Qualquer arquivo de áudio serve. Um WAV da caneta vai até uns 50 minutos; MP3 ou M4A, bem mais. Para gravações mais longas, envie pelo site. As gravações enviadas assim passam pela Vonage e pelo WhatsApp antes de chegar até nós.',
  },
}

/** +1 415 738 6102 from 14157386102. Good enough for US numbers, harmless for the rest. */
function pretty(n: string): string {
  const d = n.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return `+${d}`
}

export default function WhatsAppLink({
  initialPhone,
  number,
  ready,
  loadError,
}: {
  initialPhone: string | null
  number: string
  ready: boolean
  loadError: string | null
}) {
  const T = useCopy(WA)
  const [phone, setPhone] = useState(initialPhone)
  const [link, setLink] = useState<{ code: string; waLink: string; qr: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(loadError)

  // On a phone the button goes straight to WhatsApp with the message typed. On a computer it
  // shows a QR to scan with the phone, since that is where WhatsApp (and the pen) lives.
  async function start() {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/pen/whatsapp/link', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? T.startFailed)
      const phoneDevice = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900
      if (phoneDevice) window.location.href = j.waLink
      setLink({ code: j.code, waLink: j.waLink, qr: j.qr })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Watches for the LINK message to land, so there is no "I sent it" step. Stops when the
  // code would have expired anyway.
  useEffect(() => {
    if (!link || phone) return
    const until = Date.now() + 30 * 60 * 1000
    const t = setInterval(async () => {
      if (Date.now() > until) return clearInterval(t)
      const j = await (await fetch('/api/pen/whatsapp/link')).json().catch(() => ({}))
      if (j.phone) {
        setPhone(j.phone)
        setLink(null)
      }
    }, 3000)
    return () => clearInterval(t)
  }, [link, phone])

  async function unlink() {
    setBusy(true)
    await fetch('/api/pen/whatsapp/link', { method: 'DELETE' }).catch(() => {})
    setPhone(null)
    setBusy(false)
  }

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.title}</h2>
          <p className="pen-set-lede">{T.lede}</p>
        </div>
        {err && <div className="pen-su-err">{err}</div>}

        {!ready ? (
          <p className="pen-set-fine">{T.notOn}</p>
        ) : phone ? (
          <>
            <div className="pen-set-ok" role="status">{T.linked(pretty(phone))}</div>
            <p className="pen-set-fine">{T.number(pretty(number))}</p>
            <div className="pen-set-actions">
              <a className="pen-btn pen-btn-accent" href={`https://wa.me/${number}`} target="_blank" rel="noreferrer">{T.openChat}</a>
              <button type="button" className="pen-btn" onClick={unlink} disabled={busy}>{T.unlink}</button>
            </div>
          </>
        ) : link ? (
          <div className="pen-wa-link">
            <div className="pen-wa-qr" aria-label={T.qrAria} dangerouslySetInnerHTML={{ __html: link.qr }} />
            <div className="pen-wa-steps">
              <p className="pen-set-fine pen-wa-desk">{T.scan}</p>
              <p className="pen-set-fine">{T.message(link.code, pretty(number))}</p>
              <p className="pen-set-fine">{T.updates}</p>
              <div className="pen-set-actions">
                <a className="pen-btn pen-wa-open" href={link.waLink} target="_blank" rel="noreferrer">{T.openWith}</a>
              </div>
            </div>
          </div>
        ) : (
          <div className="pen-set-actions">
            <button type="button" className="pen-btn pen-btn-accent" onClick={start} disabled={busy}>{T.link}</button>
          </div>
        )}
      </div>

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.howTitle}</h2>
        </div>
        <ol className="pen-set-fine" style={{ paddingLeft: 20, lineHeight: 1.7, listStyle: 'decimal' }}>
          {T.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className="pen-set-fine">{T.fine}</p>
      </div>
    </div>
  )
}
