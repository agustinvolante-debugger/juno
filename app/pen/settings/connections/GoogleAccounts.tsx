'use client'

// Settings → Connections → Google: one row per connected Google address, whatever it is connected
// for. Two tables sit behind it and nobody has to know: pen_gmail (Gmail sending, reading for the
// team test, and that address's calendar; lib/pen/gmail.ts) and the older pen_gcal connection
// (Calendar and Docs & Sheets; lib/pen/google-calendar.ts). The same address in both is one row.
// Replaces Settings → Email and the account half of Settings → Google (20 Oct).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '../../Icon'
import { useCopy } from '../../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'

export type GAccount = {
  /** null: the old Calendar connection from before Google told us the address. */
  address: string | null
  send: boolean
  read: boolean
  cal: boolean
  docs: boolean
  defaultEmail: boolean
  defaultCal: boolean
  broken: boolean
  /** Has a pen_gmail row (sending / reading / its calendar). */
  inGmail: boolean
  /** Is the pen_gcal connection (Calendar and/or Docs & Sheets). */
  inGcal: boolean
  /** Where its calendar comes from (both can be true for the same address). */
  gcalCal: boolean
  gmailCal: boolean
}

export type GoogleStatus = {
  p: string | null
  connected: string | null
  read: string | null
  cal: string | null
  disconnected: string | null
  gone: string | null
  error: string | null
}

const G_EN = {
  title: 'Google',
  lede: 'Gmail and Google Calendar, from any Google account, work ones included. Each address is connected once, for whatever you choose.',
  none: 'No Google account connected yet.',
  connect: 'Connect a Google account',
  another: 'Connect another Google account',
  full: 'You have 5 Google addresses connected, the most Juno takes. Disconnect one to add another.',
  how: 'Google asks to send email as you and to see and add events on that account’s calendar. Untick what you don’t want. Juno can’t read, search or delete your mail.',
  howCalOnly: 'Google asks to see and add events on calendars you own. You can take it back here at any time.',
  noAddress: 'Google account',
  chipSend: 'Sending',
  chipRead: 'Reading',
  chipCal: 'Calendar',
  chipDocs: 'Docs & Sheets',
  test: 'test',
  defEmail: 'Default for email',
  defCal: 'New events go here',
  broken: 'Google stopped accepting Juno’s access. Connect it again.',
  makeDefault: 'Make default for email',
  useForEvents: 'Use for new events',
  addCal: 'Add calendar',
  addSend: 'Send email from it',
  letRead: 'Let Juno read this inbox',
  calOff: 'Turn off calendar',
  reconnect: 'Connect again',
  disconnect: 'Disconnect',
  disconnectAria: (a: string) => `Disconnect ${a}`,
  confirmQ: (a: string, what: string) => `Disconnect ${a}? Juno loses ${what}.`,
  confirmYes: 'Disconnect',
  confirmNo: 'Keep it',
  working: 'One moment…',
  whatSend: 'sending',
  whatRead: 'reading',
  whatCal: 'its calendar',
  whatDocs: 'Docs & Sheets',
  and: 'and',
  without: 'Without a Gmail connected, “send it” sends from Juno as “your name via Juno”, with replies going to you. Every draft also has a link to open it in your own email.',
  termsTitle: 'What Juno does with Google',
  sendsLabel: 'Sends',
  sends: 'Only drafts you’ve seen and told Juno to send, one at a time, from your own address. They land in your Sent folder.',
  readsLabel: 'Reads mail',
  reads: 'Nothing. Juno has no access to your inbox.',
  readsSome: 'Only when you ask in the chat (search, open a thread), read-only. Nothing from your inbox is kept.',
  calLabel: 'Calendar',
  calTerms: 'Adds only events you say yes to in the chat. Reads your next days for briefs and “what’s on tomorrow?”, all calendars together; a meeting on two of them counts once. Nothing from your calendar is stored.',
  readTest: 'Reading is a test for the team. Juno uses Google’s read-only permission, reads only when you ask in the chat, and keeps nothing from your inbox. To stop, disconnect the address and connect it again without reading.',
  severalCals: 'Up to 5 calendars. Say “add it to my work calendar” in the chat to pick one for a single event.',
  // Status after coming back from Google or after an action here
  justConnected: (a: string) => `${a} is connected.`,
  sendReady: 'Drafts can go out from it now.',
  readFlash: 'Juno can read it when you ask in the chat.',
  readDenied: 'Reading wasn’t allowed on Google’s screen, so Juno can still only send from it.',
  calFlashOn: 'Its calendar is connected too.',
  calFlashDenied: 'The calendar wasn’t allowed on Google’s screen. Use “Add calendar” to try again.',
  calFlashFull: 'Its calendar wasn’t added: you already have 5 calendars connected.',
  gcalConnected: 'Google Calendar is connected. Meetings you approve will go straight onto it.',
  bothConnected: 'Google is connected: Calendar, and Docs & Sheets.',
  gcalDisconnected: 'Calendar disconnected. Events already on your calendar stay there.',
  gone: (a: string) => `${a} is disconnected. Emails already sent and events already added stay where they are.`,
  errors: {
    cancelled: 'You cancelled on Google’s screen, so nothing was connected.',
    state: 'That connection attempt expired. Try again.',
    setup: 'Google isn’t available yet. Try again soon.',
    readonly: 'Your plan has ended, so your account is read-only. Reactivate it in Billing to connect Google.',
    not_granted: 'Sending wasn’t allowed on Google’s screen, so nothing was connected. Try again and leave the box ticked.',
    too_many: 'You can connect up to 5 addresses. Disconnect one first.',
  } as Record<string, string>,
  failed: 'That didn’t go through. Try again.',
  notSetUp: 'Google isn’t available yet. Try again soon.',
}

