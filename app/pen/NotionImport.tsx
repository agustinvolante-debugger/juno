'use client'

// "Import from Notion": pick one of the Notion AI Meeting Notes Juno can see, and its transcript
// becomes a Juno recording with Juno's own notes, search and people (lib/pen/notion-import.ts).
//
// Notion's transcripts carry no speaker names, so the dialog says so and lets the user add who
// was there by hand. Same consent switch as every other way in.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PersonCard } from '@/lib/pen/people'
import type { NotionMeeting } from '@/lib/pen/notion-import'
import { getJson, postJson, errMessage } from '@/lib/pen/http'
import PeoplePicker, { type Picked } from './PeoplePicker'
import { useCopy, useLang } from './LangContext'
import { fmtDate, type Copy } from '@/lib/pen/i18n'

const NI_EN = {
  title: 'Import from Notion',
  lede: 'Your Notion AI Meeting Notes, turned into Juno notes: to-dos, things said once, search and WhatsApp questions.',
  close: 'Close',
  loading: 'Looking through your Notion…',
  none: 'Juno can’t see any Notion meeting notes yet. Juno only sees the pages you shared with it: in Notion, open the page with your meeting notes, click ••• → Connections → Juno Pen.',
  notConnected: 'Connect Notion first, in Settings → Notion.',
  connect: 'Go to Settings → Notion',
  minutes: (n: number) => `${n} min`,
  inPage: (p: string) => `in “${p}”`,
  imported: 'Imported',
  notReady: 'Notion is still writing this one',
  noSpeakers: 'Notion’s transcripts don’t say who spoke, so add who was there if you’d like them on the note.',
  who: 'Who was there',
  optional: 'optional',
  consent: 'Everyone in this conversation agreed to be recorded.',
  consentFirst: 'Confirm that everyone agreed to be recorded.',
  pickFirst: 'Pick a meeting.',
  cancel: 'Cancel',
  importing: 'Importing…',
  submit: 'Import and write notes',
  open: 'Open it in Juno',
  failed: 'Couldn’t import that meeting.',
}

const NI: Copy<typeof NI_EN> = {
  en: NI_EN,
  es: {
    title: 'Importar desde Notion',
    lede: 'Tus notas de reuniones con IA de Notion, convertidas en notas de Juno: pendientes, lo dicho una vez, búsqueda y preguntas por WhatsApp.',
    close: 'Cerrar',
    loading: 'Revisando tu Notion…',
    none: 'Juno aún no ve notas de reuniones de Notion. Juno solo ve las páginas que compartiste: en Notion, abre la página con tus reuniones, toca ••• → Conexiones → Juno Pen.',
    notConnected: 'Primero conecta Notion, en Ajustes → Notion.',
    connect: 'Ir a Ajustes → Notion',
    minutes: (n) => `${n} min`,
    inPage: (p) => `en “${p}”`,
    imported: 'Importada',
    notReady: 'Notion todavía la está procesando',
    noSpeakers: 'Las transcripciones de Notion no dicen quién habló, así que agrega quiénes estaban si quieres verlos en la nota.',
    who: 'Quiénes estaban',
    optional: 'opcional',
    consent: 'Todos en esta conversación aceptaron ser grabados.',
    consentFirst: 'Confirma que todos aceptaron ser grabados.',
    pickFirst: 'Elige una reunión.',
    cancel: 'Cancelar',
    importing: 'Importando…',
    submit: 'Importar y escribir notas',
    open: 'Abrirla en Juno',
    failed: 'No se pudo importar esa reunión.',
  },
  pt: {
    title: 'Importar do Notion',
    lede: 'Suas notas de reunião com IA do Notion, transformadas em notas do Juno: tarefas, o que foi dito uma vez, busca e perguntas pelo WhatsApp.',
    close: 'Fechar',
    loading: 'Procurando no seu Notion…',
    none: 'O Juno ainda não vê notas de reunião do Notion. O Juno só vê as páginas que você compartilhou: no Notion, abra a página com suas reuniões e toque em ••• → Conexões → Juno Pen.',
    notConnected: 'Conecte o Notion primeiro, em Configurações → Notion.',
    connect: 'Ir para Configurações → Notion',
    minutes: (n) => `${n} min`,
    inPage: (p) => `em “${p}”`,
    imported: 'Importada',
    notReady: 'O Notion ainda está processando esta',
    noSpeakers: 'As transcrições do Notion não dizem quem falou, então adicione quem estava se quiser vê-los na nota.',
    who: 'Quem estava',
    optional: 'opcional',
    consent: 'Todos nesta conversa concordaram em ser gravados.',
    consentFirst: 'Confirme que todos concordaram em ser gravados.',
    pickFirst: 'Escolha uma reunião.',
    cancel: 'Cancelar',
    importing: 'Importando…',
    submit: 'Importar e escrever notas',
    open: 'Abrir no Juno',
    failed: 'Não foi possível importar essa reunião.',
  },
}

