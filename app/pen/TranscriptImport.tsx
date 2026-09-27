'use client'

// "Import a transcript": bring text from another recorder instead of audio.
//
// Pocket's free plan exports text but not audio; Otter and Plaud export text; subtitle files
// come from everywhere. The text becomes a recording with notes, search and people, and
// nothing is transcribed. A live preview shows how the text was read (turns, speakers) before
// anything is saved, so a paste that came out as one wall of text is visible up front.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PersonCard } from '@/lib/pen/people'
import { parseTranscript } from '@/lib/pen/transcript-import'
import { postJson, errMessage } from '@/lib/pen/http'
import PeoplePicker, { type Picked } from './PeoplePicker'
import { useCopy } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'

const TI_EN = {
  tooLarge: 'That file is too large for a transcript. Is it audio? Use Add audio files instead.',
  pasteFirst: 'Paste a transcript or choose a file.',
  consentFirst: 'Confirm that everyone agreed to be recorded.',
  failed: 'Could not import that transcript.',
  title: 'Import a transcript',
  lede: 'From Pocket, Otter, Plaud or any recorder that gives you text. You get the notes, search and people, same as a recording.',
  close: 'Close',
  loaded: (f: string) => `Loaded ${f}`,
  choose: 'Choose a .txt, .srt or .vtt file',
  placeholder: '…or paste it here. Lines like\nSarah: We love the kitchen.\nTom: Parking is the thing.\nbecome named speakers.',
  turns: ['turn', 'turns'] as [string, string],
  noNames: ' · no speaker names found',
  about: (m: number) => ` · about ${m} min of talk`,
  titleLabel: 'Title',
  optional: 'optional',
  titlePh: 'e.g. Maple Avenue viewing',
  who: 'Who was on this call',
  consent: 'Everyone in this conversation agreed to be recorded.',
  cancel: 'Cancel',
  importing: 'Importing…',
  submit: 'Import and write notes',
}

const TI: Copy<typeof TI_EN> = {
  en: TI_EN,
  es: {
    tooLarge: 'Ese archivo es demasiado grande para una transcripción. ¿Es audio? Usa Agregar audios.',
    pasteFirst: 'Pega una transcripción o elige un archivo.',
    consentFirst: 'Confirma que todos estuvieron de acuerdo en ser grabados.',
    failed: 'No se pudo importar esa transcripción.',
    title: 'Importar una transcripción',
    lede: 'Desde Pocket, Otter, Plaud o cualquier grabadora que te dé texto. Recibes las notas, la búsqueda y las personas, igual que con una grabación.',
    close: 'Cerrar',
    loaded: (f) => `Cargado: ${f}`,
    choose: 'Elige un archivo .txt, .srt o .vtt',
    placeholder: '…o pégala aquí. Líneas como\nSofía: Nos encanta la cocina.\nTomás: El estacionamiento es el tema.\nse convierten en personas con nombre.',
    turns: ['intervención', 'intervenciones'],
    noNames: ' · no se encontraron nombres',
    about: (m) => ` · unos ${m} min de conversación`,
    titleLabel: 'Título',
    optional: 'opcional',
    titlePh: 'p. ej. Visita calle Los Aromos',
    who: 'Quién estuvo en esta reunión',
    consent: 'Todas las personas de esta conversación aceptaron ser grabadas.',
    cancel: 'Cancelar',
    importing: 'Importando…',
    submit: 'Importar y escribir notas',
  },
  pt: {
    tooLarge: 'Esse arquivo é grande demais para uma transcrição. É áudio? Use Adicionar áudios.',
    pasteFirst: 'Cole uma transcrição ou escolha um arquivo.',
    consentFirst: 'Confirme que todos concordaram em ser gravados.',
    failed: 'Não foi possível importar essa transcrição.',
    title: 'Importar uma transcrição',
    lede: 'Do Pocket, Otter, Plaud ou qualquer gravador que te dê texto. Você recebe as notas, a busca e as pessoas, igual a uma gravação.',
    close: 'Fechar',
    loaded: (f) => `Carregado: ${f}`,
    choose: 'Escolha um arquivo .txt, .srt ou .vtt',
    placeholder: '…ou cole aqui. Linhas como\nSofia: Adoramos a cozinha.\nTomás: A vaga é o problema.\nviram pessoas com nome.',
    turns: ['fala', 'falas'],
    noNames: ' · nenhum nome encontrado',
    about: (m) => ` · cerca de ${m} min de conversa`,
    titleLabel: 'Título',
    optional: 'opcional',
    titlePh: 'ex.: Visita Rua das Palmeiras',
    who: 'Quem estava nesta reunião',
    consent: 'Todas as pessoas desta conversa concordaram em ser gravadas.',
    cancel: 'Cancelar',
    importing: 'Importando…',
    submit: 'Importar e escrever notas',
  },
}

