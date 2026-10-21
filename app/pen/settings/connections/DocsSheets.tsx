'use client'

// Settings → Connections → Notes & documents → Google Docs & Sheets (drive.file). Stored on the
// older Google connection (pen_gcal, lib/pen/google-calendar.ts), so it connects and disconnects
// through /api/pen/google-calendar/*. Was the bottom card of Settings → Google until 20 Oct.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCopy } from '../../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'

const D_EN = {
  lede: 'Juno puts what you ask for into your Drive: a recording’s notes or a plan as a Google Doc, your to-dos or contacts as a Google Sheet.',
  connect: 'Connect Google Docs & Sheets',
  both: 'Connect Calendar and Docs & Sheets together',
  how: 'Google asks for one permission: to create files in your Drive and open only the ones Juno made. Juno can’t see anything else there.',
  via: (a: string) => `Uses the Google account ${a}.`,
  viaNone: 'Uses your connected Google account.',
  makesLabel: 'Makes',
  makes: 'Only the Docs and Sheets you ask for, in a “Juno Pen” folder in your Drive.',
  opensLabel: 'Opens',
  opens: 'Only the files Juno made and the ones you choose for it. Nothing else in your Drive is visible to Juno.',
  pick: 'Let Juno edit a file',
  pickLine: 'Choose a Doc or Sheet you made, and Juno can add to it or change it when you ask.',
  reconnect: 'Connect again',
  disconnect: 'Disconnect Docs & Sheets',
  disconnecting: 'Disconnecting…',
  note: 'Disconnecting stops Juno making files. The Docs and Sheets it already made stay in your Drive, and they’re yours.',
  shared: 'Calendar uses the same Google permission, so Google keeps it until you disconnect that too.',
  justConnected: 'Google Docs & Sheets is connected. Use “Send to Google Docs” on a recording, or export your to-dos or contacts.',
  justDisconnected: 'Disconnected. Juno won’t make files in your Drive anymore.',
  failed: 'That didn’t go through. Try again.',
  notSetUp: 'Google isn’t available yet. Try again soon.',
}

const D: Copy<typeof D_EN> = {
  en: D_EN,
  es: {
    lede: 'Juno deja en tu Drive lo que le pidas: las notas de una grabación o un plan como Google Doc, tus pendientes o contactos como Google Sheet.',
    connect: 'Conectar Google Docs y Sheets',
    both: 'Conectar Calendar y Docs y Sheets juntos',
    how: 'Google pide un solo permiso: crear archivos en tu Drive y abrir solo los que hizo Juno. Juno no puede ver nada más ahí.',
    via: (a) => `Usa la cuenta de Google ${a}.`,
    viaNone: 'Usa tu cuenta de Google conectada.',
    makesLabel: 'Crea',
    makes: 'Solo los Docs y Sheets que pidas, en una carpeta “Juno Pen” de tu Drive.',
    opensLabel: 'Abre',
    opens: 'Solo los archivos que hizo Juno y los que tú elijas. Nada más de tu Drive es visible para Juno.',
    pick: 'Deja que Juno edite un archivo',
    pickLine: 'Elige un Doc o Sheet que hiciste tú, y Juno podrá agregarle cosas o cambiarlo cuando se lo pidas.',
    reconnect: 'Conectar de nuevo',
    disconnect: 'Desconectar Docs y Sheets',
    disconnecting: 'Desconectando…',
    note: 'Al desconectar, Juno deja de crear archivos. Los Docs y Sheets que ya hizo se quedan en tu Drive y son tuyos.',
    shared: 'Calendar usa el mismo permiso de Google, así que Google lo mantiene hasta que lo desconectes también.',
    justConnected: 'Google Docs y Sheets está conectado. Usa “Enviar a Google Docs” en una grabación, o exporta tus pendientes o contactos.',
    justDisconnected: 'Desconectado. Juno ya no creará archivos en tu Drive.',
    failed: 'No se pudo completar. Inténtalo de nuevo.',
    notSetUp: 'Google aún no está disponible. Inténtalo pronto.',
  },
  pt: {
    lede: 'O Juno coloca no seu Drive o que você pedir: as notas de uma gravação ou um plano como Google Doc, suas tarefas ou contatos como Planilha Google.',
    connect: 'Conectar Google Docs e Planilhas',
    both: 'Conectar Agenda e Docs e Planilhas juntos',
    how: 'O Google pede uma única permissão: criar arquivos no seu Drive e abrir só os que o Juno criou. O Juno não vê mais nada lá.',
    via: (a) => `Usa a conta Google ${a}.`,
    viaNone: 'Usa a sua conta Google conectada.',
    makesLabel: 'Cria',
    makes: 'Só os Docs e Planilhas que você pedir, numa pasta “Juno Pen” do seu Drive.',
    opensLabel: 'Abre',
    opens: 'Só os arquivos que o Juno criou e os que você escolher. Nada mais do seu Drive fica visível para o Juno.',
    pick: 'Deixe o Juno editar um arquivo',
    pickLine: 'Escolha um Doc ou Planilha que você fez, e o Juno pode acrescentar ou mudar o que você pedir.',
    reconnect: 'Conectar de novo',
    disconnect: 'Desconectar Docs e Planilhas',
    disconnecting: 'Desconectando…',
    note: 'Ao desconectar, o Juno para de criar arquivos. Os Docs e Planilhas que ele já criou continuam no seu Drive e são seus.',
    shared: 'A Agenda usa a mesma permissão do Google, então o Google a mantém até você desconectá-la também.',
    justConnected: 'Google Docs e Planilhas está conectado. Use “Enviar ao Google Docs” numa gravação, ou exporte suas tarefas ou contatos.',
    justDisconnected: 'Desconectado. O Juno não vai mais criar arquivos no seu Drive.',
    failed: 'Não deu certo. Tente de novo.',
    notSetUp: 'O Google ainda não está disponível. Tente novamente em breve.',
  },
}