const G: Copy<typeof G_EN> = {
  en: G_EN,
  es: {
    title: 'Google',
    lede: 'Gmail y Google Calendar, de cualquier cuenta de Google, también la del trabajo. Cada dirección se conecta una vez, para lo que tú elijas.',
    none: 'Todavía no hay ninguna cuenta de Google conectada.',
    connect: 'Conectar una cuenta de Google',
    another: 'Conectar otra cuenta de Google',
    full: 'Tienes 5 direcciones de Google conectadas, el máximo que acepta Juno. Desconecta una para agregar otra.',
    how: 'Google pide enviar correos en tu nombre y ver y agregar eventos en el calendario de esa cuenta. Desmarca lo que no quieras. Juno no puede leer, buscar ni borrar tu correo.',
    howCalOnly: 'Google pide ver y agregar eventos en los calendarios que son tuyos. Puedes quitarlo aquí cuando quieras.',
    noAddress: 'Cuenta de Google',
    chipSend: 'Envío',
    chipRead: 'Lectura',
    chipCal: 'Calendario',
    chipDocs: 'Docs y Sheets',
    test: 'prueba',
    defEmail: 'Predeterminada para correo',
    defCal: 'Los eventos nuevos van aquí',
    broken: 'Google dejó de aceptar el acceso de Juno. Conéctala de nuevo.',
    makeDefault: 'Hacer predeterminada para correo',
    useForEvents: 'Usar para eventos nuevos',
    addCal: 'Agregar calendario',
    addSend: 'Enviar correos desde ella',
    letRead: 'Dejar que Juno lea esta bandeja',
    calOff: 'Desactivar calendario',
    reconnect: 'Conectar de nuevo',
    disconnect: 'Desconectar',
    disconnectAria: (a) => `Desconectar ${a}`,
    confirmQ: (a, what) => `¿Desconectar ${a}? Juno pierde ${what}.`,
    confirmYes: 'Desconectar',
    confirmNo: 'Mantener',
    working: 'Un momento…',
    whatSend: 'el envío',
    whatRead: 'la lectura',
    whatCal: 'su calendario',
    whatDocs: 'Docs y Sheets',
    and: 'y',
    without: 'Sin un Gmail conectado, “envíalo” lo manda desde Juno como “tu nombre vía Juno”, y las respuestas te llegan a ti. Cada borrador trae además un link para abrirlo en tu propio correo.',
    termsTitle: 'Qué hace Juno con Google',
    sendsLabel: 'Envía',
    sends: 'Solo los borradores que viste y le dijiste a Juno que envíe, uno a la vez, desde tu propia dirección. Quedan en tus Enviados.',
    readsLabel: 'Lee correo',
    reads: 'Nada. Juno no tiene acceso a tu bandeja de entrada.',
    readsSome: 'Solo cuando se lo pides en el chat (buscar, abrir un hilo), en modo solo lectura. No se guarda nada de tu bandeja.',
    calLabel: 'Calendario',
    calTerms: 'Agrega solo los eventos a los que dices que sí en el chat. Lee tus próximos días para los resúmenes y “¿qué tengo mañana?”, todos los calendarios juntos; una reunión que está en dos cuenta una vez. No se guarda nada de tu calendario.',
    readTest: 'La lectura es una prueba para el equipo. Juno usa el permiso de solo lectura de Google, lee solo cuando se lo pides en el chat y no guarda nada de tu bandeja. Para detenerlo, desconecta la dirección y conéctala de nuevo sin lectura.',
    severalCals: 'Hasta 5 calendarios. Di “agrégalo a mi calendario del trabajo” en el chat para elegir uno para un evento.',
    justConnected: (a) => `${a} quedó conectada.`,
    sendReady: 'Los borradores ya pueden salir desde ahí.',
    readFlash: 'Juno puede leerla cuando se lo pides en el chat.',
    readDenied: 'No se permitió la lectura en la pantalla de Google, así que Juno solo puede enviar desde ella.',
    calFlashOn: 'Su calendario también quedó conectado.',
    calFlashDenied: 'No se permitió el calendario en la pantalla de Google. Usa “Agregar calendario” para intentarlo de nuevo.',
    calFlashFull: 'Su calendario no se agregó: ya tienes 5 calendarios conectados.',
    gcalConnected: 'Google Calendar está conectado. Las reuniones que apruebes irán directo ahí.',
    bothConnected: 'Google está conectado: Calendar, y Docs y Sheets.',
    gcalDisconnected: 'Calendario desconectado. Los eventos que ya están en tu calendario se quedan.',
    gone: (a) => `${a} quedó desconectada. Los correos ya enviados y los eventos ya agregados se quedan donde están.`,
    errors: {
      cancelled: 'Cancelaste en la pantalla de Google, así que no se conectó nada.',
      state: 'Ese intento de conexión expiró. Inténtalo de nuevo.',
      setup: 'Google aún no está disponible. Inténtalo pronto.',
      readonly: 'Tu plan terminó, así que tu cuenta es solo de lectura. Reactívala en Facturación para conectar Google.',
      not_granted: 'No se permitió enviar en la pantalla de Google, así que no se conectó nada. Inténtalo de nuevo y deja la casilla marcada.',
      too_many: 'Puedes conectar hasta 5 direcciones. Primero desconecta una.',
    },
    failed: 'No se pudo completar. Inténtalo de nuevo.',
    notSetUp: 'Google aún no está disponible. Inténtalo pronto.',
  },
  pt: {
    title: 'Google',
    lede: 'Gmail e Google Agenda, de qualquer conta Google, inclusive a do trabalho. Cada endereço é conectado uma vez, para o que você escolher.',
    none: 'Nenhuma conta Google conectada ainda.',
    connect: 'Conectar uma conta Google',
    another: 'Conectar outra conta Google',
    full: 'Você tem 5 endereços Google conectados, o máximo que o Juno aceita. Desconecte um para adicionar outro.',
    how: 'O Google pede para enviar e-mails em seu nome e para ver e adicionar eventos na agenda dessa conta. Desmarque o que não quiser. O Juno não consegue ler, buscar nem apagar seus e-mails.',
    howCalOnly: 'O Google pede para ver e adicionar eventos nas agendas que são suas. Você pode tirar essa permissão aqui quando quiser.',
    noAddress: 'Conta Google',
    chipSend: 'Envio',
    chipRead: 'Leitura',
    chipCal: 'Agenda',
    chipDocs: 'Docs e Planilhas',
    test: 'teste',
    defEmail: 'Padrão para e-mail',
    defCal: 'Os eventos novos vão para cá',
    broken: 'O Google parou de aceitar o acesso do Juno. Conecte de novo.',
    makeDefault: 'Tornar padrão para e-mail',
    useForEvents: 'Usar para eventos novos',
    addCal: 'Adicionar agenda',
    addSend: 'Enviar e-mails dele',
    letRead: 'Deixar o Juno ler esta caixa',
    calOff: 'Desativar agenda',
    reconnect: 'Conectar de novo',
    disconnect: 'Desconectar',
    disconnectAria: (a) => `Desconectar ${a}`,
    confirmQ: (a, what) => `Desconectar ${a}? O Juno perde ${what}.`,
    confirmYes: 'Desconectar',
    confirmNo: 'Manter',
    working: 'Um momento…',
    whatSend: 'o envio',
    whatRead: 'a leitura',
    whatCal: 'a agenda',
    whatDocs: 'Docs e Planilhas',
    and: 'e',
    without: 'Sem um Gmail conectado, “enviar” manda pelo Juno como “seu nome via Juno”, e as respostas vão para você. Cada rascunho também traz um link para abrir no seu próprio e-mail.',
    termsTitle: 'O que o Juno faz com o Google',
    sendsLabel: 'Envia',
    sends: 'Só os rascunhos que você viu e mandou o Juno enviar, um de cada vez, do seu próprio endereço. Ficam nos seus Enviados.',
    readsLabel: 'Lê e-mail',
    reads: 'Nada. O Juno não tem acesso à sua caixa de entrada.',
    readsSome: 'Só quando você pede no chat (buscar, abrir uma conversa), somente leitura. Nada da sua caixa é guardado.',
    calLabel: 'Agenda',
    calTerms: 'Adiciona só os eventos para os quais você diz sim no chat. Lê os seus próximos dias para os resumos e “o que tenho amanhã?”, todas as agendas juntas; uma reunião que está em duas conta uma vez. Nada da sua agenda fica guardado.',
    readTest: 'A leitura é um teste para a equipe. O Juno usa a permissão somente leitura do Google, lê só quando você pede no chat e não guarda nada da sua caixa. Para parar, desconecte o endereço e conecte de novo sem leitura.',
    severalCals: 'Até 5 agendas. Diga “coloque na minha agenda do trabalho” no chat para escolher uma para um evento.',
    justConnected: (a) => `${a} está conectado.`,
    sendReady: 'Os rascunhos já podem sair dele.',
    readFlash: 'O Juno pode ler quando você pede no chat.',
    readDenied: 'A leitura não foi permitida na tela do Google, então o Juno só consegue enviar dele.',
    calFlashOn: 'A agenda dele também foi conectada.',
    calFlashDenied: 'A agenda não foi permitida na tela do Google. Use “Adicionar agenda” para tentar de novo.',
    calFlashFull: 'A agenda dele não foi adicionada: você já tem 5 agendas conectadas.',
    gcalConnected: 'O Google Agenda está conectado. As reuniões que você aprovar vão direto para lá.',
    bothConnected: 'O Google está conectado: Agenda, e Docs e Planilhas.',
    gcalDisconnected: 'Agenda desconectada. Os eventos que já estão na sua agenda continuam lá.',
    gone: (a) => `${a} foi desconectado. Os e-mails já enviados e os eventos já adicionados continuam onde estão.`,
    errors: {
      cancelled: 'Você cancelou na tela do Google, então nada foi conectado.',
      state: 'Essa tentativa de conexão expirou. Tente de novo.',
      setup: 'O Google ainda não está disponível. Tente novamente em breve.',
      readonly: 'Seu plano terminou, então sua conta é somente leitura. Reative em Cobrança para conectar o Google.',
      not_granted: 'O envio não foi permitido na tela do Google, então nada foi conectado. Tente de novo e deixe a caixa marcada.',
      too_many: 'Você pode conectar até 5 endereços. Desconecte um primeiro.',
    },
    failed: 'Não deu certo. Tente de novo.',
    notSetUp: 'O Google ainda não está disponível. Tente novamente em breve.',
  },
}

