'use client'

// "Who's who" above the transcript: name each speaker label, and translate on demand.
//
// Speaker labels come from AssemblyAI; names come from speaker identification (automatic) or
// from here (the user). A label can be a contact, the user, a typed name, or "same person as
// Speaker B" when the transcriber split one voice in two. Names are saved beside the
// transcript, never into it. Changing them offers to rewrite the notes, which were written
// with the old names.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Utterance } from '@/lib/pen/store'
import { speakersIn, resolve, foldName, type SpeakerMap, type SpeakerEntry } from '@/lib/pen/speakers'
import { speakerSuggestions, namesHeard, type NameOption } from '@/lib/pen/name-hints'
import { useNames } from './names-store'
import { LANGUAGES } from '@/lib/pen/profile-fields'
import { useCopy, useLang } from './LangContext'
import { languageLabel, SPEAKER_WORD, type Copy } from '@/lib/pen/i18n'
import { getJson, patchJson, postJson, del, errMessage } from '@/lib/pen/http'

type Person = { id: string; name: string }
type Translation = { lang: string; utterances: string[] }

const SN_EN = {
  saveFailed: 'Could not save the names.',
  translateFailed: 'Could not translate this transcript.',
  you: 'You',
  whosWho: 'Who’s who',
  spokenIn: (l: string) => `Spoken in ${l}`,
  share: (n: number) => `${n}% of the talking`,
  theirName: 'Their name',
  save: 'Save',
  whoIs: (s: string) => `Who is ${s}`,
  notNamed: 'Not named',
  youAre: (me: string) => `You (${me})`,
  someoneElse: 'Someone else…',
  samePerson: (s: string) => `Same person as ${s}`,
  byVoice: 'matched by voice',
  oldNames: 'The notes were written with the old names.',
  updateNotes: 'Update notes with these names',
  hideTr: 'Hide translation',
  showTr: (l: string) => `Show ${l} translation`,
  removeTr: 'Remove translation',
  translateTo: 'Translate transcript to',
  translateAria: 'Translate to',
  translating: 'Translating…',
  translate: 'Translate',
  likely: 'Likely',
  pickAria: (n: string, s: string) => `${s} is ${n}`,
  heardGroup: 'Names heard on this call',
  why: (o: NameOption) => o.self ? 'says it’s their name' : o.introduced && !o.called ? 'introduced by name' : `called by name ${o.called + o.introduced}×`,
}

const SN: Copy<typeof SN_EN> = {
  en: SN_EN,
  es: {
    saveFailed: 'No se pudieron guardar los nombres.',
    translateFailed: 'No se pudo traducir esta transcripción.',
    you: 'Tú',
    whosWho: 'Quién es quién',
    spokenIn: (l) => `Hablado en ${l.toLowerCase()}`,
    share: (n) => `${n}% de lo hablado`,
    theirName: 'Su nombre',
    save: 'Guardar',
    whoIs: (s) => `¿Quién es ${s}?`,
    notNamed: 'Sin nombre',
    youAre: (me) => `Tú (${me})`,
    someoneElse: 'Otra persona…',
    samePerson: (s) => `La misma que ${s}`,
    byVoice: 'reconocido por la voz',
    oldNames: 'Las notas se escribieron con los nombres anteriores.',
    updateNotes: 'Actualizar las notas con estos nombres',
    hideTr: 'Ocultar traducción',
    showTr: (l) => `Ver traducción al ${l.toLowerCase()}`,
    removeTr: 'Quitar traducción',
    translateTo: 'Traducir la transcripción al',
    translateAria: 'Traducir al',
    translating: 'Traduciendo…',
    translate: 'Traducir',
    likely: 'Puede ser',
    pickAria: (n, s) => `${s} es ${n}`,
    heardGroup: 'Nombres escuchados en esta reunión',
    why: (o) => o.self ? 'dice que se llama así' : o.introduced && !o.called ? 'lo presentaron por su nombre' : `le dicen así ${o.called + o.introduced}×`,
  },
  pt: {
    saveFailed: 'Não foi possível salvar os nomes.',
    translateFailed: 'Não foi possível traduzir esta transcrição.',
    you: 'Você',
    whosWho: 'Quem é quem',
    spokenIn: (l) => `Falado em ${l.toLowerCase()}`,
    share: (n) => `${n}% da conversa`,
    theirName: 'Nome da pessoa',
    save: 'Salvar',
    whoIs: (s) => `Quem é ${s}`,
    notNamed: 'Sem nome',
    youAre: (me) => `Você (${me})`,
    someoneElse: 'Outra pessoa…',
    samePerson: (s) => `A mesma que ${s}`,
    byVoice: 'reconhecido pela voz',
    oldNames: 'As notas foram escritas com os nomes antigos.',
    updateNotes: 'Atualizar as notas com estes nomes',
    hideTr: 'Esconder tradução',
    showTr: (l) => `Ver tradução em ${l.toLowerCase()}`,
    removeTr: 'Remover tradução',
    translateTo: 'Traduzir a transcrição para',
    translateAria: 'Traduzir para',
    translating: 'Traduzindo…',
    translate: 'Traduzir',
    likely: 'Pode ser',
    pickAria: (n, s) => `${s} é ${n}`,
    heardGroup: 'Nomes ouvidos nesta reunião',
    why: (o) => o.self ? 'diz que se chama assim' : o.introduced && !o.called ? 'apresentado pelo nome' : `chamado assim ${o.called + o.introduced}×`,
  },
}

