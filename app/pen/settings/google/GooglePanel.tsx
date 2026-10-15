'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '../../Icon'
import { useCopy } from '../../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'
import type { GcalConnection, GoogleWant } from '@/lib/pen/google-calendar'

const CP_EN = {
  title: 'Google Calendar',
  lede: 'Juno adds only events you approve, and reads your next 7 days to brief you before meetings.',
  connect: 'Connect Google Calendar',
  reconnect: 'Connect again',
  how: 'Google asks for one permission: to see and add events on calendars you own. You can take it back here at any time.',
  connectedAs: 'Connected as',
  connectedNoEmail: 'Connected',
  addsLabel: 'Adds',
  adds: 'Only events you say yes to in the chat. A meeting heard in a recording always comes as a question first.',
  readsLabel: 'Reads',
  reads: 'Your next 7 days, when a brief is due. Nothing from your calendar is stored.',
  disconnect: 'Disconnect',
  disconnecting: 'Disconnecting…',
  disconnectNote: 'Disconnecting revokes Juno’s access at Google and deletes the calendar data Juno kept. Events already on your calendar stay there.',
  calPartialNote: 'Disconnecting stops Juno reading and adding events and deletes the calendar data it kept. Events already on your calendar stay there.',
  justConnected: 'Google Calendar is connected. Meetings you approve will go straight onto it.',
  justDisconnected: 'Disconnected. Juno’s access is revoked and its calendar data deleted.',
  notSetUp: 'Google isn’t available yet. Try again soon.',
  both: 'Connect Calendar and Docs & Sheets together',
  driveTitle: 'Google Docs & Sheets',
  driveLede: 'Juno puts what you ask for into your Drive: a recording’s notes or a plan as a Google Doc, your to-dos or contacts as a Google Sheet.',
  driveConnect: 'Connect Google Docs & Sheets',
  driveHow: 'Google asks for one permission: to create files in your Drive and open only the ones Juno made. Juno can’t see anything else there.',
  makesLabel: 'Makes',
  makes: 'Only the Docs and Sheets you ask for, in a “Juno Pen” folder in your Drive.',
  opensLabel: 'Opens',
  opens: 'Only the files Juno made. Nothing else in your Drive is visible to Juno.',
  driveDisconnectNote: 'Disconnecting stops Juno making files. The Docs and Sheets it already made stay in your Drive, and they’re yours.',
  driveJustConnected: 'Google Docs & Sheets is connected. Use “Send to Google Docs” on a recording, or export your to-dos or contacts.',
  driveJustDisconnected: 'Disconnected. Juno won’t make files in your Drive anymore.',
  bothJustConnected: 'Google is connected: Calendar, and Docs & Sheets.',
  shared: 'Both use one Google permission, so Google keeps it until you disconnect the other one too.',
  errors: {
    cancelled: 'You cancelled on Google’s screen, so nothing was connected.',
    state: 'That connection attempt expired. Try again.',
    setup: 'Google isn’t available yet. Try again soon.',
    readonly: 'Your plan has ended, so your account is read-only. Reactivate it in Billing to connect Google.',
  } as Record<string, string>,
  failed: 'That didn’t go through. Try again.',
}

