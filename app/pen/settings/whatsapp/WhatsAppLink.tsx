'use client'

import { useEffect, useState } from 'react'
import { useCopy } from '../../LangContext'
import type { Copy } from '@/lib/pen/i18n'
import JunoMessages, { type Prefs } from './JunoMessages'
import GetWhatsApp from '../../GetWhatsApp'

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
  proactive: 'I’ll also text you reminders and briefs from your meetings. Reply STOP anytime.',
  openWith: 'Open WhatsApp with the message',
  link: 'Link WhatsApp',
  howTitle: 'How to send a recording',
  steps: [
    'Plug the pen into your phone’s USB-C port.',
    'In the Juno Pen chat, tap + (Android: the paperclip), then Document, and pick the recording from the pen.',
    'Tap “Everyone agreed” to confirm everyone on the call agreed to be recorded. The briefing comes back in the chat.',
  ],
  fine: 'Any audio file works. A pen WAV fits up to about 50 minutes; MP3 or M4A, much longer. For longer recordings, upload on the website. Recordings sent this way pass through WhatsApp (Meta’s Cloud API) on their way to us; on iMessage, through Sendblue.',
  imTitle: 'Juno Pen on iMessage',
  imBeta: 'In testing',
  imLede: 'Prefer iMessage? Text Juno from your iPhone: the same assistant, in blue bubbles. Voice notes, questions and recordings all work. To confirm a recording, reply YES.',
  imLinked: (p: string, n: string) => `Text Juno at ${n} from ${p}: it already knows it’s you.`,
  imOpen: 'Open Messages',
  imLink: 'Link with iMessage',
  imMessage: (code: string, n: string) => `From your iPhone, text LINK ${code} to ${n}. The code lasts 30 minutes.`,
  imOpenWith: 'Open Messages with the message',
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
    proactive: 'También te escribiré recordatorios y resúmenes de tus reuniones. Responde STOP cuando quieras.',
    openWith: 'Abrir WhatsApp con el mensaje',
    link: 'Vincular WhatsApp',
    howTitle: 'Cómo enviar una grabación',
    steps: [
      'Conecta el lápiz al puerto USB-C del celular.',
      'En el chat de Juno Pen, toca + (en Android, el clip), luego Documento, y elige la grabación del lápiz.',
      'Toca “Todos aceptaron” para confirmar que todos en la reunión aceptaron ser grabados. El resumen te llega en el chat.',
    ],
    fine: 'Sirve cualquier archivo de audio. Un WAV del lápiz aguanta hasta unos 50 minutos; un MP3 o M4A, mucho más. Para grabaciones más largas, súbelas en la web. Las grabaciones enviadas así pasan por WhatsApp (la Cloud API de Meta) antes de llegar a nosotros; por iMessage, por Sendblue.',
    imTitle: 'Juno Pen en iMessage',
    imBeta: 'En prueba',
    imLede: '¿Prefieres iMessage? Escríbele a Juno desde tu iPhone: el mismo asistente, en burbujas azules. Notas de voz, preguntas y grabaciones funcionan igual. Para confirmar una grabación, responde SÍ.',
    imLinked: (p, n) => `Escríbele a Juno al ${n} desde ${p}: ya sabe que eres tú.`,
    imOpen: 'Abrir Mensajes',
    imLink: 'Vincular con iMessage',
    imMessage: (code, n) => `Desde tu iPhone, envía LINK ${code} al ${n}. El código dura 30 minutos.`,
    imOpenWith: 'Abrir Mensajes con el mensaje',
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
    proactive: 'Também vou te mandar lembretes e resumos das suas reuniões. Responda STOP quando quiser.',
    openWith: 'Abrir o WhatsApp com a mensagem',
    link: 'Vincular WhatsApp',
    howTitle: 'Como enviar uma gravação',
    steps: [
      'Conecte a caneta na entrada USB-C do celular.',
      'Na conversa do Juno Pen, toque em + (no Android, o clipe), depois em Documento, e escolha a gravação da caneta.',
      'Toque em “Todos concordaram” para confirmar que todos na reunião concordaram em ser gravados. O resumo volta na conversa.',
    ],
    fine: 'Qualquer arquivo de áudio serve. Um WAV da caneta vai até uns 50 minutos; MP3 ou M4A, bem mais. Para gravações mais longas, envie pelo site. As gravações enviadas assim passam pelo WhatsApp (a Cloud API da Meta) antes de chegar até nós; pelo iMessage, pela Sendblue.',
    imTitle: 'Juno Pen no iMessage',
    imBeta: 'Em teste',
    imLede: 'Prefere o iMessage? Mande mensagem para o Juno do seu iPhone: o mesmo assistente, em balões azuis. Áudios, perguntas e gravações funcionam igual. Para confirmar uma gravação, responda SIM.',
    imLinked: (p, n) => `Mande mensagem para o Juno no ${n} a partir de ${p}: ele já sabe que é você.`,
    imOpen: 'Abrir Mensagens',
    imLink: 'Vincular com iMessage',
    imMessage: (code, n) => `Do seu iPhone, envie LINK ${code} para ${n}. O código vale por 30 minutos.`,
    imOpenWith: 'Abrir Mensagens com a mensagem',
  },
}