export default function SpeakerNames({
  sessionId,
  utterances,
  initialMap,
  language,
  translation,
  showTranslation,
  onMap,
  onTranslation,
  onShowTranslation,
  onUpdateNotes,
}: {
  sessionId: string
  utterances: Utterance[]
  initialMap: SpeakerMap | null
  language: string | null
  translation: Translation | null
  showTranslation: boolean
  onMap: (m: SpeakerMap) => void
  onTranslation: (t: Translation | null) => void
  onShowTranslation: (v: boolean) => void
  onUpdateNotes: () => void
}) {
  const T = useCopy(SN)
  const appLang = useLang()
  const spk = (l: string) => `${SPEAKER_WORD[appLang]} ${l}`
  const langName = (code: string) => languageLabel(code, appLang) ?? LANGUAGES.find((x) => x.code === code)?.name ?? code
  const [map, setMapState] = useState<SpeakerMap>(initialMap ?? {})
  // The latest names, and the save in flight. Two quick picks used to race: the second built on
  // stale names and whichever PATCH landed last won, silently dropping the other change.
  const latest = useRef<SpeakerMap>(initialMap ?? {})
  const queue = useRef<Promise<void>>(Promise.resolve())
  const setMap = (m: SpeakerMap) => { latest.current = m; setMapState(m) }
  const [people, setPeople] = useState<Person[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [changed, setChanged] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lang, setLang] = useState<string>(LANGUAGES.find((l) => l.code !== language)?.code ?? 'en')
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    setMap(initialMap ?? {})
    setChanged(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    getJson<{ people: Person[]; me: string | null }>(`/api/pen/people?session=${sessionId}`)
      .then((j) => { setPeople(j.people ?? []); setMe(j.me ?? null) })
      .catch(() => {})
  }, [sessionId])

  const labels = useMemo(() => speakersIn(utterances), [utterances])

  // Names said on the call, turned into likely names per voice (lib/pen/name-hints.ts).
  const { data: heard } = useNames([sessionId])
  const mentions = heard?.recordings[sessionId]?.mentions
  const suggest = useMemo(
    () => (mentions?.length ? speakerSuggestions(mentions, utterances.map((u) => u.speaker), { me: heard?.me, resolve: (l) => resolve(map, l).label }) : {}),
    [mentions, utterances, heard?.me, map],
  )
  const heardNames = useMemo(
    () => (mentions?.length ? namesHeard(mentions, heard?.me, utterances.map((u) => u.speaker)).filter((n) => n.present && !n.me).map((n) => n.name) : []),
    [mentions, heard?.me, utterances],
  )
  const [naming, setNaming] = useState<string | null>(null)
  /** Options not already given to another voice (and "You" only while nobody is you). */
  const free = (opts: NameOption[] | undefined) => {
    const taken = new Set(Object.values(map).filter((x) => x.name).map((x) => foldName(x.name)))
    const meTaken = Object.values(map).some((x) => x.me)
    return (opts ?? []).filter((o) => (o.me ? !meTaken : !taken.has(foldName(o.name))))
  }

  /** A suggested or heard name: names the voice and saves them as a contact on this recording. */
  async function pickHeard(label: string, name: string) {
    setNaming(label)
    setErr(null)
    try {
      await queue.current
      const j = await postJson<{ speaker_map: SpeakerMap; person: Person }>('/api/pen/names', { action: 'speaker', id: sessionId, label, name })
      // A new contact joins the menu, so the select can show who this voice now is.
      setPeople((prev) => (prev.some((p) => p.id === j.person.id) ? prev : [...prev, j.person].sort((a, b) => a.name.localeCompare(b.name))))
      setMap(j.speaker_map)
      onMap(j.speaker_map)
      setChanged(true)
    } catch (e) {
      setErr(errMessage(e, T.saveFailed))
    } finally {
      setNaming(null)
    }
  }
  // Share of the words per label, so "Speaker C · 2%" reads as the stray it probably is.
  const share = useMemo(() => {
    const w: Record<string, number> = {}
    let total = 0
    for (const u of utterances) {
      const n = u.text.split(/\s+/).length
      w[u.speaker] = (w[u.speaker] ?? 0) + n
      total += n
    }
    return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round((100 * v) / Math.max(total, 1))]))
  }, [utterances])
  const firstLine = (l: string) => utterances.find((u) => u.speaker === l)?.text.slice(0, 140) ?? ''

  function save(next: SpeakerMap) {
    setMap(next)
    onMap(next)
    setErr(null)
    queue.current = queue.current.then(async () => {
      try {
        // Whatever is newest when this save's turn comes, not what it was when queued.
        await patchJson(`/api/pen/sessions/${sessionId}`, { speaker_map: latest.current })
        setChanged(true)
      } catch (e) {
        setErr(errMessage(e, T.saveFailed))
      }
    })
  }

  function pick(label: string, value: string) {
    const next: SpeakerMap = { ...latest.current }
    if (value.startsWith('heard:')) return void pickHeard(label, value.slice(6))
    if (value === '') delete next[label]
    else if (value === 'me') next[label] = { name: me || T.you, me: true, source: 'user' }
    else if (value.startsWith('same:')) next[label] = { name: '', same_as: value.slice(5), source: 'user' }
    else if (value.startsWith('p:')) {
      const p = people.find((x) => x.id === value.slice(2))
      if (p) next[label] = { name: p.name, person_id: p.id, source: 'user' }
    } else if (value === 'other') {
      setTyping(label)
      setTyped(map[label]?.person_id || map[label]?.me ? '' : map[label]?.name ?? '')
      return
    }
    // Anyone pointing at a label that is now itself merged would chain; fine, resolve() follows it.
    save(next)
  }

  function valueOf(e: SpeakerEntry | undefined): string {
    if (!e) return ''
    if (e.same_as) return `same:${e.same_as}`
    if (e.me) return 'me'
    if (e.person_id) return `p:${e.person_id}`
    return e.name ? 'other' : ''
  }

  async function translate() {
    setTranslating(true)
    setErr(null)
    try {
      const j = await postJson<{ translation: Translation }>('/api/pen/translate', { id: sessionId, lang })
      onTranslation(j.translation)
      onShowTranslation(true)
    } catch (e) {
      setErr(errMessage(e, T.translateFailed))
    } finally {
      setTranslating(false)
    }
  }

  async function dropTranslation() {
    await del(`/api/pen/translate?id=${sessionId}`).catch(() => {})
    onTranslation(null)
    onShowTranslation(false)
  }

  return (
    <div className="pen-spkn">
      <div className="pen-spkn-head">
        <span className="pen-label">{T.whosWho}</span>
        {language && <span className="pen-spkn-lang">{T.spokenIn(langName(language))}</span>}
      </div>

      <div className="pen-spkn-rows">
        {labels.map((l) => {
          const e = map[l]
          return (
            <div key={l} className="pen-spkn-row" title={firstLine(l)}>
              <span className="pen-spkn-label">
                {spk(l)}
                <em>{T.share(share[l] ?? 0)}</em>
              </span>
              {typing === l ? (
                <form
                  className="pen-spkn-type"
                  onSubmit={(ev) => {
                    ev.preventDefault()
                    const n = typed.trim()
                    setTyping(null)
                    if (n) save({ ...latest.current, [l]: { name: n, source: 'user' } })
                  }}
                >
                  <input autoFocus value={typed} onChange={(ev) => setTyped(ev.target.value)} placeholder={T.theirName} />
                  <button type="submit" className="pen-btn">{T.save}</button>
                </form>
              ) : (
                <select value={valueOf(e)} onChange={(ev) => pick(l, ev.target.value)} aria-label={T.whoIs(spk(l))}>
                  <option value="">{T.notNamed}</option>
                  <option value="me">{me ? T.youAre(me) : T.you}</option>
                  {people.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>{p.name}</option>
                  ))}
                  {heardNames.filter((h) => !people.some((p) => foldName(p.name) === foldName(h))).length > 0 && (
                    <optgroup label={T.heardGroup}>
                      {heardNames.filter((h) => !people.some((p) => foldName(p.name) === foldName(h))).map((h) => (
                        <option key={h} value={`heard:${h}`}>{h}</option>
                      ))}
                    </optgroup>
                  )}
                  {e?.name && !e.me && !e.person_id && !e.same_as && <option value="other">{e.name}</option>}
                  <option value="other">{T.someoneElse}</option>
                  {labels.filter((x) => x !== l).map((x) => (
                    <option key={x} value={`same:${x}`}>{T.samePerson(spk(x))}</option>
                  ))}
                </select>
              )}
              {e?.source === 'auto' && <span className="pen-spkn-auto">{T.byVoice}</span>}
              {!e && typing !== l && !!free(suggest[l]).length && (
                <div className="pen-spkn-sugg">
                  <span className="pen-spkn-sugg-label">{T.likely}</span>
                  {free(suggest[l]).map((o) => (
                    <button
                      key={o.name}
                      type="button"
                      className="pen-spkn-chip"
                      disabled={naming === l}
                      aria-label={T.pickAria(o.me ? (me ? T.youAre(me) : T.you) : o.name, spk(l))}
                      onClick={() => (o.me ? pick(l, 'me') : void pickHeard(l, o.name))}
                    >
                      <strong>{o.me ? (me ? T.youAre(me) : T.you) : o.name}</strong>
                      <em>{T.why(o)}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {changed && (
        <div className="pen-spkn-update">
          <span>{T.oldNames}</span>
          <button type="button" className="pen-btn pen-btn-accent" onClick={() => { setChanged(false); onUpdateNotes() }}>
            {T.updateNotes}
          </button>
        </div>
      )}

      <div className="pen-spkn-translate">
        {translation ? (
          <>
            <button type="button" className="pen-btn" onClick={() => onShowTranslation(!showTranslation)}>
              {showTranslation ? T.hideTr : T.showTr(langName(translation.lang))}
            </button>
            <button type="button" className="pen-spkn-link" onClick={dropTranslation}>{T.removeTr}</button>
          </>
        ) : (
          <>
            <span className="pen-label">{T.translateTo}</span>
            <select value={lang} onChange={(ev) => setLang(ev.target.value)} aria-label={T.translateAria}>
              {LANGUAGES.filter((x) => x.code !== language).map((x) => (
                <option key={x.code} value={x.code}>{langName(x.code)}</option>
              ))}
            </select>
            <button type="button" className="pen-btn" onClick={translate} disabled={translating}>
              {translating ? T.translating : T.translate}
            </button>
          </>
        )}
      </div>

      {err && <div className="pen-su-err">{err}</div>}
    </div>
  )
}