const GMAIL = '/api/pen/gmail/connect'
const GCAL = '/api/pen/google-calendar/connect'

/** user@<wbr>domain, so a long work address breaks at the @ on a phone. */
const Addr = ({ a }: { a: string }) => <>{a.split('@')[0]}@<wbr />{a.split('@').slice(1).join('@')}</>

const post = async (path: string, body: Record<string, string>) => {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(String(r.status))
}

export default function GoogleAccounts({
  configured,
  gmailOn,
  readAllowed,
  accounts,
  calCount,
  status,
}: {
  /** Google OAuth is set up at all (gcalConfigured). */
  configured: boolean
  /** pen_gmail exists (gmailAvailable): one connection per address for email + calendar. */
  gmailOn: boolean
  readAllowed: boolean
  accounts: GAccount[]
  calCount: number
  status: GoogleStatus
}) {
  const T = useCopy(G)
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(status.error ? T.errors[status.error] ?? decodeURIComponent(status.error) : null)

  const keyOf = (a: GAccount) => a.address ?? 'gcal'
  /** Stay on Connections, at the Google row, with an optional status to show. */
  function stay(q?: Record<string, string>) {
    const qs = q ? `?${new URLSearchParams({ p: 'google', ...q })}` : ''
    router.replace(`${window.location.pathname}${qs}#google`, { scroll: false })
    router.refresh()
  }
  async function run(a: GAccount, steps: [string, Record<string, string>][], after?: Record<string, string>) {
    setBusy(keyOf(a)); setErr(null)
    try {
      for (const [path, body] of steps) await post(path, body)
      setConfirm(null)
      stay(after)
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(null)
    }
  }

  const senders = accounts.filter((a) => a.send).length
  const full = accounts.length >= 5
  const connectHref = gmailOn ? GMAIL : `${GCAL}?want=gcal`

  // What came back from Google (?p=email|google…) or from an action here (?gone=).
  const flash = (() => {
    if (status.gone) return T.gone(status.gone)
    if (status.p === 'email' && status.connected) {
      const a = status.connected.toLowerCase()
      const acc = accounts.find((x) => x.address === a)
      if (!acc) return null
      const parts = [T.justConnected(status.connected)]
      if (acc.send) parts.push(status.read === 'on' ? T.readFlash : T.sendReady)
      if (status.read === 'denied') parts.push(T.readDenied)
      if (status.cal === 'on') parts.push(T.calFlashOn)
      else if (status.cal === 'denied') parts.push(T.calFlashDenied)
      else if (status.cal === 'full') parts.push(T.calFlashFull)
      return parts.join(' ')
    }
    if (status.p === 'google') {
      const g = accounts.find((x) => x.inGcal)
      if (status.connected === 'both' && g?.cal && g.docs) return T.bothConnected
      if ((status.connected === 'gcal' || status.connected === '1') && g?.gcalCal) return T.gcalConnected
      if (status.disconnected === 'gcal' && !g?.gcalCal) return T.gcalDisconnected
    }
    return null
  })()

  if (!configured) return <p className="pen-set-lede">{T.notSetUp}</p>

  const anyRead = accounts.some((a) => a.read)
  return (
    <div className="pen-gacc">
      {flash && <div className="pen-set-ok" role="status">{flash}</div>}
      {err && <div className="pen-su-err" role="alert">{err}</div>}

      {accounts.length > 0 ? (
        <ul className="pen-gacc-list">
          {accounts.map((a) => {
            const k = keyOf(a)
            const label = a.address ?? T.noAddress
            const what = [a.send && T.whatSend, a.read && T.whatRead, a.cal && T.whatCal, a.docs && T.whatDocs].filter(Boolean) as string[]
            const whatLine = what.length > 1 ? `${what.slice(0, -1).join(', ')} ${T.and} ${what[what.length - 1]}` : what[0] ?? ''
            const off: [string, Record<string, string>][] = []
            if (a.inGmail && a.address) off.push(['/api/pen/gmail/disconnect', { address: a.address }])
            if (a.inGcal) off.push(['/api/pen/google-calendar/disconnect', { what: 'all' }])
            const calOff: [string, Record<string, string>][] = []
            if (a.gmailCal && a.address) calOff.push(['/api/pen/gmail/calendar-off', { address: a.address }])
            if (a.gcalCal) calOff.push(['/api/pen/google-calendar/disconnect', { what: 'gcal' }])
            const reconnect = a.inGmail && a.address
              ? `${GMAIL}?address=${encodeURIComponent(a.address)}${a.send ? '' : '&cal=1'}`
              : `${GCAL}?want=${a.cal && a.docs ? 'both' : a.docs ? 'drive' : 'gcal'}`
            const acts: React.ReactNode[] = []
            if (!a.broken) {
              if (a.send && !a.defaultEmail && senders > 1) acts.push(<button key="de" type="button" className="pen-mail-off" onClick={() => run(a, [['/api/pen/gmail/default', { address: a.address! }]])} disabled={busy !== null}>{T.makeDefault}</button>)
              if (a.cal && !a.defaultCal && calCount > 1) acts.push(<button key="dc" type="button" className="pen-mail-off" onClick={() => run(a, [['/api/pen/calendars/default', { key: a.address ?? 'gcal' }]])} disabled={busy !== null}>{T.useForEvents}</button>)
              if (!a.cal && calCount < 5) {
                const href = gmailOn && a.address ? `${GMAIL}?cal=1&address=${encodeURIComponent(a.address)}` : a.inGcal ? `${GCAL}?want=${a.docs ? 'both' : 'gcal'}` : null
                if (href) acts.push(<a key="ac" className="pen-mail-read" href={href}>{T.addCal}</a>)
              }
              if (gmailOn && !a.send && a.address) acts.push(<a key="as" className="pen-mail-read" href={`${GMAIL}?address=${encodeURIComponent(a.address)}`}>{T.addSend}</a>)
              if (readAllowed && a.send && !a.read && a.address) acts.push(<a key="rd" className="pen-mail-read" href={`${GMAIL}?read=1&address=${encodeURIComponent(a.address)}`}>{T.letRead}</a>)
              if (a.cal && (a.send || a.docs)) acts.push(<button key="co" type="button" className="pen-mail-off" onClick={() => run(a, calOff)} disabled={busy !== null}>{T.calOff}</button>)
            }
            return (
              <li key={k} className="pen-gacc-row" data-broken={a.broken}>
                <span className="pen-gacc-avatar" aria-hidden="true">{(a.address ?? 'G').charAt(0).toUpperCase()}</span>
                <span className="pen-gacc-main">
                  <strong className="pen-gacc-addr">{a.address ? <Addr a={a.address} /> : label}</strong>
                  <span className="pen-gacc-chips">
                    {a.send && <span className="pen-gacc-chip"><Icon name="mail" size={14} />{T.chipSend}</span>}
                    {a.read && <span className="pen-gacc-chip"><Icon name="search" size={14} />{T.chipRead}<em>{T.test}</em></span>}
                    {a.cal && <span className="pen-gacc-chip"><Icon name="calendar" size={14} />{T.chipCal}</span>}
                    {a.docs && <a className="pen-gacc-chip" href="#docs"><Icon name="doc" size={14} />{T.chipDocs}</a>}
                  </span>
                  {a.broken ? (
                    <span className="pen-gacc-warn"><Icon name="alert" size={14} />{T.broken}</span>
                  ) : (a.defaultEmail || a.defaultCal) && (
                    <span className="pen-gacc-defs">
                      {a.defaultEmail && <span className="pen-gacc-def"><Icon name="check" size={13} />{T.defEmail}</span>}
                      {a.defaultCal && <span className="pen-gacc-def"><Icon name="check" size={13} />{T.defCal}</span>}
                    </span>
                  )}
                  {acts.length > 0 && <span className="pen-gacc-acts">{acts}</span>}
                  {confirm === k && (
                    <span className="pen-gacc-confirm" role="alertdialog" aria-label={T.disconnectAria(label)}>
                      <span>{T.confirmQ(label, whatLine)}</span>
                      <span className="pen-gacc-confirm-btns">
                        <button type="button" className="pen-btn pen-btn-quiet" onClick={() => run(a, off, { gone: label })} disabled={busy !== null}>{busy === k ? T.working : T.confirmYes}</button>
                        <button type="button" className="pen-btn" onClick={() => setConfirm(null)} disabled={busy !== null}>{T.confirmNo}</button>
                      </span>
                    </span>
                  )}
                </span>
                <span className="pen-gacc-side">
                  {a.broken && <a className="pen-btn pen-btn-accent" href={reconnect}>{T.reconnect}</a>}
                  {confirm !== k && (
                    <button type="button" className="pen-mail-off" onClick={() => setConfirm(k)} disabled={busy !== null} aria-label={T.disconnectAria(label)}>
                      {busy === k ? T.working : T.disconnect}
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="pen-set-lede">{T.none}</p>
      )}

      <div className="pen-set-actions">
        {full ? (
          <p className="pen-set-lede">{T.full}</p>
        ) : (
          <a className={accounts.length ? 'pen-btn' : 'pen-btn pen-btn-accent pen-set-pay'} href={connectHref}>
            <Icon name="plus" size={16} />
            {accounts.length ? T.another : T.connect}
          </a>
        )}
      </div>
      {!full && <p className="pen-set-fine">{gmailOn ? T.how : T.howCalOnly}</p>}
      {gmailOn && senders === 0 && <p className="pen-set-fine pen-gacc-without">{T.without}</p>}

      <details className="pen-conn-more">
        <summary>{T.termsTitle}</summary>
        <dl className="pen-gcal-terms">
          {gmailOn && <div><dt>{T.sendsLabel}</dt><dd>{T.sends}</dd></div>}
          {gmailOn && <div><dt>{T.readsLabel}</dt><dd>{anyRead ? T.readsSome : T.reads}</dd></div>}
          <div><dt>{T.calLabel}</dt><dd>{T.calTerms} {calCount > 1 ? T.severalCals : ''}</dd></div>
        </dl>
        {readAllowed && <p className="pen-set-fine pen-gacc-without">{T.readTest}</p>}
      </details>
    </div>
  )
}
