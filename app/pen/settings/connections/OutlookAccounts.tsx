'use client'

// Settings → Connections → Outlook / Microsoft 365 (21 Oct): one row per connected Microsoft
// address, the same shape as the Google rows (GoogleAccounts.tsx, same classes): what it's
// connected for (Sending / Calendar), which is the default, add what's missing, disconnect.
// Behind it: pen_outlook (lib/pen/outlook.ts). Shown only when outlookAvailable(); before that,
// the page keeps the one-tap-links row.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '../../Icon'
import { useCopy } from '../../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'

export type OAccount = {
  address: string
  send: boolean
  cal: boolean
  /** Juno may read this inbox (team test only; false for everyone else). */
  read: boolean
  defaultEmail: boolean
  defaultCal: boolean
  broken: boolean
  /** A personal Microsoft account (outlook.com, hotmail, live): no Teams links, removed at account.live.com. */
  personal: boolean
}

export type OutlookStatus = { connected: string | null; read?: string | null; cal: string | null; send: string | null; gone: string | null; error: string | null; adminUrl: string | null }

const O_EN = {
  none: 'No Outlook account connected yet.',
  connect: 'Connect an Outlook account',
  another: 'Connect another Outlook account',
  full: 'You have 5 Microsoft addresses connected, the most Juno takes. Disconnect one to add another.',
  how: 'Microsoft asks to send email as you and to see and add events on that account’s calendar. Work accounts, school accounts and outlook.com all work. Juno can’t read your mail.',
  unverified: 'Microsoft may say the app is unverified while our publisher check is pending. Some workplaces also need their IT admin to approve Juno Pen once.',
  chipSend: 'Sending',
  chipCal: 'Calendar',
  chipRead: 'Reading',
  test: 'test',
  letRead: 'Let Juno read this inbox',
  personal: 'personal',
  defEmail: 'Default for email',
  defCal: 'New events go here',
  broken: 'Microsoft stopped accepting Juno’s access. Connect it again.',
  makeDefault: 'Make default for email',
  useForEvents: 'Use for new events',
  addCal: 'Add calendar',
  addSend: 'Send email from it',
  calOff: 'Turn off calendar',
  reconnect: 'Connect again',
  disconnect: 'Disconnect',
  disconnectAria: (a: string) => `Disconnect ${a}`,
  confirmQ: (a: string, what: string) => `Disconnect ${a}? Juno loses ${what}.`,
  confirmYes: 'Disconnect',
  confirmNo: 'Keep it',
  working: 'One moment…',
  whatSend: 'sending',
  whatCal: 'its calendar',
  and: 'and',
  termsTitle: 'What Juno does with Outlook',
  sendsLabel: 'Sends',
  sends: 'Only drafts you’ve seen and told Juno to send, one at a time, from your own address. They land in your Sent Items.',
  readsLabel: 'Reads mail',
  reads: 'Nothing. Juno has no access to your Outlook inbox.',
  readsSome: 'Only when you ask in the chat (search, open a conversation), read-only. Nothing from your inbox is kept.',
  readTest: 'Reading is a test for the team. Juno uses Microsoft’s Mail.Read permission, reads only when you ask in the chat, and keeps nothing from your inbox. To stop, disconnect the address and connect it again without reading.',
  readFlash: 'Juno can read it when you ask in the chat.',
  readDenied: 'Reading wasn’t allowed on Microsoft’s screen, so Juno can still only send from it.',
  calLabel: 'Calendar',
  calTerms: 'Adds only events you ask for or say yes to in the chat; a video link on Outlook is Teams. Reads your next days for briefs and “what’s on tomorrow?”, together with your Google calendars; a meeting on two of them counts once. Nothing from your calendar is stored.',
  removeLabel: 'Removing access',
  remove: 'Disconnecting deletes Juno’s access right away. To also remove Juno Pen from your Microsoft account:',
  removePersonal: 'personal accounts',
  removeWork: 'work or school accounts',
  justConnected: (a: string) => `${a} is connected.`,
  sendReady: 'Drafts can go out from it now.',
  calFlashOn: 'Its calendar is read with your others.',
  calFlashFull: 'Its calendar wasn’t added: you already have 5 calendars connected.',
  gone: (a: string) => `${a} is disconnected. Emails already sent and events already added stay where they are.`,
  adminTitle: 'Your organization’s IT admin needs to approve Juno Pen',
  adminBody: 'Your workplace lets only its IT admin approve new apps for Microsoft 365, so nothing was connected. Send them this link; once they approve, connect again.',
  copyLink: 'Copy link',
  copied: 'Copied',
  errors: {
    cancelled: 'You cancelled on Microsoft’s screen, so nothing was connected.',
    state: 'That connection attempt expired. Try again.',
    setup: 'Outlook isn’t available yet. Try again soon.',
    readonly: 'Your plan has ended, so your account is read-only. Reactivate it in Billing to connect Outlook.',
    not_granted: 'Microsoft didn’t give Juno the permissions it asked for, so nothing was connected.',
    too_many: 'You can connect up to 5 Microsoft addresses. Disconnect one first.',
    cal_full: 'You already have 5 calendars connected. Disconnect one first.',
    failed: 'Microsoft didn’t accept the connection. Try again.',
  } as Record<string, string>,
  failed: 'That didn’t go through. Try again.',
}