const CP: Copy<typeof CP_EN> = {
  en: CP_EN,
  es: {
    title: 'Google Calendar',
    lede: 'Juno agrega solo los eventos que tú apruebas y lee tus próximos 7 días para prepararte antes de las reuniones.',
    connect: 'Conectar Google Calendar',
    reconnect: 'Conectar de nuevo',
    how: 'Google pide un solo permiso: ver y agregar eventos en los calendarios que son tuyos. Puedes quitarlo aquí cuando quieras.',
    connectedAs: 'Conectado como',
    connectedNoEmail: 'Conectado',
    addsLabel: 'Agrega',
    adds: 'Solo los eventos a los que dices que sí en el chat. Una reunión que se escucha en una grabación siempre llega primero como pregunta.',
    readsLabel: 'Lee',
    reads: 'Tus próximos 7 días, cuando toca un resumen. No se guarda nada de tu calendario.',
    disconnect: 'Desconectar',
    disconnecting: 'Desconectando…',
    disconnectNote: 'Al desconectar se revoca el acceso de Juno en Google y se borran los datos de calendario que Juno guardó. Los eventos que ya están en tu calendario se quedan.',
    calPartialNote: 'Al desconectar, Juno deja de leer y agregar eventos y borra los datos de calendario que guardó. Los eventos que ya están en tu calendario se quedan.',
    justConnected: 'Google Calendar está conectado. Las reuniones que apruebes irán directo ahí.',
    justDisconnected: 'Desconectado. Se revocó el acceso de Juno y se borraron sus datos de calendario.',
    notSetUp: 'Google aún no está disponible. Inténtalo pronto.',
    both: 'Conectar Calendar y Docs y Sheets juntos',
    driveTitle: 'Google Docs y Sheets',
    driveLede: 'Juno deja en tu Drive lo que le pidas: las notas de una grabación o un plan como Google Doc, tus pendientes o contactos como Google Sheet.',
    driveConnect: 'Conectar Google Docs y Sheets',
    driveHow: 'Google pide un solo permiso: crear archivos en tu Drive y abrir solo los que hizo Juno. Juno no puede ver nada más ahí.',
    makesLabel: 'Crea',
    makes: 'Solo los Docs y Sheets que pidas, en una carpeta “Juno Pen” de tu Drive.',
    opensLabel: 'Abre',
    opens: 'Solo los archivos que hizo Juno. Nada más de tu Drive es visible para Juno.',
    driveDisconnectNote: 'Al desconectar, Juno deja de crear archivos. Los Docs y Sheets que ya hizo se quedan en tu Drive y son tuyos.',
    driveJustConnected: 'Google Docs y Sheets está conectado. Usa “Enviar a Google Docs” en una grabación, o exporta tus pendientes o contactos.',
    driveJustDisconnected: 'Desconectado. Juno ya no creará archivos en tu Drive.',
    bothJustConnected: 'Google está conectado: Calendar, y Docs y Sheets.',
    shared: 'Los dos usan un mismo permiso de Google, así que Google lo mantiene hasta que desconectes el otro también.',
    errors: {
      cancelled: 'Cancelaste en la pantalla de Google, así que no se conectó nada.',
      state: 'Ese intento de conexión expiró. Inténtalo de nuevo.',
      setup: 'Google aún no está disponible. Inténtalo pronto.',
      readonly: 'Tu plan terminó, así que tu cuenta es solo de lectura. Reactívala en Facturación para conectar Google.',
    },
    failed: 'No se pudo completar. Inténtalo de nuevo.',
  },
  pt: {
    title: 'Google Agenda',
    lede: 'O Juno adiciona só os eventos que você aprova e lê os seus próximos 7 dias para te preparar antes das reuniões.',
    connect: 'Conectar o Google Agenda',
    reconnect: 'Conectar de novo',
    how: 'O Google pede uma única permissão: ver e adicionar eventos nas agendas que são suas. Você pode tirar essa permissão aqui quando quiser.',
    connectedAs: 'Conectado como',
    connectedNoEmail: 'Conectado',
    addsLabel: 'Adiciona',
    adds: 'Só os eventos para os quais você diz sim no chat. Uma reunião ouvida numa gravação sempre chega antes como pergunta.',
    readsLabel: 'Lê',
    reads: 'Os seus próximos 7 dias, quando um resumo está para sair. Nada da sua agenda fica guardado.',
    disconnect: 'Desconectar',
    disconnecting: 'Desconectando…',
    disconnectNote: 'Ao desconectar, o acesso do Juno é revogado no Google e os dados de agenda que o Juno guardou são apagados. Os eventos que já estão na sua agenda continuam lá.',
    calPartialNote: 'Ao desconectar, o Juno para de ler e adicionar eventos e apaga os dados de agenda que guardou. Os eventos que já estão na sua agenda continuam lá.',
    justConnected: 'O Google Agenda está conectado. As reuniões que você aprovar vão direto para lá.',
    justDisconnected: 'Desconectado. O acesso do Juno foi revogado e os dados de agenda apagados.',
    notSetUp: 'O Google ainda não está disponível. Tente novamente em breve.',
    both: 'Conectar Agenda e Docs e Planilhas juntos',
    driveTitle: 'Google Docs e Planilhas',
    driveLede: 'O Juno coloca no seu Drive o que você pedir: as notas de uma gravação ou um plano como Google Doc, suas tarefas ou contatos como Planilha Google.',
    driveConnect: 'Conectar Google Docs e Planilhas',
    driveHow: 'O Google pede uma única permissão: criar arquivos no seu Drive e abrir só os que o Juno criou. O Juno não vê mais nada lá.',
    makesLabel: 'Cria',
    makes: 'Só os Docs e Planilhas que você pedir, numa pasta “Juno Pen” do seu Drive.',
    opensLabel: 'Abre',
    opens: 'Só os arquivos que o Juno criou. Nada mais do seu Drive fica visível para o Juno.',
    driveDisconnectNote: 'Ao desconectar, o Juno para de criar arquivos. Os Docs e Planilhas que ele já criou continuam no seu Drive e são seus.',
    driveJustConnected: 'Google Docs e Planilhas está conectado. Use “Enviar ao Google Docs” numa gravação, ou exporte suas tarefas ou contatos.',
    driveJustDisconnected: 'Desconectado. O Juno não vai mais criar arquivos no seu Drive.',
    bothJustConnected: 'O Google está conectado: Agenda, e Docs e Planilhas.',
    shared: 'Os dois usam uma mesma permissão do Google, então o Google a mantém até você desconectar o outro também.',
    errors: {
      cancelled: 'Você cancelou na tela do Google, então nada foi conectado.',
      state: 'Essa tentativa de conexão expirou. Tente de novo.',
      setup: 'O Google ainda não está disponível. Tente novamente em breve.',
      readonly: 'Seu plano terminou, então sua conta é somente leitura. Reative em Cobrança para conectar o Google.',
    },
    failed: 'Não deu certo. Tente de novo.',
  },
}

const CONNECT = '/api/pen/google-calendar/connect'

