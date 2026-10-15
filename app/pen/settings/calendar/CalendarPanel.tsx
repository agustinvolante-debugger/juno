'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '../../Icon'
import { useCopy } from '../../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'
import type { GcalConnection } from '@/lib/pen/google-calendar'

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
  justConnected: 'Google Calendar is connected. Meetings you approve will go straight onto it.',
  justDisconnected: 'Disconnected. Juno’s access is revoked and its calendar data deleted.',
  notSetUp: 'Google Calendar isn’t available yet. Try again soon.',
  errors: {
    cancelled: 'You cancelled on Google’s screen, so nothing was connected.',
    state: 'That connection attempt expired. Try again.',
    setup: 'Google Calendar isn’t available yet. Try again soon.',
    readonly: 'Your plan has ended, so your account is read-only. Reactivate it in Billing to connect a calendar.',
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
    justConnected: 'Google Calendar está conectado. Las reuniones que apruebes irán directo ahí.',
    justDisconnected: 'Desconectado. Se revocó el acceso de Juno y se borraron sus datos de calendario.',
    notSetUp: 'Google Calendar aún no está disponible. Inténtalo pronto.',
    errors: {
      cancelled: 'Cancelaste en la pantalla de Google, así que no se conectó nada.',
      state: 'Ese intento de conexión expiró. Inténtalo de nuevo.',
      setup: 'Google Calendar aún no está disponible. Inténtalo pronto.',
      readonly: 'Tu plan terminó, así que tu cuenta es solo de lectura. Reactívala en Facturación para conectar un calendario.',
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
    justConnected: 'O Google Agenda está conectado. As reuniões que você aprovar vão direto para lá.',
    justDisconnected: 'Desconectado. O acesso do Juno foi revogado e os dados de agenda apagados.',
    notSetUp: 'O Google Agenda ainda não está disponível. Tente novamente em breve.',
    errors: {
      cancelled: 'Você cancelou na tela do Google, então nada foi conectado.',
      state: 'Essa tentativa de conexão expirou. Tente de novo.',
      setup: 'O Google Agenda ainda não está disponível. Tente novamente em breve.',
      readonly: 'Seu plano terminou, então sua conta é somente leitura. Reative em Cobrança para conectar uma agenda.',
    },
    failed: 'Não deu certo. Tente de novo.',
  },
}

export default function CalendarPanel({ configured, conn, justConnected, justDisconnected, error }: { configured: boolean; conn: GcalConnection | null; justConnected: boolean; justDisconnected: boolean; error: string | null }) {
  const T = useCopy(CP)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(error ? T.errors[error] ?? decodeURIComponent(error) : null)

  async function disconnect() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/pen/google-calendar/disconnect', { method: 'POST' })
      if (!r.ok) throw new Error(T.failed)
      router.replace('/pen/settings/calendar?disconnected=1')
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.title}</h2>
          <p className="pen-set-lede">{T.lede}</p>
        </div>
        {justConnected && conn && !conn.last_error && <div className="pen-set-ok" role="status">{T.justConnected}</div>}
        {justDisconnected && !conn && <div className="pen-set-ok" role="status">{T.justDisconnected}</div>}
        {err && <div className="pen-su-err">{err}</div>}
        {conn?.last_error && <div className="pen-su-err">{conn.last_error}</div>}

        {!configured ? (
          <p className="pen-set-lede">{T.notSetUp}</p>
        ) : conn ? (
          <>
            <div className="pen-gcal-account">
              <span className="pen-gcal-mark" aria-hidden="true"><Icon name="calendar" size={20} /></span>
              <span className="pen-gcal-who">
                <span>{conn.calendar_email ? T.connectedAs : T.connectedNoEmail}</span>
                {conn.calendar_email && <strong>{conn.calendar_email.split('@')[0]}@<wbr />{conn.calendar_email.split('@').slice(1).join('@')}</strong>}
              </span>
            </div>
            <dl className="pen-gcal-terms">
              <div><dt>{T.addsLabel}</dt><dd>{T.adds}</dd></div>
              <div><dt>{T.readsLabel}</dt><dd>{T.reads}</dd></div>
            </dl>
            <div className="pen-set-actions">
              {conn.last_error && <a className="pen-btn pen-btn-accent" href="/api/pen/google-calendar/connect">{T.reconnect}</a>}
              <button type="button" className="pen-btn" onClick={disconnect} disabled={busy}>{busy ? T.disconnecting : T.disconnect}</button>
            </div>
            <p className="pen-set-fine">{T.disconnectNote}</p>
          </>
        ) : (
          <>
            <div className="pen-set-actions">
              <a className="pen-btn pen-btn-accent pen-set-pay" href="/api/pen/google-calendar/connect">{T.connect}</a>
            </div>
            <p className="pen-set-fine">{T.how}</p>
          </>
        )}
      </div>
    </div>
  )
}