const O: Copy<typeof O_EN> = {
  en: O_EN,
  es: {
    none: 'Todavía no hay ninguna cuenta de Outlook conectada.',
    connect: 'Conectar una cuenta de Outlook',
    another: 'Conectar otra cuenta de Outlook',
    full: 'Tienes 5 direcciones de Microsoft conectadas, el máximo que acepta Juno. Desconecta una para agregar otra.',
    how: 'Microsoft pide enviar correos en tu nombre y ver y agregar eventos en el calendario de esa cuenta. Funcionan las cuentas del trabajo, de la universidad y outlook.com. Juno no puede leer tu correo.',
    unverified: 'Puede que Microsoft diga que la app no está verificada mientras termina nuestra verificación de editor. Algunos trabajos además necesitan que su administrador de TI apruebe Juno Pen una vez.',
    chipSend: 'Envío',
    chipCal: 'Calendario',
    chipRead: 'Lectura',
    test: 'prueba',
    letRead: 'Dejar que Juno lea esta bandeja',
    personal: 'personal',
    defEmail: 'Predeterminada para correo',
    defCal: 'Los eventos nuevos van aquí',
    broken: 'Microsoft dejó de aceptar el acceso de Juno. Conéctala de nuevo.',
    makeDefault: 'Hacer predeterminada para correo',
    useForEvents: 'Usar para eventos nuevos',
    addCal: 'Agregar calendario',
    addSend: 'Enviar correos desde ella',
    calOff: 'Desactivar calendario',
    reconnect: 'Conectar de nuevo',
    disconnect: 'Desconectar',
    disconnectAria: (a) => `Desconectar ${a}`,
    confirmQ: (a, what) => `¿Desconectar ${a}? Juno pierde ${what}.`,
    confirmYes: 'Desconectar',
    confirmNo: 'Mantener',
    working: 'Un momento…',
    whatSend: 'el envío',
    whatCal: 'su calendario',
    and: 'y',
    termsTitle: 'Qué hace Juno con Outlook',
    sendsLabel: 'Envía',
    sends: 'Solo los borradores que viste y le dijiste a Juno que envíe, uno a la vez, desde tu propia dirección. Quedan en tus Elementos enviados.',
    readsLabel: 'Lee correo',
    reads: 'Nada. Juno no tiene acceso a tu bandeja de Outlook.',
    readsSome: 'Solo cuando se lo pides en el chat (buscar, abrir una conversación), en modo solo lectura. No se guarda nada de tu bandeja.',
    readTest: 'La lectura es una prueba para el equipo. Juno usa el permiso Mail.Read de Microsoft, lee solo cuando se lo pides en el chat y no guarda nada de tu bandeja. Para detenerlo, desconecta la dirección y conéctala de nuevo sin lectura.',
    readFlash: 'Juno puede leerla cuando se lo pides en el chat.',
    readDenied: 'No se permitió la lectura en la pantalla de Microsoft, así que Juno solo puede enviar desde ella.',
    calLabel: 'Calendario',
    calTerms: 'Agrega solo los eventos que pides o apruebas en el chat; el link de video en Outlook es de Teams. Lee tus próximos días para los resúmenes y “¿qué tengo mañana?”, junto con tus calendarios de Google; una reunión que está en dos cuenta una vez. No se guarda nada de tu calendario.',
    removeLabel: 'Quitar el acceso',
    remove: 'Al desconectar, Juno borra su acceso de inmediato. Para quitar también Juno Pen de tu cuenta de Microsoft:',
    removePersonal: 'cuentas personales',
    removeWork: 'cuentas del trabajo o la universidad',
    justConnected: (a) => `${a} quedó conectada.`,
    sendReady: 'Los borradores ya pueden salir desde ahí.',
    calFlashOn: 'Su calendario se lee junto con los demás.',
    calFlashFull: 'Su calendario no se agregó: ya tienes 5 calendarios conectados.',
    gone: (a) => `${a} quedó desconectada. Los correos ya enviados y los eventos ya agregados se quedan donde están.`,
    adminTitle: 'El administrador de TI de tu organización tiene que aprobar Juno Pen',
    adminBody: 'Tu trabajo solo deja que su administrador de TI apruebe apps nuevas para Microsoft 365, así que no se conectó nada. Envíale este link; cuando apruebe, conéctala de nuevo.',
    copyLink: 'Copiar link',
    copied: 'Copiado',
    errors: {
      cancelled: 'Cancelaste en la pantalla de Microsoft, así que no se conectó nada.',
      state: 'Ese intento de conexión expiró. Inténtalo de nuevo.',
      setup: 'Outlook aún no está disponible. Inténtalo pronto.',
      readonly: 'Tu plan terminó, así que tu cuenta es solo de lectura. Reactívala en Facturación para conectar Outlook.',
      not_granted: 'Microsoft no le dio a Juno los permisos que pidió, así que no se conectó nada.',
      too_many: 'Puedes conectar hasta 5 direcciones de Microsoft. Primero desconecta una.',
      cal_full: 'Ya tienes 5 calendarios conectados. Primero desconecta uno.',
      failed: 'Microsoft no aceptó la conexión. Inténtalo de nuevo.',
    },
    failed: 'No se pudo completar. Inténtalo de nuevo.',
  },
  pt: {
    none: 'Nenhuma conta do Outlook conectada ainda.',
    connect: 'Conectar uma conta do Outlook',
    another: 'Conectar outra conta do Outlook',
    full: 'Você tem 5 endereços da Microsoft conectados, o máximo que o Juno aceita. Desconecte um para adicionar outro.',
    how: 'A Microsoft pede para enviar e-mails em seu nome e para ver e adicionar eventos na agenda dessa conta. Contas do trabalho, da faculdade e do outlook.com funcionam. O Juno não consegue ler seus e-mails.',
    unverified: 'A Microsoft pode dizer que o app não é verificado enquanto nossa verificação de editor não termina. Alguns trabalhos também precisam que o administrador de TI aprove o Juno Pen uma vez.',
    chipSend: 'Envio',
    chipCal: 'Agenda',
    chipRead: 'Leitura',
    test: 'teste',
    letRead: 'Deixar o Juno ler esta caixa',
    personal: 'pessoal',
    defEmail: 'Padrão para e-mail',
    defCal: 'Os eventos novos vão para cá',
    broken: 'A Microsoft parou de aceitar o acesso do Juno. Conecte de novo.',
    makeDefault: 'Tornar padrão para e-mail',
    useForEvents: 'Usar para eventos novos',
    addCal: 'Adicionar agenda',
    addSend: 'Enviar e-mails dele',
    calOff: 'Desativar agenda',
    reconnect: 'Conectar de novo',
    disconnect: 'Desconectar',
    disconnectAria: (a) => `Desconectar ${a}`,
    confirmQ: (a, what) => `Desconectar ${a}? O Juno perde ${what}.`,
    confirmYes: 'Desconectar',
    confirmNo: 'Manter',
    working: 'Um momento…',
    whatSend: 'o envio',
    whatCal: 'a agenda',
    and: 'e',
    termsTitle: 'O que o Juno faz com o Outlook',
    sendsLabel: 'Envia',
    sends: 'Só os rascunhos que você viu e mandou o Juno enviar, um de cada vez, do seu próprio endereço. Ficam nos seus Itens enviados.',
    readsLabel: 'Lê e-mail',
    reads: 'Nada. O Juno não tem acesso à sua caixa do Outlook.',
    readsSome: 'Só quando você pede no chat (buscar, abrir uma conversa), somente leitura. Nada da sua caixa é guardado.',
    readTest: 'A leitura é um teste para a equipe. O Juno usa a permissão Mail.Read da Microsoft, lê só quando você pede no chat e não guarda nada da sua caixa. Para parar, desconecte o endereço e conecte de novo sem leitura.',
    readFlash: 'O Juno pode ler quando você pede no chat.',
    readDenied: 'A leitura não foi permitida na tela da Microsoft, então o Juno só consegue enviar dele.',
    calLabel: 'Agenda',
    calTerms: 'Adiciona só os eventos que você pede ou aprova no chat; o link de vídeo no Outlook é do Teams. Lê os seus próximos dias para os resumos e “o que tenho amanhã?”, junto com as suas agendas do Google; uma reunião que está em duas conta uma vez. Nada da sua agenda fica guardado.',
    removeLabel: 'Remover o acesso',
    remove: 'Ao desconectar, o Juno apaga o acesso na hora. Para remover também o Juno Pen da sua conta Microsoft:',
    removePersonal: 'contas pessoais',
    removeWork: 'contas do trabalho ou da faculdade',
    justConnected: (a) => `${a} está conectado.`,
    sendReady: 'Os rascunhos já podem sair dele.',
    calFlashOn: 'A agenda dele é lida junto com as outras.',
    calFlashFull: 'A agenda dele não foi adicionada: você já tem 5 agendas conectadas.',
    gone: (a) => `${a} foi desconectado. Os e-mails já enviados e os eventos já adicionados continuam onde estão.`,
    adminTitle: 'O administrador de TI da sua organização precisa aprovar o Juno Pen',
    adminBody: 'O seu trabalho só deixa o administrador de TI aprovar apps novos para o Microsoft 365, então nada foi conectado. Envie este link para ele; depois da aprovação, conecte de novo.',
    copyLink: 'Copiar link',
    copied: 'Copiado',
    errors: {
      cancelled: 'Você cancelou na tela da Microsoft, então nada foi conectado.',
      state: 'Essa tentativa de conexão expirou. Tente de novo.',
      setup: 'O Outlook ainda não está disponível. Tente novamente em breve.',
      readonly: 'Seu plano terminou, então sua conta é somente leitura. Reative em Cobrança para conectar o Outlook.',
      not_granted: 'A Microsoft não deu ao Juno as permissões que ele pediu, então nada foi conectado.',
      too_many: 'Você pode conectar até 5 endereços da Microsoft. Desconecte um primeiro.',
      cal_full: 'Você já tem 5 agendas conectadas. Desconecte uma primeiro.',
      failed: 'A Microsoft não aceitou a conexão. Tente de novo.',
    },
    failed: 'Não deu certo. Tente de novo.',
  },
}