function Account({ conn, T, icon }: { conn: GcalConnection; T: typeof CP_EN; icon: 'calendar' | 'doc' }) {
  return (
    <div className="pen-gcal-account">
      <span className="pen-gcal-mark" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="pen-gcal-who">
        <span>{conn.calendar_email ? T.connectedAs : T.connectedNoEmail}</span>
        {conn.calendar_email && <strong>{conn.calendar_email.split('@')[0]}@<wbr />{conn.calendar_email.split('@').slice(1).join('@')}</strong>}
      </span>
    </div>
  )
}

export default function GooglePanel({ configured, conn, on, justConnected, justDisconnected, error }: {
  configured: boolean
  conn: GcalConnection | null
  on: { calendar: boolean; drive: boolean }
  justConnected: GoogleWant | null
  justDisconnected: 'gcal' | 'drive' | null
  error: string | null
}) {
  const T = useCopy(CP)
  const router = useRouter()
  const [busy, setBusy] = useState<'gcal' | 'drive' | null>(null)
  const [err, setErr] = useState<string | null>(error ? T.errors[error] ?? decodeURIComponent(error) : null)
  const live = Boolean(conn && !conn.last_error)

  async function disconnect(what: 'gcal' | 'drive') {
    setBusy(what); setErr(null)
    try {
      const r = await fetch('/api/pen/google-calendar/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ what }) })
      if (!r.ok) throw new Error(T.failed)
      router.replace(`/pen/settings/google?disconnected=${what}`)
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(null)
    }
  }

  const flash =
    justConnected && live
      ? justConnected === 'both' && on.calendar && on.drive ? T.bothJustConnected : justConnected === 'drive' && on.drive ? T.driveJustConnected : justConnected === 'gcal' && on.calendar ? T.justConnected : null
      : justDisconnected === 'gcal' && !on.calendar ? T.justDisconnected : justDisconnected === 'drive' && !on.drive ? T.driveJustDisconnected : null

  if (!configured) {
    return (
      <div className="pen-set-stack">
        <div className="pen-set-card"><p className="pen-set-lede">{T.notSetUp}</p></div>
      </div>
    )
  }

  return (
    <div className="pen-set-stack">
      {flash && <div className="pen-set-ok" role="status">{flash}</div>}
      {err && <div className="pen-su-err">{err}</div>}
      {conn?.last_error && <div className="pen-su-err">{conn.last_error}</div>}

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.title}</h2>
          <p className="pen-set-lede">{T.lede}</p>
        </div>
        {conn && on.calendar ? (
          <>
            <Account conn={conn} T={T} icon="calendar" />
            <dl className="pen-gcal-terms">
              <div><dt>{T.addsLabel}</dt><dd>{T.adds}</dd></div>
              <div><dt>{T.readsLabel}</dt><dd>{T.reads}</dd></div>
            </dl>
            <div className="pen-set-actions">
              {conn.last_error && <a className="pen-btn pen-btn-accent" href={`${CONNECT}?want=gcal`}>{T.reconnect}</a>}
              <button type="button" className="pen-btn" onClick={() => disconnect('gcal')} disabled={busy !== null}>{busy === 'gcal' ? T.disconnecting : T.disconnect}</button>
            </div>
            <p className="pen-set-fine">{on.drive ? `${T.calPartialNote} ${T.shared}` : T.disconnectNote}</p>
          </>
        ) : (
          <>
            <div className="pen-set-actions">
              <a className="pen-btn pen-btn-accent pen-set-pay" href={`${CONNECT}?want=gcal`}>{T.connect}</a>
            </div>
            <p className="pen-set-fine">{T.how}</p>
          </>
        )}
      </div>

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.driveTitle}</h2>
          <p className="pen-set-lede">{T.driveLede}</p>
        </div>
        {conn && on.drive ? (
          <>
            <Account conn={conn} T={T} icon="doc" />
            <dl className="pen-gcal-terms">
              <div><dt>{T.makesLabel}</dt><dd>{T.makes}</dd></div>
              <div><dt>{T.opensLabel}</dt><dd>{T.opens}</dd></div>
            </dl>
            <div className="pen-set-actions">
              {conn.last_error && <a className="pen-btn pen-btn-accent" href={`${CONNECT}?want=drive`}>{T.reconnect}</a>}
              <button type="button" className="pen-btn" onClick={() => disconnect('drive')} disabled={busy !== null}>{busy === 'drive' ? T.disconnecting : T.disconnect}</button>
            </div>
            <p className="pen-set-fine">{on.calendar ? `${T.driveDisconnectNote} ${T.shared}` : T.driveDisconnectNote}</p>
          </>
        ) : (
          <>
            <div className="pen-set-actions">
              <a className="pen-btn pen-btn-accent pen-set-pay" href={`${CONNECT}?want=drive`}>{T.driveConnect}</a>
              {!conn && <a className="pen-notion-sent" href={`${CONNECT}?want=both`}>{T.both}</a>}
            </div>
            <p className="pen-set-fine">{T.driveHow}</p>
          </>
        )}
      </div>
    </div>
  )
}
