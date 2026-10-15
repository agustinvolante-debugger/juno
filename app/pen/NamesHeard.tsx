'use client'

// "Names heard": every personal name said on the recording, with when, who said it and a few
// words of context, inside the People section. Most of them are people the user will never
// add (a boss mentioned, a friend of a friend), so they are a list to look through and search,
// not suggestions: one tap adds the ones worth keeping.

import { useEffect, useMemo, useState } from 'react'
import { useCopy, useLang } from './LangContext'
import Icon from './Icon'
import { SPEAKER_WORD, type Copy } from '@/lib/pen/i18n'
import { clock, namesHeard } from '@/lib/pen/name-hints'
import { foldName, speakerName, type SpeakerMap } from '@/lib/pen/speakers'
import { useNames, namesAction } from './names-store'
import { errMessage } from '@/lib/pen/http'

const NH_EN = {
  title: 'Names heard',
  lede: 'Every name said on this call, and when. Open one to see who said it.',
  find: 'Find a name',
  talkedTo: 'spoke with them',
  saidBy: (who: string) => `said by ${who}`,
  you: 'You',
  add: 'Add to People',
  added: 'In People',
  showAll: (n: number) => `Show all ${n}`,
  showLess: 'Show fewer',
  none: 'No names were said on this call.',
  noMatch: 'No name matches.',
  scan: 'Find the names said on this call',
  scanning: 'Listening for names…',
  scanFailed: 'Could not look for names. Try again in a minute.',
  pending: 'Looking for names said on this call…',
  jump: (t: string) => `Go to ${t} in the transcript`,
  times: (n: number) => `${n}×`,
}

const NH: Copy<typeof NH_EN> = {
  en: NH_EN,
  es: {
    title: 'Nombres escuchados',
    lede: 'Cada nombre dicho en esta reunión, y cuándo. Abre uno para ver quién lo dijo.',
    find: 'Buscar un nombre',
    talkedTo: 'hablaste con esta persona',
    saidBy: (who) => `lo dijo ${who}`,
    you: 'Tú',
    add: 'Agregar a Personas',
    added: 'En Personas',
    showAll: (n) => `Ver los ${n}`,
    showLess: 'Ver menos',
    none: 'No se dijo ningún nombre en esta reunión.',
    noMatch: 'Ningún nombre coincide.',
    scan: 'Buscar los nombres dichos en esta reunión',
    scanning: 'Buscando nombres…',
    scanFailed: 'No se pudieron buscar los nombres. Inténtalo en un minuto.',
    pending: 'Buscando los nombres dichos en esta reunión…',
    jump: (t) => `Ir a ${t} en la transcripción`,
    times: (n) => `${n}×`,
  },
  pt: {
    title: 'Nomes ouvidos',
    lede: 'Cada nome dito nesta reunião, e quando. Abra um para ver quem disse.',
    find: 'Buscar um nome',
    talkedTo: 'você falou com essa pessoa',
    saidBy: (who) => `dito por ${who}`,
    you: 'Você',
    add: 'Adicionar a Pessoas',
    added: 'Em Pessoas',
    showAll: (n) => `Ver todos os ${n}`,
    showLess: 'Ver menos',
    none: 'Nenhum nome foi dito nesta reunião.',
    noMatch: 'Nenhum nome corresponde.',
    scan: 'Buscar os nomes ditos nesta reunião',
    scanning: 'Procurando nomes…',
    scanFailed: 'Não foi possível buscar os nomes. Tente de novo em um minuto.',
    pending: 'Procurando os nomes ditos nesta reunião…',
    jump: (t) => `Ir para ${t} na transcrição`,
    times: (n) => `${n}×`,
  },
}

const SHOWN = 8

export type Part = { id: string; offset: number; labels: string[]; map: SpeakerMap | null; fresh: boolean }