const CONNECT = '/api/pen/outlook/connect'
const REMOVE = { personal: 'https://account.live.com/consent/Manage', work: 'https://myapps.microsoft.com' }

const Addr = ({ a }: { a: string }) => <>{a.split('@')[0]}@<wbr />{a.split('@').slice(1).join('@')}</>

const post = async (path: string, body: Record<string, string>) => {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(String(r.status))
}

export default function OutlookAccounts({ accounts, calCount, senders, readAllowed = false, status }: {
  accounts: OAccount[]
  /** On the reading test: "Let Juno read this inbox" shows on sending addresses that don't read yet. */
  readAllowed?: boolean
  /** Calendars connected in all, Google and Microsoft (the cap of 5 is shared). */
  calCount: number
  /** Sending addresses in all, Gmail and Outlook (one default across both). */
  senders: number
  status: OutlookStatus
}) {
  const T = useCopy(O)
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const adminErr = status.error === 'admin_consent'
  const [err, setErr] = useState<string | null>(status.error && !adminErr ? T.errors[status.error] ?? T.errors.failed : null)

  function stay(q?: Record<string, string>) {
    const qs = q ? `?${new URLSearchParams({ p: 'outlook', ...q })}` : ''
    router.replace(`${window.location.pathname}${qs}#outlook`, { scroll: false })
    router.refresh()
  }
  async function run(a: OAccount, steps: [string, Record<string, string>][], after?: Record<string, string>) {
    setBusy(a.address); setErr(null)
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
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const t = document.createElement('textarea')
      t.value = text
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const full = accounts.length >= 5
  const flash = (() => {
    if (status.gone) return T.gone(status.gone)
    if (!status.connected) return null
    const acc = accounts.find((x) => x.address === status.connected!.toLowerCase())
    if (!acc) return null
    const parts = [T.justConnected(acc.address)]
    if (acc.send) parts.push(status.read === 'on' ? T.readFlash : T.sendReady)
    if (status.read === 'denied') parts.push(T.readDenied)
    if (status.cal === 'on') parts.push(T.calFlashOn)
    else if (status.cal === 'full') parts.push(T.calFlashFull)
    return parts.join(' ')
  })()

  return (
    <div className="pen-gacc">
      {flash && <div className="pen-set-ok" role="status">{flash}</div>}
      {err && <div className="pen-su-err" role="alert">{err}</div>}
      {adminErr && status.adminUrl && (
        <div className="pen-oacc-admin" role="alert">
          <strong>{T.adminTitle}</strong>
          <p>{T.adminBody}</p>
          <span className="pen-oacc-admin-link">
            <code>{status.adminUrl}</code>
            <button type="button" className="pen-btn" onClick={() => copy(status.adminUrl!)}>
              <Icon name={copied ? 'check' : 'link'} size={15} />
              {copied ? T.copied : T.copyLink}
            </button>
          </span>
        </div>
      )}

      {accounts.length > 0 ? (
        <ul className="pen-gacc-list">
          {accounts.map((a) => {
            const what = [a.send && T.whatSend, a.cal && T.whatCal].filter(Boolean) as string[]
            const whatLine = what.length > 1 ? `${what[0]} ${T.and} ${what[1]}` : what[0] ?? ''
            const enc = encodeURIComponent(a.address)
            const acts: React.ReactNode[] = []
            if (!a.broken) {
              if (a.send && !a.defaultEmail && senders > 1) acts.push(<button key="de" type="button" className="pen-mail-off" onClick={() => run(a, [['/api/pen/outlook/default', { address: a.address }]])} disabled={busy !== null}>{T.makeDefault}</button>)
              if (a.cal && !a.defaultCal && calCount > 1) acts.push(<button key="dc" type="button" className="pen-mail-off" onClick={() => run(a, [['/api/pen/calendars/default', { key: a.address }]])} disabled={busy !== null}>{T.useForEvents}</button>)
              if (!a.cal && calCount < 5) acts.push(<a key="ac" className="pen-mail-read" href={`${CONNECT}?address=${enc}&add=cal`}>{T.addCal}</a>)
              if (!a.send) acts.push(<a key="as" className="pen-mail-read" href={`${CONNECT}?address=${enc}&add=send`}>{T.addSend}</a>)
              if (readAllowed && a.send && !a.read) acts.push(<a key="rd" className="pen-mail-read" href={`${CONNECT}?address=${enc}&add=read`}>{T.letRead}</a>)
              if (a.cal && a.send) acts.push(<button key="co" type="button" className="pen-mail-off" onClick={() => run(a, [['/api/pen/outlook/calendar-off', { address: a.address }]])} disabled={busy !== null}>{T.calOff}</button>)
            }
            return (
              <li key={a.address} className="pen-gacc-row" data-broken={a.broken}>
                <span className="pen-gacc-avatar" data-ms aria-hidden="true">{a.address.charAt(0).toUpperCase()}</span>
                <span className="pen-gacc-main">
                  <strong className="pen-gacc-addr"><Addr a={a.address} /></strong>
                  <span className="pen-gacc-chips">
                    {a.send && <span className="pen-gacc-chip"><Icon name="mail" size={14} />{T.chipSend}</span>}
                    {a.cal && <span className="pen-gacc-chip"><Icon name="calendar" size={14} />{T.chipCal}</span>}
                    {a.read && <span className="pen-gacc-chip"><Icon name="search" size={14} />{T.chipRead}<em>{T.test}</em></span>}
                    {a.personal && <span className="pen-gacc-chip pen-gacc-chip-quiet">{T.personal}</span>}
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
                  {confirm === a.address && (
                    <span className="pen-gacc-confirm" role="alertdialog" aria-label={T.disconnectAria(a.address)}>
                      <span>{T.confirmQ(a.address, whatLine)}</span>
                      <span className="pen-gacc-confirm-btns">
                        <button type="button" className="pen-btn pen-btn-quiet" onClick={() => run(a, [['/api/pen/outlook/disconnect', { address: a.address }]], { gone: a.address })} disabled={busy !== null}>{busy === a.address ? T.working : T.confirmYes}</button>
                        <button type="button" className="pen-btn" onClick={() => setConfirm(null)} disabled={busy !== null}>{T.confirmNo}</button>
                      </span>
                    </span>
                  )}
                </span>
                <span className="pen-gacc-side">
                  {a.broken && <a className="pen-btn pen-btn-accent" href={`${CONNECT}?address=${enc}`}>{T.reconnect}</a>}
                  {confirm !== a.address && (
                    <button type="button" className="pen-mail-off" onClick={() => setConfirm(a.address)} disabled={busy !== null} aria-label={T.disconnectAria(a.address)}>
                      {busy === a.address ? T.working : T.disconnect}
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
          <a className={accounts.length ? 'pen-btn' : 'pen-btn pen-btn-accent pen-set-pay'} href={CONNECT}>
            <Icon name="plus" size={16} />
            {accounts.length ? T.another : T.connect}
          </a>
        )}
      </div>
      {!full && <p className="pen-set-fine">{T.how}</p>}
      {!full && accounts.length === 0 && <p className="pen-set-fine pen-gacc-without">{T.unverified}</p>}

      <details className="pen-conn-more">
        <summary>{T.termsTitle}</summary>
        <dl className="pen-gcal-terms">
          <div><dt>{T.sendsLabel}</dt><dd>{T.sends}</dd></div>
          <div><dt>{T.readsLabel}</dt><dd>{accounts.some((x) => x.read) ? T.readsSome : T.reads}</dd></div>
          <div><dt>{T.calLabel}</dt><dd>{T.calTerms}</dd></div>
          <div>
            <dt>{T.removeLabel}</dt>
            <dd>
              {T.remove}{' '}
              <a href={REMOVE.personal} target="_blank" rel="noreferrer">account.live.com</a> ({T.removePersonal}) ·{' '}
              <a href={REMOVE.work} target="_blank" rel="noreferrer">myapps.microsoft.com</a> ({T.removeWork})
            </dd>
          </div>
        </dl>
        {readAllowed && <p className="pen-set-fine pen-gacc-without">{T.readTest}</p>}
      </details>
    </div>
  )
}
