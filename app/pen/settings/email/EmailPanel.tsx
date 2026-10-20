'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '../../Icon'
import { useCopy } from '../../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'

type Account = { address: string; isDefault: boolean; needsReconnect: boolean; canRead: boolean; calendar: 'off' | 'on' | 'default' }

const EM_EN = {
  title: 'Send from your Gmail',
  lede: 'When you say “send it” to a draft in the chat, it goes from your own address and lands in your Sent folder.',
  connect: 'Connect Gmail',
  another: 'Connect another Gmail',
  how: 'Google asks to send email as you, and to see and add events on that account’s calendar (untick it if you only want sending). Juno can’t read, search or delete your mail. Any Google account works, including a work one.',
  isDefault: 'Default',
  defaultLine: 'Drafts go from here unless you name another.',
  otherLine: 'Used when you say “send it from this address”, or for people you last wrote to from it.',
  reconnectLine: 'Google stopped accepting Juno’s access. Connect it again to send from it.',
  makeDefault: 'Make default',
  reconnect: 'Connect again',
  disconnect: 'Disconnect',
  working: 'One moment…',
  sendsLabel: 'Sends',
  sends: 'Only drafts you’ve seen and told Juno to send, one at a time.',
  readsLabel: 'Reads',
  reads: 'Nothing. Juno has no access to your inbox.',
  without: 'Without Gmail, “send it” sends from Juno as “your name via Juno”, with replies going to you. Every draft also has a link to open it in your own email.',
  disconnectNote: 'Disconnecting takes away Juno’s permission to send from that address. Emails already sent stay in your Sent folder.',
  justConnected: (a: string) => `${a} is connected. Drafts can go out from it now.`,
  // Reading (team test, only shown to accounts on the allowlist)
  letRead: 'Let Juno read this inbox',
  readOn: 'Juno can read this inbox when you ask in the chat.',
  readTest: 'Reading is a test for the team. Juno uses Google’s read-only permission (it can’t change, send from or delete anything with it), reads only when you ask in the chat, and keeps nothing from your inbox. To stop, disconnect the address and connect it again without reading.',
  readsSome: 'Only when you ask in the chat (search, open a thread), read-only. Nothing from your inbox is kept.',
  readFlash: (a: string) => `${a} is connected, and Juno can read it when you ask in the chat.`,
  readDenied: 'Reading wasn’t allowed on Google’s screen, so Juno can still only send from that address.',
  // Calendar per address (20 Oct)
  calOn: 'Calendar connected.',
  calDefault: 'Calendar connected. New events go here.',
  calUseNew: 'Use for new events',
  calAdd: 'Add calendar',
  calOff: 'Turn off calendar',
  calFlashOn: 'Its calendar is connected too.',
  calFlashDenied: 'The calendar wasn’t allowed on Google’s screen. Use “Add calendar” to try again.',
  calFlashFull: 'Its calendar wasn’t added: you already have 5 calendars connected.',
  calendarLabel: 'Calendar',
  calendarTerms: 'For each address with its calendar on: sees and adds events on calendars that account owns. Briefs and “what’s on tomorrow?” read all of them together.',
  errors: {
    cancelled: 'You cancelled on Google’s screen, so nothing was connected.',
    state: 'That connection attempt expired. Try again.',
    setup: 'Gmail isn’t available yet. Try again soon.',
    readonly: 'Your plan has ended, so your account is read-only. Reactivate it in Billing to connect Gmail.',
    not_granted: 'Sending wasn’t allowed on Google’s screen, so nothing was connected. Try again and leave the box ticked.',
    too_many: 'You can connect up to 5 addresses. Disconnect one first.',
  } as Record<string, string>,
  failed: 'That didn’t go through. Try again.',
}