export default function TranscriptImport({
  people,
  onClose,
  onImported,
}: {
  people: PersonCard[]
  onClose: () => void
  onImported: (id: string) => void
}) {
  const T = useCopy(TI)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Portalled into .pen-root (where the fonts and tokens live), never rendered in place. The
  // button that opens this sits in the sidebar, which on a phone is a transformed drawer: a
  // fixed-position dialog inside it is trapped in the drawer's 320px box, half drawn, with
  // its backdrop swallowing every tap on the page. That shipped once and was rolled back.
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])

  const preview = useMemo(() => (text.trim() ? parseTranscript(text) : null), [text])
  const speakers = preview ? Object.values(preview.names) : []

  async function readFile(f: File) {
    setErr(null)
    if (f.size > 2_000_000) return setErr(T.tooLarge)
    setText(await f.text())
    setFileName(f.name)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 90))
  }

  async function submit() {
    if (!text.trim()) return setErr(T.pasteFirst)
    if (!consent) return setErr(T.consentFirst)
    setBusy(true)
    setErr(null)
    try {
      const j = await postJson<{ id: string }>('/api/pen/import-transcript', {
        text,
        title: title.trim() || undefined,
        source_name: fileName ?? undefined,
        people: picked.map((p) => (p.id ? { id: p.id } : { name: p.name })),
        consent: true,
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
          <label className="pen-tximp-file">
            <input type="file" accept=".txt,.srt,.vtt,.md,text/plain" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
            <span>{fileName ? T.loaded(fileName) : T.choose}</span>
          </label>
          <textarea
            id="tximp-text"
            className="pen-tximp-text"
            rows={9}
            value={text}
            onChange={(e) => { setText(e.target.value); setFileName(null) }}
            placeholder={T.placeholder}
          />
          {preview && (
            <p className="pen-tximp-preview">
              {`${preview.utterances.length} ${preview.utterances.length === 1 ? T.turns[0] : T.turns[1]}`}
              {speakers.length ? ` · ${speakers.join(', ')}` : T.noNames}
              {preview.estSec ? T.about(Math.max(1, Math.round(preview.estSec / 60))) : ''}
            </p>
          )}

          <label className="pen-su-field">
            <span className="pen-label">{T.titleLabel} <em>{T.optional}</em></span>
            <input id="tximp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={T.titlePh} maxLength={90} />
          </label>

          <div className="pen-su-field">
            <span className="pen-label">{T.who} <em>{T.optional}</em></span>
            <PeoplePicker people={people} value={picked} onChange={setPicked} />
          </div>

          <button className="pen-consent" data-on={consent} onClick={() => setConsent(!consent)} role="switch" aria-checked={consent} type="button">
            <span className="pen-consent-track"><span className="pen-consent-knob" /></span>
            <span className="pen-consent-text">{T.consent}</span>
          </button>

          {err && <div className="pen-su-err">{err}</div>}
        </div>

        <div className="pen-tximp-foot">
          <button type="button" className="pen-btn" onClick={onClose}>{T.cancel}</button>
          <button type="button" className="pen-btn pen-btn-accent" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? T.importing : T.submit}
          </button>
        </div>
      </div>
    </div>,
    host,
  )
}