export default function NamesHeard({
  parts,
  linked,
  busy,
  onAdd,
  onJump,
}: {
  /** The recording, and the later parts of a joined meeting, with each part's start in seconds. */
  parts: Part[]
  /** Names already in People on this recording. */
  linked: string[]
  busy: boolean
  onAdd: (name: string) => void
  onJump?: (sessionId: string, utterance: number) => void
}) {
  const T = useCopy(NH)
  const lang = useLang()
  const { data, reload } = useNames(parts.map((p) => p.id))
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [gaveUp, setGaveUp] = useState(false)
  const scanned = !!data && parts.every((p) => data.recordings[p.id]?.names_at)
  const waiting = !!data && !scanned && !gaveUp && parts.some((p) => p.fresh)

  // A recording that has just been written up gets its names a few seconds after the notes:
  // look again a few times rather than show a button for something already on its way.
  useEffect(() => {
    if (!waiting) return
    let n = 0
    // Still nothing after two minutes: offer the button instead of waiting forever.
    const t = setInterval(() => { if (++n > 8) { clearInterval(t); setGaveUp(true) } else reload() }, 15000)
    return () => clearInterval(t)
  }, [waiting, reload])

  const names = useMemo(() => {
    if (!data) return []
    const flat = parts.flatMap((p) =>
      (data.recordings[p.id]?.mentions ?? []).map((m) => ({ ...m, at_sec: m.at_sec + p.offset, part: p })),
    )
    // Fillers are spotted within each part (labels restart per file), then pooled.
    const keep = new Set(parts.flatMap((p) =>
      namesHeard(data.recordings[p.id]?.mentions ?? [], data.me, p.labels).map((n) => foldName(n.name)),
    ))
    return namesHeard(flat, data.me).filter((n) => keep.has(foldName(n.name)) && !n.me)
  }, [data, parts])

  const have = new Set(linked.map((n) => foldName(n)))
  const shown = q.trim()
    ? names.filter((n) => foldName(`${n.name} ${n.moments.map((m) => m.context ?? '').join(' ')}`).includes(foldName(q)))
    : all ? names : names.slice(0, SHOWN)

  async function scan() {
    setScanning(true)
    setErr(null)
    try {
      const next = await namesAction({ action: 'scan', ids: parts.map((p) => p.id) })
      if (!parts.every((p) => next.recordings[p.id]?.names_at)) setErr(T.scanFailed)
    } catch (e) {
      setErr(errMessage(e, T.scanFailed))
    } finally {
      setScanning(false)
    }
  }

  if (!data) return null

  const who = (m: (typeof names)[number]['moments'][number] & { part?: Part }) => {
    if (!m.said_by) return null
    const map = m.part?.map ?? null
    return map?.[m.said_by]?.me ? T.you : speakerName(map, m.said_by, { word: SPEAKER_WORD[lang] })
  }

  return (
    <div className="pen-heard">
      <div className="pen-heard-head">
        <span className="pen-label">{T.title}{names.length ? <span className="pen-heard-n"> · {names.length}</span> : null}</span>
        {names.length > SHOWN && (
          <label className="pen-heard-find">
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.find} aria-label={T.find} />
          </label>
        )}
      </div>

      {!scanned ? (
        waiting ? (
          <p className="pen-heard-lede">{T.pending}</p>
        ) : (
          <button type="button" className="pen-people-add" disabled={scanning} onClick={() => void scan()}>
            <Icon name="mic" size={15} />
            {scanning ? T.scanning : T.scan}
          </button>
        )
      ) : names.length === 0 ? (
        <p className="pen-heard-lede">{T.none}</p>
      ) : (
        <>
          <p className="pen-heard-lede">{T.lede}</p>
          <ul className="pen-heard-list">
            {shown.map((n) => {
              const key = foldName(n.name)
              const isOpen = open === key
              const first = n.moments[0] as (typeof n.moments)[number] & { part?: Part }
              const context = n.moments.find((m) => m.context)?.context
              const inPeople = have.has(key)
              return (
                <li key={key} className="pen-heard-item" data-open={isOpen}>
                  <button type="button" className="pen-heard-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                    <span className="pen-heard-name">{n.name}</span>
                    <span className="pen-heard-count">{T.times(n.count)}</span>
                    {n.present && <span className="pen-heard-tag">{T.talkedTo}</span>}
                    <span className="pen-heard-ctx">{context}</span>
                    <span className="pen-heard-at">{clock(first.at_sec)}</span>
                    <Icon name="chevron" size={14} />
                  </button>
                  {isOpen && (
                    <div className="pen-heard-more">
                      <ol className="pen-heard-moments">
                        {n.moments.map((m0, i) => {
                          const m = m0 as typeof first
                          const by = who(m)
                          return (
                            <li key={i}>
                              {onJump && m.part ? (
                                <button type="button" className="pen-heard-time" onClick={() => onJump(m.part!.id, m.utterance)} aria-label={T.jump(clock(m.at_sec))}>
                                  {clock(m.at_sec)}
                                </button>
                              ) : (
                                <span className="pen-heard-time">{clock(m.at_sec)}</span>
                              )}
                              <span className="pen-heard-mctx">
                                {m.context}
                                {by && <em>{T.saidBy(by)}</em>}
                              </span>
                            </li>
                          )
                        })}
                      </ol>
                      {inPeople ? (
                        <span className="pen-heard-in"><Icon name="check" size={14} />{T.added}</span>
                      ) : (
                        <button type="button" className="pen-person-sugg-add" disabled={busy} onClick={() => onAdd(n.name)}>
                          <Icon name="plus" size={14} />
                          {T.add}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {q.trim() && !shown.length && <p className="pen-heard-lede">{T.noMatch}</p>}
          {!q.trim() && names.length > SHOWN && (
            <button type="button" className="pen-people-sugg-all pen-heard-all" onClick={() => setAll(!all)}>
              {all ? T.showLess : T.showAll(names.length)}
            </button>
          )}
        </>
      )}
      {err && <p className="pen-people-err">{err}</p>}
    </div>
  )
}
