'use client'

// Conversations: the separate conversations inside an event recording, each with its time,
// topic, a line on who it seemed to be with, and the names said in it to pick from. Confirming
// one creates (or links) the contact with where they were met and what about.
//
// Also where conference mode is offered: a long recording with many voices gets a one-line
// suggestion to split it, and "Split into conversations" in the ⋯ menu does it on demand.

import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { useCopy } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'
import { clock, stitch, type NameOption, type Conversation } from '@/lib/pen/name-hints'
import { foldName } from '@/lib/pen/speakers'
import { errMessage, getJson, postJson } from '@/lib/pen/http'
import { useNames, namesAction, startSplit, useSplitting, markCombining, useCombining } from './names-store'
import { LOCALE } from '@/lib/pen/i18n'
import { useLang } from './LangContext'
import type { Part } from './NamesHeard'
import type { SheetRequest } from './DeliverableSheet'

const CV_EN = {
  title: 'Conversations',
  lede: 'Who you talked to, one conversation at a time. Pick a name to save them to People.',
  find: 'Find a conversation',
  findHint: 'e.g. concierge cards',
  who: 'Who was this?',
  typeName: 'Type a name',
  save: 'Save',
  alsoSaid: 'Also mentioned',
  saved: 'In People',
  change: 'Change',
  minutes: (n: number) => `${n} min`,
  talk: 'Talk',
  other: 'Break',
  part: (n: number, at: string) => `Part ${n} · from ${at}`,
  jump: (t: string) => `Go to ${t} in the transcript`,
  noMatch: 'No conversation matches.',
  suggestTitle: 'Sounds like an event with many people.',
  suggestBody: 'Split it into the separate conversations, with the names said in each, so you can find who you talked to about what.',
  split: 'Split into conversations',
  notEvent: 'Not an event',
  splitting: 'Finding the conversations… about half a minute per hour of audio.',
  splitFailed: 'Could not split this recording. Try again in a minute.',
  confirmFailed: 'Could not save that name.',
  pickAria: (n: string, topic: string) => `${n} was the conversation about ${topic}`,
  dayOffer: (n: number, dur: string) => `This day has ${n} more recording${n === 1 ? '' : 's'} (${dur} in all). Combine them into one event so every conversation of the day is in one list.`,
  dayButton: 'Combine this day into one event',
  dayConfirm: (n: number, dur: string, from: string, to: string) => `Combine ${n} recordings (${dur}, ${from}–${to}) into one event? Each keeps its audio, and you can separate them again.`,
  dayGo: 'Combine',
  cancel: 'Cancel',
  combining: 'Combining the day and finding the conversations… about a minute or two.',
  dayFailed: 'Could not combine this day.',
  followUp: 'Follow up',
  email: 'Draft email',
  linkedin: 'LinkedIn note',
  item: (n: string | null, t: string) => `Follow up with ${n ?? 'the person I met'} after our conversation about ${t}`,
  why: (o: NameOption) => o.self ? 'said their name' : o.introduced && !o.called ? 'introduced by name' : o.called ? `called by name ${o.called}×` : `said ${o.mentioned}×`,
}