const EM: Copy<typeof EM_EN> = {
  en: EM_EN,
  es: {
    title: 'Enviar desde tu Gmail',
    lede: 'Cuando dices “envíalo” a un borrador en el chat, sale desde tu propia dirección y queda en tus Enviados.',
    connect: 'Conectar Gmail',
    another: 'Conectar otro Gmail',
    how: 'Google pide enviar correos en tu nombre, y ver y agregar eventos en el calendario de esa cuenta (desmárcalo si solo quieres enviar). Juno no puede leer, buscar ni borrar tu correo. Sirve cualquier cuenta de Google, también la del trabajo.',
    isDefault: 'Predeterminada',
    defaultLine: 'Los borradores salen desde aquí, salvo que nombres otra.',
    otherLine: 'Se usa cuando dices “envíalo desde esta dirección”, o con quienes les escribiste la última vez desde ella.',
    reconnectLine: 'Google dejó de aceptar el acceso de Juno. Conéctala de nuevo para enviar desde ella.',
    makeDefault: 'Hacer predeterminada',
    reconnect: 'Conectar de nuevo',
    disconnect: 'Desconectar',
    working: 'Un momento…',
    sendsLabel: 'Envía',
    sends: 'Solo los borradores que viste y le dijiste a Juno que envíe, uno a la vez.',
    readsLabel: 'Lee',
    reads: 'Nada. Juno no tiene acceso a tu bandeja de entrada.',
    without: 'Sin Gmail, “envíalo” lo manda desde Juno como “tu nombre vía Juno”, y las respuestas te llegan a ti. Cada borrador trae además un link para abrirlo en tu propio correo.',
    disconnectNote: 'Al desconectar, Juno pierde el permiso para enviar desde esa dirección. Los correos ya enviados se quedan en tus Enviados.',
    justConnected: (a) => `${a} quedó conectada. Los borradores ya pueden salir desde ahí.`,
    letRead: 'Dejar que Juno lea esta bandeja',
    readOn: 'Juno puede leer esta bandeja cuando se lo pides en el chat.',
    readTest: 'La lectura es una prueba para el equipo. Juno usa el permiso de solo lectura de Google (con él no puede cambiar, enviar ni borrar nada), lee solo cuando se lo pides en el chat y no guarda nada de tu bandeja. Para detenerlo, desconecta la dirección y conéctala de nuevo sin lectura.',
    readsSome: 'Solo cuando se lo pides en el chat (buscar, abrir un hilo), en modo solo lectura. No se guarda nada de tu bandeja.',
    readFlash: (a) => `${a} quedó conectada, y Juno puede leerla cuando se lo pides en el chat.`,
    readDenied: 'No se permitió la lectura en la pantalla de Google, así que Juno solo puede enviar desde esa dirección.',
    calOn: 'Calendario conectado.',
    calDefault: 'Calendario conectado. Los eventos nuevos van aquí.',
    calUseNew: 'Usar para eventos nuevos',
    calAdd: 'Agregar calendario',
    calOff: 'Desactivar calendario',
    calFlashOn: 'Su calendario también quedó conectado.',
    calFlashDenied: 'No se permitió el calendario en la pantalla de Google. Usa “Agregar calendario” para intentarlo de nuevo.',
    calFlashFull: 'Su calendario no se agregó: ya tienes 5 calendarios conectados.',
    calendarLabel: 'Calendario',
    calendarTerms: 'En cada dirección con su calendario activo: ve y agrega eventos en los calendarios de esa cuenta. Los resúmenes y “¿qué tengo mañana?” los leen todos juntos.',
    errors: {
      cancelled: 'Cancelaste en la pantalla de Google, así que no se conectó nada.',
      state: 'Ese intento de conexión expiró. Inténtalo de nuevo.',
      setup: 'Gmail aún no está disponible. Inténtalo pronto.',
      readonly: 'Tu plan terminó, así que tu cuenta es solo de lectura. Reactívala en Facturación para conectar Gmail.',
      not_granted: 'No se permitió enviar en la pantalla de Google, así que no se conectó nada. Inténtalo de nuevo y deja la casilla marcada.',
      too_many: 'Puedes conectar hasta 5 direcciones. Primero desconecta una.',
    },
    failed: 'No se pudo completar. Inténtalo de nuevo.',
  },
  pt: {
    title: 'Enviar do seu Gmail',
    lede: 'Quando você diz “enviar” a um rascunho no chat, ele sai do seu próprio endereço e fica nos seus Enviados.',
    connect: 'Conectar o Gmail',
    another: 'Conectar outro Gmail',
    how: 'O Google pede para enviar e-mails em seu nome, e para ver e adicionar eventos na agenda dessa conta (desmarque se quiser só enviar). O Juno não consegue ler, buscar nem apagar seus e-mails. Qualquer conta Google serve, inclusive a do trabalho.',
    isDefault: 'Padrão',
    defaultLine: 'Os rascunhos saem daqui, a menos que você indique outro.',
    otherLine: 'Usado quando você diz “envie deste endereço”, ou para quem você escreveu por último a partir dele.',
    reconnectLine: 'O Google parou de aceitar o acesso do Juno. Conecte de novo para enviar dele.',
    makeDefault: 'Tornar padrão',
    reconnect: 'Conectar de novo',
    disconnect: 'Desconectar',
    working: 'Um momento…',
    sendsLabel: 'Envia',
    sends: 'Só os rascunhos que você viu e mandou o Juno enviar, um de cada vez.',
    readsLabel: 'Lê',
    reads: 'Nada. O Juno não tem acesso à sua caixa de entrada.',
    without: 'Sem o Gmail, “enviar” manda pelo Juno como “seu nome via Juno”, e as respostas vão para você. Cada rascunho também traz um link para abrir no seu próprio e-mail.',
    disconnectNote: 'Ao desconectar, o Juno perde a permissão de enviar desse endereço. Os e-mails já enviados continuam nos seus Enviados.',
    justConnected: (a) => `${a} está conectado. Os rascunhos já podem sair dele.`,
    letRead: 'Deixar o Juno ler esta caixa',
    readOn: 'O Juno pode ler esta caixa quando você pede no chat.',
    readTest: 'A leitura é um teste para a equipe. O Juno usa a permissão somente leitura do Google (com ela não consegue mudar, enviar nem apagar nada), lê só quando você pede no chat e não guarda nada da sua caixa. Para parar, desconecte o endereço e conecte de novo sem leitura.',
    readsSome: 'Só quando você pede no chat (buscar, abrir uma conversa), somente leitura. Nada da sua caixa é guardado.',
    readFlash: (a) => `${a} está conectado, e o Juno pode ler quando você pede no chat.`,
    readDenied: 'A leitura não foi permitida na tela do Google, então o Juno só consegue enviar desse endereço.',
    calOn: 'Agenda conectada.',
    calDefault: 'Agenda conectada. Os eventos novos vão para cá.',
    calUseNew: 'Usar para eventos novos',
    calAdd: 'Adicionar agenda',
    calOff: 'Desativar agenda',
    calFlashOn: 'A agenda dele também foi conectada.',
    calFlashDenied: 'A agenda não foi permitida na tela do Google. Use “Adicionar agenda” para tentar de novo.',
    calFlashFull: 'A agenda dele não foi adicionada: você já tem 5 agendas conectadas.',
    calendarLabel: 'Agenda',
    calendarTerms: 'Em cada endereço com a agenda ativa: vê e adiciona eventos nas agendas dessa conta. Os resumos e “o que tenho amanhã?” leem todas juntas.',
    errors: {
      cancelled: 'Você cancelou na tela do Google, então nada foi conectado.',
      state: 'Essa tentativa de conexão expirou. Tente de novo.',
      setup: 'O Gmail ainda não está disponível. Tente novamente em breve.',
      readonly: 'Seu plano terminou, então sua conta é somente leitura. Reative em Cobrança para conectar o Gmail.',
      not_granted: 'O envio não foi permitido na tela do Google, então nada foi conectado. Tente de novo e deixe a caixa marcada.',
      too_many: 'Você pode conectar até 5 endereços. Desconecte um primeiro.',
    },
    failed: 'Não deu certo. Tente de novo.',
  },
}