const CONNECT = '/api/pen/google-calendar/connect'

export default function DocsSheets({ configured, on, calendarToo, address, broken, anyGoogle, status }: {
  configured: boolean
  /** drive.file is on the pen_gcal connection. */
  on: boolean
  /** That same connection also has Calendar (one permission at Google). */
  calendarToo: boolean
  address: string | null
  broken: boolean
  /** Any Google connection at all (offers "Calendar and Docs together" only when there is none). */
  anyGoogle: boolean
  status: { connected: string | null; disconnected: string | null }
}) {
  const T = useCopy(D)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function disconnect() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/pen/google-calendar/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ what: 'drive' }) })
      if (!r.ok) throw new Error(T.failed)
      router.replace(`${window.location.pathname}?p=docs&disconnected=drive#docs`, { scroll: false })
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(false)
    }
  }

  if (!configured) return <p className="pen-set-lede">{T.notSetUp}</p>
  const flash = on && !broken && (status.connected === 'drive' || status.connected === 'both') ? T.justConnected : !on && status.disconnected === 'drive' ? T.justDisconnected : null

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head"><p className="pen-set-lede">{T.lede}</p></div>
        {flash && <div className="pen-set-ok" role="status">{flash}</div>}
        {err && <div className="pen-su-err" role="alert">{err}</div>}
        {on ? (
          <>
            <p className="pen-set-lede">{address ? T.via(address) : T.viaNone}</p>
            <dl className="pen-gcal-terms">
              <div><dt>{T.makesLabel}</dt><dd>{T.makes}</dd></div>
              <div><dt>{T.opensLabel}</dt><dd>{T.opens}</dd></div>
            </dl>
            {!broken && (
              <div className="pen-set-actions">
                <a className="pen-btn" href="/pen/drive/pick">{T.pick}</a>
                <span className="pen-set-fine">{T.pickLine}</span>
              </div>
            )}
            <div className="pen-set-actions">
              {broken && <a className="pen-btn pen-btn-accent" href={`${CONNECT}?want=drive`}>{T.reconnect}</a>}
              <button type="button" className="pen-btn" onClick={disconnect} disabled={busy}>{busy ? T.disconnecting : T.disconnect}</button>
            </div>
            <p className="pen-set-fine">{calendarToo ? `${T.note} ${T.shared}` : T.note}</p>
          </>
        ) : (
          <>
            <div className="pen-set-actions">
              <a className="pen-btn pen-btn-accent pen-set-pay" href={`${CONNECT}?want=drive`}>{T.connect}</a>
              {!anyGoogle && <a className="pen-notion-sent" href={`${CONNECT}?want=both`}>{T.both}</a>}
            </div>
            <p className="pen-set-fine">{T.how}</p>
          </>
        )}
      </div>
    </div>
  )
}