/** +1 415 738 6102 from 14157386102. Good enough for US numbers, harmless for the rest. */
function pretty(n: string): string {
  const d = n.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return `+${d}`
}

/** Opens Messages with the number (and text) filled in. iOS reads `&body=`, others `?body=`. */
function smsLink(n: string, body?: string): string {
  const to = `+${n.replace(/\D/g, '')}`
  if (!body) return `sms:${to}`
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh/.test(navigator.userAgent)
  return `sms:${to}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`
}

export default function WhatsAppLink({
  initialPhone,
  number,
  ready,
  loadError,
  prefs,
  imessage = null,
}: {
  initialPhone: string | null
  number: string
  ready: boolean
  loadError: string | null
  /** Messages from Juno (profile.proactive), shown once a phone is linked. */
  prefs: Prefs
  /** Juno's iMessage number (Sendblue), when that channel is switched on. */
  imessage?: string | null
}) {
  const T = useCopy(WA)
  const [phone, setPhone] = useState(initialPhone)
  const [link, setLink] = useState<{ code: string; waLink: string; qr: string } | null>(null)
  // Linking from the iMessage card: same code, but the message goes to Juno's iMessage number.
  const [via, setVia] = useState<'wa' | 'im'>('wa')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(loadError)

  // iMessage linking: the same code, sent to Juno's iMessage number. (WhatsApp is GetWhatsApp's
  // one tap.) On a phone the button goes straight to Messages with the text typed.
  async function start(channel: 'im' = 'im') {
    setVia(channel)
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/pen/whatsapp/link', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? T.startFailed)
      const phoneDevice = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900
      if (phoneDevice && imessage) window.location.href = smsLink(imessage, `LINK ${j.code}`)
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
        ) : (
          // One tap (16 Oct): WhatsApp opens with "LINK <code>" typed, on the phone in the same
          // window, on a computer in a new tab, plus the QR to scan with the phone.
          <>
            <GetWhatsApp number={number} variant="button" qr onLinked={(p) => { setPhone(p); setLink(null) }} />
            <p className="pen-set-fine">{T.proactive}</p>
          </>
        )}
      </div>

      {imessage && (
        <div className="pen-set-card">
          <div className="pen-set-card-head">
            <h2 className="pen-set-h2">{T.imTitle} <span className="pen-im-beta">{T.imBeta}</span></h2>
            <p className="pen-set-lede">{T.imLede}</p>
          </div>
          {phone ? (
            <>
              <p className="pen-set-fine">{T.imLinked(pretty(phone), pretty(imessage))}</p>
              <div className="pen-set-actions">
                <a className="pen-btn pen-btn-accent" href={smsLink(imessage)}>{T.imOpen}</a>
              </div>
            </>
          ) : link && via === 'im' ? (
            <>
              <p className="pen-set-fine">{T.imMessage(link.code, pretty(imessage))}</p>
              <p className="pen-set-fine">{T.updates}</p>
              <p className="pen-set-fine">{T.proactive}</p>
              <div className="pen-set-actions">
                <a className="pen-btn pen-btn-accent" href={smsLink(imessage, `LINK ${link.code}`)}>{T.imOpenWith}</a>
              </div>
            </>
          ) : (
            <div className="pen-set-actions">
              <button type="button" className="pen-btn" onClick={() => start('im')} disabled={busy}>{T.imLink}</button>
            </div>
          )}
        </div>
      )}

      {/* Applies to both channels, so it sits after both cards. */}
      {phone && <JunoMessages initial={prefs} />}

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