const CONNECT = '/api/pen/gmail/connect'

/** user@<wbr>domain, so a long work address breaks at the @ on a phone. */
const Addr = ({ a }: { a: string }) => <>{a.split('@')[0]}@<wbr />{a.split('@').slice(1).join('@')}</>

export default function EmailPanel({
  accounts,
  readAllowed = false,
  justConnected,
  readResult = null,
  calResult = null,
  severalCalendars = false,
  error,
}: {
  accounts: Account[]
  readAllowed?: boolean
  justConnected: string | null
  readResult?: 'on' | 'denied' | null
  calResult?: 'on' | 'denied' | 'full' | null
  severalCalendars?: boolean
  error: string | null
}) {
  const T = useCopy(EM)
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(error ? T.errors[error] ?? decodeURIComponent(error) : null)

  async function post(path: string, address: string, body: Record<string, string> = { address }) {
    setBusy(address); setErr(null)
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error(T.failed)
      router.replace('/pen/settings/email')
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(null)
    }
  }

  const connectedNow = justConnected && accounts.some((a) => a.address === justConnected.toLowerCase()) ? justConnected : null
  const base = connectedNow ? (readResult === 'on' ? T.readFlash(connectedNow) : readResult === 'denied' ? `${T.justConnected(connectedNow)} ${T.readDenied}` : T.justConnected(connectedNow)) : null
  const calLine = calResult === 'on' ? T.calFlashOn : calResult === 'denied' ? T.calFlashDenied : calResult === 'full' ? T.calFlashFull : ''
  const flash = base ? `${base}${calLine ? ` ${calLine}` : ''}` : null
  const anyReads = accounts.some((a) => a.canRead)
  const anyCal = accounts.some((a) => a.calendar !== 'off')

  return (
    <div className="pen-set-stack">
      {flash && <div className="pen-set-ok" role="status">{flash}</div>}
      {err && <div className="pen-su-err" role="alert">{err}</div>}

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.title}</h2>
          <p className="pen-set-lede">{T.lede}</p>
        </div>

        {accounts.length > 0 && (
          <ul className="pen-mail-list">
            {accounts.map((a) => (
              <li key={a.address} className="pen-mail-row" data-default={a.isDefault} data-broken={a.needsReconnect}>
                <span className="pen-gcal-mark" aria-hidden="true"><Icon name="mail" size={20} /></span>
                <span className="pen-mail-who">
                  <strong><Addr a={a.address} /></strong>
                  <span>
                    {a.isDefault && <em className="pen-mail-default">{T.isDefault}</em>}
                    {a.needsReconnect ? T.reconnectLine : a.isDefault ? T.defaultLine : T.otherLine}
                  </span>
                  {readAllowed && !a.needsReconnect && (a.canRead
                    ? <span>{T.readOn}</span>
                    : <a className="pen-mail-read" href={`${CONNECT}?read=1&address=${encodeURIComponent(a.address)}`}>{T.letRead}</a>)}
                  {!a.needsReconnect && (a.calendar === 'off'
                    ? <a className="pen-mail-read" href={`${CONNECT}?cal=1&address=${encodeURIComponent(a.address)}`}>{T.calAdd}</a>
                    : (
                      <span className="pen-mail-cal">
                        <span>{a.calendar === 'default' && severalCalendars ? T.calDefault : T.calOn}</span>
                        {a.calendar === 'on' && severalCalendars && (
                          <button type="button" className="pen-mail-off" onClick={() => post('/api/pen/calendars/default', a.address, { key: a.address })} disabled={busy !== null}>{T.calUseNew}</button>
                        )}
                        <button type="button" className="pen-mail-off" onClick={() => post('/api/pen/gmail/calendar-off', a.address)} disabled={busy !== null}>{T.calOff}</button>
                      </span>
                    ))}
                </span>
                <span className="pen-mail-acts">
                  {a.needsReconnect && <a className="pen-btn pen-btn-accent" href={CONNECT}>{T.reconnect}</a>}
                  {!a.isDefault && !a.needsReconnect && (
                    <button type="button" className="pen-btn" onClick={() => post('/api/pen/gmail/default', a.address)} disabled={busy !== null}>
                      {busy === a.address ? T.working : T.makeDefault}
                    </button>
                  )}
                  <button
                    type="button"
                    className="pen-mail-off"
                    onClick={() => post('/api/pen/gmail/disconnect', a.address)}
                    disabled={busy !== null}
                    aria-label={`${T.disconnect} ${a.address}`}
                  >
                    {T.disconnect}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="pen-set-actions">
          <a className={accounts.length ? 'pen-btn' : 'pen-btn pen-btn-accent pen-set-pay'} href={CONNECT}>
            {accounts.length ? T.another : T.connect}
          </a>
        </div>
        <p className="pen-set-fine">{accounts.length ? T.disconnectNote : T.how}</p>
        {readAllowed && accounts.length > 0 && <p className="pen-set-fine">{T.readTest}</p>}

        <dl className="pen-gcal-terms">
          <div><dt>{T.sendsLabel}</dt><dd>{T.sends}</dd></div>
          <div><dt>{T.readsLabel}</dt><dd>{anyReads ? T.readsSome : T.reads}</dd></div>
          {anyCal && <div><dt>{T.calendarLabel}</dt><dd>{T.calendarTerms}</dd></div>}
        </dl>
      </div>

      {accounts.length === 0 && <p className="pen-set-fine pen-mail-without">{T.without}</p>}
    </div>
  )
}
