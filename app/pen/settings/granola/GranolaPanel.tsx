'use client'

// Settings → Granola: two ways to let Juno read Granola meetings (lib/pen/granola.ts).
//   · an API key (Business / Enterprise plans), pasted here and checked before it is kept;
//   · "Connect with Granola", Granola's own sign-in (any plan; free = last 30 days, no transcripts).
// Connected: which way, which Granola account, the last import, and Disconnect (deletes the key or token).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '../../Icon'
import { useCopy, useLang } from '../../LangContext'
import { errMessage, postJson } from '@/lib/pen/http'
import { fmtDate, type Copy } from '@/lib/pen/i18n'
import type { GranolaConnection } from '@/lib/pen/granola'

const GP_EN = {
  title: 'Granola',
  lede: 'Bring your Granola meetings into Juno: each one becomes a recording with Juno’s notes, to-dos, search and WhatsApp questions. Your Granola account can use a different email from this one, a work account for example.',
  keyTitle: 'Use an API key',
  keyLede: 'For Granola Business and Enterprise plans. Brings full transcripts, so Juno writes its own notes.',
  keyWhere: 'In the Granola desktop app: Settings → Connectors → API keys → Create new key. Copy it and paste it here.',
  keyLabel: 'Granola API key',
  keySave: 'Save key',
  keyChecking: 'Checking with Granola…',
  keyNote: 'Juno checks the key with Granola, then stores it encrypted. Never paste it into a chat.',
  oauthTitle: 'Connect with Granola',
  oauthLede: 'Sign in to Granola in its own window. Works on every Granola plan.',
  oauthLimits: 'On Granola’s free plan, Juno can only reach the last 30 days and Granola doesn’t share transcripts, so meetings come in with Granola’s notes only.',
  oauthBtn: 'Connect with Granola',
  viaKey: 'Connected with an API key',
  viaOauth: 'Connected with Granola sign-in',
  account: (e: string) => `Granola account: ${e}`,
  lastImport: (d: string) => `Last import ${d}`,
  never: 'Nothing imported yet',
  importNow: 'Import from Granola',
  reconnect: 'Connect again',
  disconnect: 'Disconnect',
  disconnecting: 'Disconnecting…',
  disconnectNote: 'Juno deletes the key or sign-in it stored. Meetings already imported stay. To cancel an API key completely, also revoke it in Granola under Settings → Connectors → API keys.',
  justConnected: 'Granola is connected. Import your meetings whenever you like.',
  notSetUp: 'Granola isn’t available yet. Try again soon.',
  errors: {
    cancelled: 'You cancelled in Granola, so nothing was connected.',
    state: 'That sign-in to Granola expired. Try again.',
    setup: 'Granola isn’t available yet. Try again soon.',
  } as Record<string, string>,
  failed: 'That didn’t go through. Try again.',
}