const CV: Copy<typeof CV_EN> = {
  en: CV_EN,
  es: {
    title: 'Conversaciones',
    lede: 'Con quién hablaste, conversación por conversación. Elige un nombre para guardarlo en Personas.',
    find: 'Buscar una conversación',
    findHint: 'p. ej. tarjetas concierge',
    who: '¿Quién era?',
    typeName: 'Escribe un nombre',
    save: 'Guardar',
    alsoSaid: 'También se nombró a',
    saved: 'En Personas',
    change: 'Cambiar',
    minutes: (n) => `${n} min`,
    talk: 'Charla',
    other: 'Pausa',
    part: (n, at) => `Parte ${n} · desde ${at}`,
    jump: (t) => `Ir a ${t} en la transcripción`,
    noMatch: 'Ninguna conversación coincide.',
    suggestTitle: 'Parece un evento con mucha gente.',
    suggestBody: 'Sepáralo en las distintas conversaciones, con los nombres dichos en cada una, para encontrar con quién hablaste de qué.',
    split: 'Separar en conversaciones',
    notEvent: 'No es un evento',
    splitting: 'Buscando las conversaciones… unos 30 segundos por hora de audio.',
    splitFailed: 'No se pudo separar esta grabación. Inténtalo en un minuto.',
    confirmFailed: 'No se pudo guardar ese nombre.',
    pickAria: (n, topic) => `${n} fue la conversación sobre ${topic}`,
    dayOffer: (n, dur) => `Este día tiene ${n} grabación${n === 1 ? '' : 'es'} más (${dur} en total). Júntalas en un solo evento para ver todas las conversaciones del día en una lista.`,
    dayButton: 'Juntar este día en un solo evento',
    dayConfirm: (n, dur, from, to) => `¿Juntar ${n} grabaciones (${dur}, ${from}–${to}) en un solo evento? Cada una conserva su audio y puedes separarlas de nuevo.`,
    dayGo: 'Juntar',
    cancel: 'Cancelar',
    combining: 'Juntando el día y buscando las conversaciones… uno o dos minutos.',
    dayFailed: 'No se pudo juntar este día.',
    followUp: 'Seguimiento',
    email: 'Borrador de correo',
    linkedin: 'Nota de LinkedIn',
    item: (n, t) => `Hacer seguimiento con ${n ?? 'la persona que conocí'} después de hablar de ${t}`,
    why: (o) => o.self ? 'dijo su nombre' : o.introduced && !o.called ? 'lo presentaron por su nombre' : o.called ? `le dijeron así ${o.called}×` : `se dijo ${o.mentioned}×`,
  },
  pt: {
    title: 'Conversas',
    lede: 'Com quem você falou, uma conversa de cada vez. Escolha um nome para salvar em Pessoas.',
    find: 'Buscar uma conversa',
    findHint: 'ex.: cartões concierge',
    who: 'Quem era?',
    typeName: 'Digite um nome',
    save: 'Salvar',
    alsoSaid: 'Também citado',
    saved: 'Em Pessoas',
    change: 'Trocar',
    minutes: (n) => `${n} min`,
    talk: 'Palestra',
    other: 'Pausa',
    part: (n, at) => `Parte ${n} · a partir de ${at}`,
    jump: (t) => `Ir para ${t} na transcrição`,
    noMatch: 'Nenhuma conversa corresponde.',
    suggestTitle: 'Parece um evento com muita gente.',
    suggestBody: 'Separe nas diferentes conversas, com os nomes ditos em cada uma, para achar com quem você falou sobre o quê.',
    split: 'Separar em conversas',
    notEvent: 'Não é um evento',
    splitting: 'Procurando as conversas… uns 30 segundos por hora de áudio.',
    splitFailed: 'Não foi possível separar esta gravação. Tente de novo em um minuto.',
    confirmFailed: 'Não foi possível salvar esse nome.',
    pickAria: (n, topic) => `${n} foi a conversa sobre ${topic}`,
    dayOffer: (n, dur) => `Este dia tem mais ${n} gravaç${n === 1 ? 'ão' : 'ões'} (${dur} no total). Junte num só evento para ver todas as conversas do dia numa lista.`,
    dayButton: 'Juntar este dia num só evento',
    dayConfirm: (n, dur, from, to) => `Juntar ${n} gravações (${dur}, ${from}–${to}) num só evento? Cada uma mantém seu áudio, e você pode separá-las de novo.`,
    dayGo: 'Juntar',
    cancel: 'Cancelar',
    combining: 'Juntando o dia e procurando as conversas… um ou dois minutos.',
    dayFailed: 'Não foi possível juntar este dia.',
    followUp: 'Acompanhamento',
    email: 'Rascunho de e-mail',
    linkedin: 'Nota do LinkedIn',
    item: (n, t) => `Fazer acompanhamento com ${n ?? 'a pessoa que conheci'} depois da conversa sobre ${t}`,
    why: (o) => o.self ? 'disse o nome' : o.introduced && !o.called ? 'apresentado pelo nome' : o.called ? `chamado assim ${o.called}×` : `dito ${o.mentioned}×`,
  },
}

type Row = Conversation

