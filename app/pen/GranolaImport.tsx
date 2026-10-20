'use client'

// "Import from Granola": pick some of the last 30 days' Granola meetings (or all of them not yet
// in Juno) and they import in the background, two at a time (lib/pen/granola-import.ts). Each
// becomes a recording; with a transcript Juno writes its own notes, without one Granola's notes
// come in as notes only. Same consent switch as every other way in.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ListedMeeting } from '@/lib/pen/granola-import'
import { getJson, postJson, errMessage } from '@/lib/pen/http'
import { useCopy, useLang } from './LangContext'
import { fmtDate, type Copy } from '@/lib/pen/i18n'

const GI_EN = {
  title: 'Import from Granola',
  lede: 'Your Granola meetings from the last 30 days, turned into Juno recordings: notes, to-dos, search and WhatsApp questions.',
  close: 'Close',
  loading: 'Looking through your Granola…',
  none: 'No Granola meetings in the last 30 days. Granola only shares meetings that have finished notes.',
  notConnected: 'Connect Granola first, in Settings → Granola. An API key or Granola’s sign-in both work.',
  connect: 'Go to Settings → Granola',
  minutes: (n: number) => `${n} min`,
  imported: 'In Juno',
  all: (n: number) => `Select all ${n} not yet in Juno`,
  none2: 'Clear',
  consent: 'Everyone in these meetings agreed to be recorded.',
  consentFirst: 'Confirm that everyone agreed to be recorded.',
  pickFirst: 'Pick at least one meeting.',
  cancel: 'Cancel',
  starting: 'Starting…',
  submit: (n: number) => (n === 1 ? 'Import 1 meeting' : `Import ${n} meetings`),
  queued: (n: number) => `Importing ${n} meeting${n === 1 ? '' : 's'} in the background. They appear in your recordings as they come in; notes follow within a few minutes. You can close this.`,
  done: 'Done',
  failed: 'Couldn’t import from Granola.',
}

const GI: Copy<typeof GI_EN> = {
  en: GI_EN,
  es: {
    title: 'Importar desde Granola',
    lede: 'Tus reuniones de Granola de los últimos 30 días, convertidas en grabaciones de Juno: notas, pendientes, búsqueda y preguntas por WhatsApp.',
    close: 'Cerrar',
    loading: 'Revisando tu Granola…',
    none: 'No hay reuniones de Granola en los últimos 30 días. Granola solo comparte reuniones con notas terminadas.',
    notConnected: 'Primero conecta Granola, en Ajustes → Granola. Sirve una clave API o el inicio de sesión de Granola.',
    connect: 'Ir a Ajustes → Granola',
    minutes: (n) => `${n} min`,
    imported: 'En Juno',
    all: (n) => `Elegir las ${n} que aún no están en Juno`,
    none2: 'Quitar selección',
    consent: 'Todos en estas reuniones aceptaron ser grabados.',
    consentFirst: 'Confirma que todos aceptaron ser grabados.',
    pickFirst: 'Elige al menos una reunión.',
    cancel: 'Cancelar',
    starting: 'Empezando…',
    submit: (n) => (n === 1 ? 'Importar 1 reunión' : `Importar ${n} reuniones`),
    queued: (n) => `Importando ${n} reunión${n === 1 ? '' : 'es'} en segundo plano. Aparecen en tus grabaciones a medida que llegan; las notas siguen en unos minutos. Puedes cerrar esto.`,
    done: 'Listo',
    failed: 'No se pudo importar desde Granola.',
  },
  pt: {
    title: 'Importar do Granola',
    lede: 'Suas reuniões do Granola dos últimos 30 dias, transformadas em gravações do Juno: notas, tarefas, busca e perguntas pelo WhatsApp.',
    close: 'Fechar',
    loading: 'Procurando no seu Granola…',
    none: 'Nenhuma reunião do Granola nos últimos 30 dias. O Granola só compartilha reuniões com notas prontas.',
    notConnected: 'Conecte o Granola primeiro, em Configurações → Granola. Funciona com chave de API ou com o login do Granola.',
    connect: 'Ir para Configurações → Granola',
    minutes: (n) => `${n} min`,
    imported: 'No Juno',
    all: (n) => `Selecionar as ${n} que ainda não estão no Juno`,
    none2: 'Limpar',
    consent: 'Todos nestas reuniões concordaram em ser gravados.',
    consentFirst: 'Confirme que todos concordaram em ser gravados.',
    pickFirst: 'Escolha pelo menos uma reunião.',
    cancel: 'Cancelar',
    starting: 'Começando…',
    submit: (n) => (n === 1 ? 'Importar 1 reunião' : `Importar ${n} reuniões`),
    queued: (n) => `Importando ${n} reuni${n === 1 ? 'ão' : 'ões'} em segundo plano. Elas aparecem nas suas gravações conforme chegam; as notas vêm em alguns minutos. Pode fechar isto.`,
    done: 'Pronto',
    failed: 'Não foi possível importar do Granola.',
  },
}