const GP: Copy<typeof GP_EN> = {
  en: GP_EN,
  es: {
    title: 'Granola',
    lede: 'Trae tus reuniones de Granola a Juno: cada una se vuelve una grabación con las notas de Juno, pendientes, búsqueda y preguntas por WhatsApp. Tu cuenta de Granola puede usar otro correo distinto a este, por ejemplo el del trabajo.',
    keyTitle: 'Usar una clave API',
    keyLede: 'Para los planes Business y Enterprise de Granola. Trae las transcripciones completas, así Juno escribe sus propias notas.',
    keyWhere: 'En la app de escritorio de Granola: Settings → Connectors → API keys → Create new key. Cópiala y pégala aquí.',
    keyLabel: 'Clave API de Granola',
    keySave: 'Guardar clave',
    keyChecking: 'Revisando con Granola…',
    keyNote: 'Juno revisa la clave con Granola y la guarda cifrada. Nunca la pegues en un chat.',
    oauthTitle: 'Conectar con Granola',
    oauthLede: 'Inicia sesión en Granola en su propia ventana. Funciona con todos los planes de Granola.',
    oauthLimits: 'Con el plan gratis de Granola, Juno solo llega a los últimos 30 días y Granola no comparte las transcripciones, así que las reuniones llegan solo con las notas de Granola.',
    oauthBtn: 'Conectar con Granola',
    viaKey: 'Conectado con una clave API',
    viaOauth: 'Conectado con el inicio de sesión de Granola',
    account: (e) => `Cuenta de Granola: ${e}`,
    lastImport: (d) => `Última importación ${d}`,
    never: 'Aún no se importó nada',
    importNow: 'Importar desde Granola',
    reconnect: 'Conectar de nuevo',
    disconnect: 'Desconectar',
    disconnecting: 'Desconectando…',
    disconnectNote: 'Juno borra la clave o el inicio de sesión que guardó. Las reuniones ya importadas se quedan. Para anular una clave API del todo, revócala también en Granola, en Settings → Connectors → API keys.',
    justConnected: 'Granola está conectado. Importa tus reuniones cuando quieras.',
    notSetUp: 'Granola aún no está disponible. Inténtalo pronto.',
    errors: {
      cancelled: 'Cancelaste en Granola, así que no se conectó nada.',
      state: 'El inicio de sesión en Granola expiró. Inténtalo de nuevo.',
      setup: 'Granola aún no está disponible. Inténtalo pronto.',
    },
    failed: 'No se pudo completar. Inténtalo de nuevo.',
  },
  pt: {
    title: 'Granola',
    lede: 'Traga suas reuniões do Granola para o Juno: cada uma vira uma gravação com as notas do Juno, tarefas, busca e perguntas pelo WhatsApp. Sua conta do Granola pode usar outro e-mail, por exemplo o do trabalho.',
    keyTitle: 'Usar uma chave de API',
    keyLede: 'Para os planos Business e Enterprise do Granola. Traz as transcrições completas, então o Juno escreve as próprias notas.',
    keyWhere: 'No app do Granola para computador: Settings → Connectors → API keys → Create new key. Copie e cole aqui.',
    keyLabel: 'Chave de API do Granola',
    keySave: 'Salvar chave',
    keyChecking: 'Verificando com o Granola…',
    keyNote: 'O Juno verifica a chave com o Granola e a guarda criptografada. Nunca cole a chave num chat.',
    oauthTitle: 'Conectar com o Granola',
    oauthLede: 'Entre no Granola na janela dele. Funciona em todos os planos do Granola.',
    oauthLimits: 'No plano grátis do Granola, o Juno só alcança os últimos 30 dias e o Granola não compartilha as transcrições, então as reuniões chegam só com as notas do Granola.',
    oauthBtn: 'Conectar com o Granola',
    viaKey: 'Conectado com uma chave de API',
    viaOauth: 'Conectado com o login do Granola',
    account: (e) => `Conta do Granola: ${e}`,
    lastImport: (d) => `Última importação ${d}`,
    never: 'Nada importado ainda',
    importNow: 'Importar do Granola',
    reconnect: 'Conectar de novo',
    disconnect: 'Desconectar',
    disconnecting: 'Desconectando…',
    disconnectNote: 'O Juno apaga a chave ou o login que guardou. As reuniões já importadas continuam. Para cancelar uma chave de API de vez, revogue-a também no Granola, em Settings → Connectors → API keys.',
    justConnected: 'O Granola está conectado. Importe suas reuniões quando quiser.',
    notSetUp: 'O Granola ainda não está disponível. Tente novamente em breve.',
    errors: {
      cancelled: 'Você cancelou no Granola, então nada foi conectado.',
      state: 'O login no Granola expirou. Tente de novo.',
      setup: 'O Granola ainda não está disponível. Tente novamente em breve.',
    },
    failed: 'Não deu certo. Tente de novo.',
  },
}