export default function NotionImport({ people, connected, onClose, onImported }: { people: PersonCard[]; connected: boolean; onClose: () => void; onImported: (id: string) => void }) {
  const T = useCopy(NI)
  const lang = useLang()
  const [meetings, setMeetings] = useState<NotionMeeting[] | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [who, setWho] = useState<Picked[]>([])
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Portalled into .pen-root, like TranscriptImport: the button lives in the phone's drawer.
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])

  useEffect(() => {
    if (!connected) return
    getJson<{ meetings: NotionMeeting[] }>('/api/pen/notion/meetings')
      .then((j) => setMeetings(j.meetings))
      .catch((e) => { setErr(errMessage(e, T.failed)); setMeetings([]) })
  }, [connected, T.failed])

  const chosen = meetings?.find((m) => m.id === pick) ?? null

  async function submit() {
    if (!chosen) return setErr(T.pickFirst)
    if (chosen.imported) {
      const j = await postJson<{ id: string }>('/api/pen/notion/import', { id: chosen.id, consent: true }).catch(() => null)
      if (j) onImported(j.id)
      return
    }
    if (!consent) return setErr(T.consentFirst)
    setBusy(true); setErr(null)
    try {
      const j = await postJson<{ id: string }>('/api/pen/notion/import', {
        id: chosen.id,
        consent: true,
        people: who.map((p) => (p.id ? { id: p.id } : { name: p.name })),
      })
      onImported(j.id)
    } catch (e) {
      setErr(errMessage(e, T.failed))
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
          {!connected ? (
            <>
              <p className="pen-tximp-lede">{T.notConnected}</p>
              <div><a className="pen-btn pen-btn-accent" href="/pen/settings/notion">{T.connect}</a></div>
            </>
          ) : meetings === null ? (
            <p className="pen-tximp-lede">{T.loading}</p>
          ) : meetings.length === 0 ? (
            <p className="pen-tximp-lede">{T.none}</p>
          ) : (
            <>
              <ul className="pen-nimp-list" role="radiogroup" aria-label={T.title}>
                {meetings.map((m) => (
                  <li key={m.id}>
                    <button type="button" role="radio" aria-checked={pick === m.id} data-on={pick === m.id} disabled={!m.ready} className="pen-nimp-row" onClick={() => { setPick(m.id); setErr(null) }}>
                      <strong>{m.title}</strong>
                      <span>
                        {[m.start ? fmtDate(m.start, lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null, m.minutes ? T.minutes(m.minutes) : null, T.inPage(m.page)].filter(Boolean).join(' · ')}
                      </span>
                      {m.imported && <em className="pen-nimp-tag">{T.imported}</em>}
                      {!m.ready && <em className="pen-nimp-tag">{T.notReady}</em>}
                    </button>
                  </li>
                ))}
              </ul>
              {chosen && !chosen.imported && (
                <>
                  <p className="pen-tximp-preview">{T.noSpeakers}</p>
                  <div className="pen-su-field">
                    <span className="pen-label">{T.who} <em>{T.optional}</em></span>
                    <PeoplePicker people={people} value={who} onChange={setWho} />
                  </div>
                  <button className="pen-consent" data-on={consent} onClick={() => setConsent(!consent)} role="switch" aria-checked={consent} type="button">
                    <span className="pen-consent-track"><span className="pen-consent-knob" /></span>
                    <span className="pen-consent-text">{T.consent}</span>
                  </button>
                </>
              )}
            </>
          )}
          {err && <div className="pen-su-err">{err}</div>}
        </div>

        <div className="pen-tximp-foot">
          <button type="button" className="pen-btn" onClick={onClose}>{T.cancel}</button>
          {connected && meetings && meetings.length > 0 && (
            <button type="button" className="pen-btn pen-btn-accent" onClick={submit} disabled={busy || !chosen}>
              {busy ? T.importing : chosen?.imported ? T.open : T.submit}
            </button>
          )}
        </div>
      </div>
    </div>,
    host,
  )
}