const dismissKey = (id: string) => `pen-event-no:${id}`

export default function Conversations({
  parts,
  suggest,
  onJump,
  onPeopleChanged,
  onDraft,
  onCombined,
}: {
  /** "Combine this day" made a new event recording: refresh the list and open it. */
  onCombined?: (primaryId: string) => void
  parts: Part[]
  /** Opens the draft sheet for a follow-up on one conversation. */
  onDraft?: (r: SheetRequest) => void
  /** Long, many voices, never split: offer conference mode. */
  suggest: boolean
  onJump: (sessionId: string, utterance: number) => void
  onPeopleChanged?: () => void
}) {
  const T = useCopy(CV)
  const ids = parts.map((p) => p.id)
  const { data, reload } = useNames(ids)
  const { running, error } = useSplitting(ids)
  const [q, setQ] = useState('')
  const [dismissed, setDismissed] = useState(true)
  const [contacts, setContacts] = useState<{ id: string; name: string; company?: string | null }[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const lang = useLang()
  const combiningNow = useCombining(ids[0])
  // The rest of this recording's day, for "Combine this day into one event".
  const [day, setDay] = useState<{ ids: string[]; recordings: number; totalSec: number; from: string | null; to: string | null; ready: boolean } | null>(null)
  const [askDay, setAskDay] = useState(false)
  const [dayBusy, setDayBusy] = useState(false)
  useEffect(() => {
    setDay(null)
    setAskDay(false)
    getJson<{ day: NonNullable<typeof day> }>(`/api/pen/names?day=${ids[0]}`).then((j) => setDay(j.day)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids[0]])
  const moreToday = day ? Math.max(0, day.recordings - 1) : 0
  const hm = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min` }
  const at = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' }) : '')

  async function combineDay() {
    setDayBusy(true)
    setErr(null)
    try {
      const j = await postJson<{ primaryId: string }>('/api/pen/names', { action: 'event-day', id: ids[0] })
      markCombining(j.primaryId)
      setAskDay(false)
      onCombined?.(j.primaryId)
    } catch (e) {
      setErr(errMessage(e, T.dayFailed))
    } finally {
      setDayBusy(false)
    }
  }

  // Just combined: the conversations arrive in a minute or two; look again until they do.
  useEffect(() => {
    if (!combiningNow) return
    const t = setInterval(() => reload(), 10000)
    return () => clearInterval(t)
  }, [combiningNow, reload])

  const dayBlock = moreToday > 0 && day?.ready && !combiningNow ? (
    askDay ? (
      <div className="pen-convo-day" role="group">
        <p>{T.dayConfirm(day.recordings, hm(day.totalSec), at(day.from), at(day.to))}</p>
        <div className="pen-convo-offer-acts">
          <button type="button" className="pen-btn pen-btn-accent" disabled={dayBusy} onClick={() => void combineDay()}>{T.dayGo}</button>
          <button type="button" className="pen-btn" disabled={dayBusy} onClick={() => setAskDay(false)}>{T.cancel}</button>
        </div>
      </div>
    ) : (
      <div className="pen-convo-day">
        <p>{T.dayOffer(moreToday, hm(day.totalSec))}</p>
        <div className="pen-convo-offer-acts">
          <button type="button" className="pen-btn pen-btn-accent" onClick={() => setAskDay(true)}><Icon name="link" size={15} />{T.dayButton}</button>
        </div>
      </div>
    )
  ) : null

  useEffect(() => {
    try { setDismissed(localStorage.getItem(dismissKey(ids[0])) === '1') } catch { setDismissed(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids[0]])

  const rows: Row[] = useMemo(() => {
    if (!data) return []
    return stitch(
      parts.map((p) => ({ id: p.id, offset: p.offset, segments: data.recordings[p.id]?.segments ?? [], mentions: data.recordings[p.id]?.mentions ?? [] })),
      { me: data.me },
    )
  }, [data, parts])

  const eventMode = !!data && parts.some((p) => data.recordings[p.id]?.event_mode)
  const [gaveUp, setGaveUp] = useState(false)
  const pendingSplit = !!data && !gaveUp && eventMode && !rows.length && parts.some((p) => p.fresh && !data.recordings[p.id]?.segments_at)

  // An event recording that was just written up gets its conversations right after its names.
  useEffect(() => {
    if (!pendingSplit) return
    let n = 0
    const t = setInterval(() => { if (++n > 10) { clearInterval(t); setGaveUp(true) } else reload() }, 15000)
    return () => clearInterval(t)
  }, [pendingSplit, reload])

  useEffect(() => {
    if (!rows.length) return
    getJson<{ people: { id: string; name: string; company?: string | null }[] }>('/api/pen/people').then((j) => setContacts(j.people ?? [])).catch(() => {})
  }, [rows.length])

  async function confirm(row: Row, name: string, personId?: string) {
    setBusy(row.key)
    setErr(null)
    try {
      // A conversation the pen cut at the hour is two stretches: both get the name.
      for (const x of row.pieces) await namesAction({ action: 'confirm', id: x.partId, segment: x.seg.id, name, ...(personId ? { personId } : {}) })
      setEditing(null)
      setTyped('')
      onPeopleChanged?.()
    } catch (e) {
      setErr(errMessage(e, T.confirmFailed))
    } finally {
      setBusy(null)
    }
  }

  if (!data) return null

  if (!rows.length) {
    if (running || pendingSplit || combiningNow) {
      return (
        <div className="pen-sec pen-convo-offer" role="status">
          <span className="pen-spin" aria-hidden />
          <p>{combiningNow ? T.combining : T.splitting}</p>
        </div>
      )
    }
    if ((suggest && !dismissed) || (eventMode && !rows.length) || error || (moreToday >= 2 && day?.ready && !dismissed)) {
      return (
        <div className="pen-sec pen-convo-offer">
          <span className="pen-badge" data-tone="accent"><Icon name="people" size={13} /></span>
          <div className="pen-convo-offer-body">
            <p><strong>{T.suggestTitle}</strong> {T.suggestBody}</p>
            {error && <p className="pen-people-err">{T.splitFailed}</p>}
            {dayBlock}
            <div className="pen-convo-offer-acts">
              {/* With more of the day around it, combining is the main step; splitting this one alone is the fallback. */}
              <button type="button" className={`pen-btn ${dayBlock ? '' : 'pen-btn-accent'}`} onClick={() => void startSplit(ids)}>{T.split}</button>
              {!eventMode && (
                <button
                  type="button"
                  className="pen-btn"
                  onClick={() => { setDismissed(true); try { localStorage.setItem(dismissKey(ids[0]), '1') } catch {} }}
                >
                  {T.notEvent}
                </button>
              )}
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  const needle = foldName(q)
  const shown = needle
    ? rows.filter((r) => foldName([r.topic, r.gist, r.confirmed_name, ...r.likely.map((o) => o.name), ...r.mentioned.map((o) => o.name)].filter(Boolean).join(' ')).includes(needle))
    : rows

  return (
    <div className="pen-sec pen-card pen-convo">
      <div className="pen-convo-head">
        <span className="pen-sec-head">
          <span className="pen-badge" data-tone="accent"><Icon name="chat" size={13} /></span>
          {T.title}<span className="pen-heard-n"> · {rows.filter((r) => r.kind !== 'other').length}</span>
        </span>
        {rows.length > 3 && (
          <label className="pen-heard-find">
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.findHint} aria-label={T.find} />
          </label>
        )}
      </div>
      <p className="pen-convo-lede">{T.lede}</p>
      {combiningNow && <p className="pen-convo-lede" role="status">{T.combining}</p>}
      {dayBlock}

      <ol className="pen-convo-list">
        {shown.map((r, i) => {
          const prev = shown[i - 1]
          // File labels help on a meeting the pen cut once or twice; on a voice-activated event
          // day of dozens of files they would sit above nearly every conversation.
          const seam = parts.length > 1 && parts.length <= 3 && (!prev || prev.partIndex !== r.partIndex)
          const mins = Math.max(1, Math.round((r.end_sec - r.start_sec) / 60))
          const saved = !!r.confirmed_name && editing !== r.key
          return (
            <li key={r.key} className="pen-convo-item" data-kind={r.kind}>
              {seam && <div className="pen-convo-seam">{T.part(r.partIndex + 1, clock(parts[r.partIndex]?.offset ?? 0))}</div>}
              <div className="pen-convo-row">
                <button type="button" className="pen-convo-time" onClick={() => onJump(r.pieces[0].partId, r.pieces[0].seg.first_utt)} aria-label={T.jump(clock(r.start_sec))}>
                  <span>{clock(r.start_sec)}</span>
                  <span className="pen-convo-to">{clock(r.end_sec)}</span>
                </button>
                <div className="pen-convo-body">
                  <div className="pen-convo-topic">
                    <strong>{r.topic}</strong>
                    <span className="pen-convo-len">{T.minutes(mins)}</span>
                    {r.kind !== 'conversation' && <span className="pen-convo-kind">{r.kind === 'talk' ? T.talk : T.other}</span>}
                  </div>
                  {r.gist && <p className="pen-convo-gist">{r.gist}</p>}

                  {r.kind !== 'other' && onDraft && (
                    <div className="pen-do pen-convo-do">
                      {(['email', 'linkedin'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className="pen-do-btn"
                          onClick={() => onDraft({
                            kind,
                            item: T.item(r.confirmed_name, r.topic),
                            conversation: {
                              pieces: r.pieces.map((x) => ({ session: x.partId, segment: x.seg.id })),
                              name: r.confirmed_name,
                              // "Alexander Solar" finds him on LinkedIn; "Alexander" alone finds thousands.
                              search: r.confirmed_name ? [r.confirmed_name, contacts.find((c) => c.id === r.person_id)?.company].filter(Boolean).join(' ') : null,
                            },
                          })}
                        >
                          {kind === 'email' ? T.email : T.linkedin}
                        </button>
                      ))}
                    </div>
                  )}

                  {r.kind !== 'other' && (saved ? (
                    <div className="pen-convo-saved">
                      <span className="pen-convo-person"><Icon name="check" size={14} />{r.confirmed_name}</span>
                      <span className="pen-convo-in">{T.saved}</span>
                      <button type="button" className="pen-spkn-link" onClick={() => { setEditing(r.key); setTyped('') }}>{T.change}</button>
                    </div>
                  ) : (
                    <div className="pen-convo-who">
                      <span className="pen-spkn-sugg-label">{T.who}</span>
                      {r.likely.map((o) => (
                        <button key={o.name} type="button" className="pen-spkn-chip" disabled={busy === r.key}
                                aria-label={T.pickAria(o.name, r.topic)} onClick={() => void confirm(r, o.name)}>
                          <strong>{o.name}</strong>
                          <em>{T.why(o)}</em>
                        </button>
                      ))}
                      <form
                        className="pen-convo-type"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const name = (editing === r.key ? typed : '').trim()
                          if (!name) return
                          const c = contacts.find((x) => foldName(x.name) === foldName(name))
                          void confirm(r, c?.name ?? name, c?.id)
                        }}
                      >
                        <input
                          list="pen-convo-contacts"
                          value={editing === r.key ? typed : ''}
                          onFocus={() => { if (editing !== r.key) { setEditing(r.key); setTyped('') } }}
                          onChange={(e) => { setEditing(r.key); setTyped(e.target.value) }}
                          placeholder={T.typeName}
                          aria-label={`${T.typeName}: ${r.topic}`}
                        />
                        {editing === r.key && typed.trim() && (
                          <button type="submit" className="pen-btn pen-btn-accent" disabled={busy === r.key}>{T.save}</button>
                        )}
                      </form>
                      {!!r.mentioned.length && (
                        <p className="pen-convo-also">
                          {T.alsoSaid}{' '}
                          {r.mentioned.map((o, k) => (
                            <span key={o.name}>
                              {k > 0 && ', '}
                              <button type="button" className="pen-convo-also-name" disabled={busy === r.key} onClick={() => void confirm(r, o.name)}>{o.name}</button>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {needle && !shown.length && <p className="pen-convo-lede">{T.noMatch}</p>}
      <datalist id="pen-convo-contacts">
        {contacts.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>
      {err && <p className="pen-people-err">{err}</p>}
    </div>
  )
}