export default function GranolaPanel({ available, conn, justConnected, error }: { available: boolean; conn: GranolaConnection | null; justConnected: boolean; error: string | null }) {
  const T = useCopy(GP)
  const lang = useLang()
  const router = useRouter()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<'key' | 'off' | null>(null)
  const [err, setErr] = useState<string | null>(error ? T.errors[error] ?? decodeURIComponent(error) : null)

  async function saveKey(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    setBusy('key'); setErr(null)
    try {
      await postJson('/api/pen/granola/key', { key: key.trim() })
      setKey('')
      router.replace(`${window.location.pathname}?p=granola&connected=1#granola`, { scroll: false })
      router.refresh()
    } catch (e2) {
      setErr(errMessage(e2, T.failed))
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy('off'); setErr(null)
    try {
      await postJson('/api/pen/granola/disconnect', {})
      router.replace(`${window.location.pathname}#granola`, { scroll: false })
      router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(null)
    }
  }

  const signedOut = conn?.kind === 'mcp' && conn.last_error?.includes('Connect again')

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h4 className="pen-set-h2">{T.title}</h4>
          <p className="pen-set-lede">{T.lede}</p>
        </div>
        {justConnected && conn && <div className="pen-set-ok" role="status">{T.justConnected}</div>}
        {err && <div className="pen-su-err" role="alert">{err}</div>}
        {conn?.last_error && <div className="pen-su-err">{conn.last_error}</div>}

        {!available ? (
          <p className="pen-set-lede">{T.notSetUp}</p>
        ) : conn ? (
          <>
            <div className="pen-gcal-account">
              <span className="pen-gcal-mark" aria-hidden="true"><Icon name={conn.kind === 'api' ? 'lock' : 'link'} size={20} /></span>
              <span className="pen-gcal-who">
                <strong>{conn.kind === 'api' ? T.viaKey : T.viaOauth}</strong>
                {conn.account_email && <span>{T.account(conn.account_email)}</span>}
                <span>{conn.last_import_at ? T.lastImport(fmtDate(conn.last_import_at, lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) : T.never}</span>
              </span>
            </div>
            <div className="pen-set-actions">
              {signedOut ? (
                <a className="pen-btn pen-btn-accent" href="/api/pen/granola/connect">{T.reconnect}</a>
              ) : (
                <a className="pen-btn pen-btn-accent pen-set-pay" href="/pen?import=granola">{T.importNow}</a>
              )}
              <button type="button" className="pen-btn" onClick={disconnect} disabled={busy !== null}>{busy === 'off' ? T.disconnecting : T.disconnect}</button>
            </div>
            <p className="pen-set-fine">{T.disconnectNote}</p>
          </>
        ) : null}
      </div>

      {available && !conn && (
        <>
          <form className="pen-set-card" onSubmit={saveKey}>
            <div className="pen-set-card-head">
              <h4 className="pen-set-h2">{T.keyTitle}</h4>
              <p className="pen-set-lede">{T.keyLede}</p>
            </div>
            <p className="pen-set-lede">{T.keyWhere}</p>
            <label className="pen-su-field">
              <span className="pen-label">{T.keyLabel}</span>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="grn_…"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
            </label>
            <div className="pen-set-actions">
              <button type="submit" className="pen-btn pen-btn-accent pen-set-pay" disabled={busy !== null || !key.trim()}>{busy === 'key' ? T.keyChecking : T.keySave}</button>
            </div>
            <p className="pen-set-fine">{T.keyNote}</p>
          </form>

          <div className="pen-set-card">
            <div className="pen-set-card-head">
              <h4 className="pen-set-h2">{T.oauthTitle}</h4>
              <p className="pen-set-lede">{T.oauthLede}</p>
            </div>
            <div className="pen-set-actions">
              <a className="pen-btn pen-set-pay" href="/api/pen/granola/connect">{T.oauthBtn}</a>
            </div>
            <p className="pen-set-fine">{T.oauthLimits}</p>
          </div>
        </>
      )}
    </div>
  )
}
