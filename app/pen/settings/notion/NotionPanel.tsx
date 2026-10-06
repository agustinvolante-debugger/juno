'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCopy } from '../../LangContext'
import { errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'
import type { NotionConnection } from '@/lib/pen/notion'

const NP_EN = {
  title: 'Notion',
  lede: 'Every recording’s notes, added to your Notion as soon as they’re ready: summary, to-dos as checkboxes, who was there, and a link back to the full note.',
  connect: 'Connect Notion',
  how: 'Notion will ask which page Juno can use. Pick one (a page called “Meetings” works well) and Juno creates a “Juno Pen notes” table inside it.',
  connected: (w: string) => `Connected to ${w}.`,
  openTable: 'Open “Juno Pen notes” in Notion',
  auto: 'Add new recordings automatically',
  autoHint: 'Off: nothing goes to Notion unless you press “Send to Notion” on a note.',
  disconnect: 'Disconnect',
  disconnecting: 'Disconnecting…',
  disconnectNote: 'Pages already in Notion stay there. To remove Juno’s access completely, also remove it in Notion under Settings → Connections.',
  justConnected: 'Notion is connected. New notes will appear there as they’re ready.',
  notSetUp: 'Notion isn’t available yet. Try again soon.',
  errors: {
    cancelled: 'You cancelled in Notion, so nothing was connected.',
    state: 'That sign-in to Notion expired. Try again.',
    setup: 'Notion isn’t available yet. Try again soon.',
  } as Record<string, string>,
  failed: 'That didn’t go through. Try again.',
  shareTitle: 'Give Juno access to another page',
  shareLede: 'Juno only sees the pages you choose. To add one later, for example a page with Notion meeting notes:',
  shareSteps: ['Open the page in Notion.', 'Click ••• in the top-right corner.', 'Choose Connections (or Add connections), search for Juno Pen and select it.', 'Confirm. Juno can now read that page and everything inside it.'],
  shareNote: 'To take access away, do the same and remove Juno Pen.',
}

const NP: Copy<typeof NP_EN> = {
  en: NP_EN,
  es: {
    title: 'Notion',
    lede: 'Las notas de cada grabación, en tu Notion apenas estén listas: resumen, pendientes como casillas, quiénes estaban y un enlace a la nota completa.',
    connect: 'Conectar Notion',
    how: 'Notion te preguntará qué página puede usar Juno. Elige una (una página llamada “Reuniones” sirve) y Juno crea dentro una tabla “Juno Pen notes”.',
    connected: (w) => `Conectado a ${w}.`,
    openTable: 'Abrir “Juno Pen notes” en Notion',
    auto: 'Agregar las grabaciones nuevas automáticamente',
    autoHint: 'Apagado: nada va a Notion salvo que toques “Enviar a Notion” en una nota.',
    disconnect: 'Desconectar',
    disconnecting: 'Desconectando…',
    disconnectNote: 'Las páginas que ya están en Notion se quedan. Para quitarle el acceso a Juno del todo, quítalo también en Notion, en Configuración → Conexiones.',
    justConnected: 'Notion está conectado. Las notas nuevas aparecerán ahí apenas estén listas.',
    notSetUp: 'Notion aún no está disponible. Inténtalo pronto.',
    errors: {
      cancelled: 'Cancelaste en Notion, así que no se conectó nada.',
      state: 'El inicio de sesión en Notion expiró. Inténtalo de nuevo.',
      setup: 'Notion aún no está disponible. Inténtalo pronto.',
    },
    failed: 'No se pudo completar. Inténtalo de nuevo.',
    shareTitle: 'Darle acceso a Juno a otra página',
    shareLede: 'Juno solo ve las páginas que tú eliges. Para agregar una después, por ejemplo una página con notas de reuniones de Notion:',
    shareSteps: ['Abre la página en Notion.', 'Toca ••• en la esquina superior derecha.', 'Elige Conexiones (o Agregar conexiones), busca Juno Pen y selecciónalo.', 'Confirma. Juno ya puede leer esa página y todo lo que contiene.'],
    shareNote: 'Para quitarle el acceso, haz lo mismo y quita Juno Pen.',
  },
  pt: {
    title: 'Notion',
    lede: 'As notas de cada gravação no seu Notion assim que ficam prontas: resumo, tarefas como caixas de seleção, quem estava e um link para a nota completa.',
    connect: 'Conectar o Notion',
    how: 'O Notion vai perguntar qual página o Juno pode usar. Escolha uma (uma página chamada “Reuniões” funciona bem) e o Juno cria nela uma tabela “Juno Pen notes”.',
    connected: (w) => `Conectado a ${w}.`,
    openTable: 'Abrir “Juno Pen notes” no Notion',
    auto: 'Adicionar novas gravações automaticamente',
    autoHint: 'Desligado: nada vai para o Notion, a menos que você toque em “Enviar para o Notion” numa nota.',
    disconnect: 'Desconectar',
    disconnecting: 'Desconectando…',
    disconnectNote: 'As páginas que já estão no Notion continuam lá. Para tirar o acesso do Juno por completo, remova-o também no Notion, em Configurações → Conexões.',
    justConnected: 'O Notion está conectado. As notas novas vão aparecer lá assim que ficarem prontas.',
    notSetUp: 'O Notion ainda não está disponível. Tente novamente em breve.',
    errors: {
      cancelled: 'Você cancelou no Notion, então nada foi conectado.',
      state: 'O login no Notion expirou. Tente de novo.',
      setup: 'O Notion ainda não está disponível. Tente novamente em breve.',
    },
    failed: 'Não deu certo. Tente de novo.',
    shareTitle: 'Dar ao Juno acesso a outra página',
    shareLede: 'O Juno só vê as páginas que você escolhe. Para adicionar uma depois, por exemplo uma página com notas de reunião do Notion:',
    shareSteps: ['Abra a página no Notion.', 'Toque em ••• no canto superior direito.', 'Escolha Conexões (ou Adicionar conexões), procure Juno Pen e selecione.', 'Confirme. O Juno já pode ler essa página e tudo o que ela contém.'],
    shareNote: 'Para tirar o acesso, faça o mesmo e remova o Juno Pen.',
  },
}

export default function NotionPanel({ configured, conn, justConnected, error }: { configured: boolean; conn: NotionConnection | null; justConnected: boolean; error: string | null }) {
  const T = useCopy(NP)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(error ? T.errors[error] ?? decodeURIComponent(error) : null)
  const [auto, setAutoState] = useState(conn?.auto ?? true)

  async function toggle(v: boolean) {
    setAutoState(v); setErr(null)
    const r = await fetch('/api/pen/notion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: v }) })
    if (!r.ok) { setAutoState(!v); setErr(T.failed) }
  }
  async function disconnect() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/pen/notion', { method: 'DELETE' })
      if (!r.ok) throw new Error(T.failed)
      router.replace('/pen/settings/notion')
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
        {err && <div className="pen-su-err">{err}</div>}
        {conn?.last_error && <div className="pen-su-err">{conn.last_error}</div>}

        {!configured ? (
          <p className="pen-set-lede">{T.notSetUp}</p>
        ) : conn ? (
          <>
            <p className="pen-set-lede"><strong>{T.connected(conn.workspace_name ?? 'Notion')}</strong></p>
            {conn.database_url && (
              <div className="pen-set-actions">
                <a className="pen-btn pen-set-pay" href={conn.database_url} target="_blank" rel="noreferrer">{T.openTable}</a>
              </div>
            )}
            <label className="pen-notion-auto">
              <input type="checkbox" className="pen-act-box" checked={auto} onChange={(e) => void toggle(e.target.checked)} />
              <span><strong>{T.auto}</strong><em>{T.autoHint}</em></span>
            </label>
            <div className="pen-set-actions">
              {conn.last_error && <a className="pen-btn pen-btn-accent" href="/api/pen/notion/connect">{T.connect}</a>}
              <button type="button" className="pen-btn" onClick={disconnect} disabled={busy}>{busy ? T.disconnecting : T.disconnect}</button>
            </div>
            <p className="pen-set-fine">{T.disconnectNote}</p>
          </>
        ) : (
          <>
            <div className="pen-set-actions">
              <a className="pen-btn pen-btn-accent pen-set-pay" href="/api/pen/notion/connect">{T.connect}</a>
            </div>
            <p className="pen-set-fine">{T.how}</p>
          </>
        )}
      </div>

      {/* Juno sees only the pages picked when connecting; this is how to add more later. */}
      {configured && conn && (
        <div className="pen-set-card">
          <div className="pen-set-card-head">
            <h2 className="pen-set-h2">{T.shareTitle}</h2>
            <p className="pen-set-lede">{T.shareLede}</p>
          </div>
          <ol className="pen-invite-rules pen-notion-steps">
            {T.shareSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className="pen-set-fine">{T.shareNote}</p>
        </div>
      )}
    </div>
  )
}