export default function GranolaImport({ connected, onClose, onQueued }: { connected: boolean; onClose: () => void; onQueued: () => void }) {
  const T = useCopy(GI)
  const lang = useLang()
  const [meetings, setMeetings] = useState<ListedMeeting[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])

  useEffect(() => {
    if (!connected) return
    getJson<{ meetings: ListedMeeting[] }>('/api/pen/granola/meetings?days=30')
      .then((j) => setMeetings(j.meetings))
      .catch((e) => { setErr(errMessage(e, T.failed)); setMeetings([]) })
  }, [connected, T.failed])

  const fresh = (meetings ?? []).filter((m) => !m.imported)
  const allOn = fresh.length > 0 && fresh.every((m) => picked.has(m.id))

  function toggle(id: string) {
    setErr(null)
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!picked.size) return setErr(T.pickFirst)
    if (!consent) return setErr(T.consentFirst)
    setBusy(true); setErr(null)
    try {
      const j = await postJson<{ queued: number }>('/api/pen/granola/import', { ids: [...picked], consent: true })
      setQueued(j.queued)
      onQueued()
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(false)
    }
  }

  if (!host) return null
  return createPortal(
    <div className="pen-tximp-back" onClick={onClose}>
      <div className="pen-tximp" role="dialog" aria-modal="true" aria-label={T.title} onClick={(e) => e.stopPropagation()}>
        <div className="pen-tximp-head">
          <div>
            <span className="pen-label">{T.title}</span>
            <p className="pen-tximp-lede">{T.lede}</p>
          </div>
          <button type="button" className="pen-imp-x" onClick={onClose} aria-label={T.close}>&times;</button>
        </div>

        <div className="pen-tximp-body">
          {queued !== null ? (
            <div className="pen-set-ok" role="status">{T.queued(queued)}</div>
          ) : !connected ? (
            <>
              <p className="pen-tximp-lede">{T.notConnected}</p>
              <div><a className="pen-btn pen-btn-accent" href="/pen/settings/connections#granola">{T.connect}</a></div>
            </>
          ) : meetings === null ? (
            <p className="pen-tximp-lede">{T.loading}</p>
          ) : meetings.length === 0 ? (
            <p className="pen-tximp-lede">{T.none}</p>
          ) : (
            <>
              {fresh.length > 1 && (
                <div>
                  <button type="button" className="pen-gimp-all" onClick={() => setPicked(allOn ? new Set() : new Set(fresh.map((m) => m.id)))}>
                    {allOn ? T.none2 : T.all(fresh.length)}
                  </button>
                </div>
              )}
              <ul className="pen-nimp-list" aria-label={T.title}>
                {meetings.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={picked.has(m.id)}
                      data-on={picked.has(m.id)}
                      disabled={m.imported}
                      className="pen-nimp-row"
                      onClick={() => toggle(m.id)}
                    >
                      <strong>{m.title}</strong>
                      <span>
                        {[m.start ? fmtDate(m.start, lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null, m.minutes ? T.minutes(m.minutes) : null].filter(Boolean).join(' · ')}
                      </span>
                      {m.imported && <em className="pen-nimp-tag">{T.imported}</em>}
                    </button>
                  </li>
                ))}
              </ul>
              {picked.size > 0 && (
                <button className="pen-consent" data-on={consent} onClick={() => setConsent(!consent)} role="switch" aria-checked={consent} type="button">
                  <span className="pen-consent-track"><span className="pen-consent-knob" /></span>
                  <span className="pen-consent-text">{T.consent}</span>
                </button>
              )}
            </>
          )}
          {err && <div className="pen-su-err" role="alert">{err}</div>}
        </div>

        <div className="pen-tximp-foot">
          {queued !== null ? (
            <button type="button" className="pen-btn pen-btn-accent" onClick={onClose}>{T.done}</button>
          ) : (
            <>
              <button type="button" className="pen-btn" onClick={onClose}>{T.cancel}</button>
              {connected && meetings && fresh.length > 0 && (
                <button type="button" className="pen-btn pen-btn-accent" onClick={submit} disabled={busy || !picked.size}>
                  {busy ? T.starting : T.submit(Math.max(picked.size, 1))}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    host,
  )
}
