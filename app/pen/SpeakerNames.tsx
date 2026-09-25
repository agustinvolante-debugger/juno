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
import { speakersIn, type SpeakerMap, type SpeakerEntry } from '@/lib/pen/speakers'
import { LANGUAGES, languageName } from '@/lib/pen/profile-fields'
import { getJson, patchJson, postJson, del, errMessage } from '@/lib/pen/http'

type Person = { id: string; name: string }
type Translation = { lang: string; utterances: string[] }

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
        setErr(errMessage(e, 'Could not save the names.'))
      }
    })
  }

  function pick(label: string, value: string) {
    const next: SpeakerMap = { ...latest.current }
    if (value === '') delete next[label]
    else if (value === 'me') next[label] = { name: me || 'You', me: true, source: 'user' }
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
      setErr(errMessage(e, 'Could not translate this transcript.'))
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
        <span className="pen-label">Who&rsquo;s who</span>
        {language && <span className="pen-spkn-lang">{`Spoken in ${languageName(language) ?? language}`}</span>}
      </div>

      <div className="pen-spkn-rows">
        {labels.map((l) => {
          const e = map[l]
          return (
            <div key={l} className="pen-spkn-row" title={firstLine(l)}>
              <span className="pen-spkn-label">
                {`Speaker ${l}`}
                <em>{`${share[l] ?? 0}% of the talking`}</em>
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
                  <input autoFocus value={typed} onChange={(ev) => setTyped(ev.target.value)} placeholder="Their name" />
                  <button type="submit" className="pen-btn">Save</button>
                </form>
              ) : (
                <select value={valueOf(e)} onChange={(ev) => pick(l, ev.target.value)} aria-label={`Who is Speaker ${l}`}>
                  <option value="">Not named</option>
                  <option value="me">{me ? `You (${me})` : 'You'}</option>
                  {people.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>{p.name}</option>
                  ))}
                  {e?.name && !e.me && !e.person_id && !e.same_as && <option value="other">{e.name}</option>}
                  <option value="other">Someone else…</option>
                  {labels.filter((x) => x !== l).map((x) => (
                    <option key={x} value={`same:${x}`}>{`Same person as Speaker ${x}`}</option>
                  ))}
                </select>
              )}
              {e?.source === 'auto' && <span className="pen-spkn-auto">matched by voice</span>}
            </div>
          )
        })}
      </div>

      {changed && (
        <div className="pen-spkn-update">
          <span>The notes were written with the old names.</span>
          <button type="button" className="pen-btn pen-btn-accent" onClick={() => { setChanged(false); onUpdateNotes() }}>
            Update notes with these names
          </button>
        </div>
      )}

      <div className="pen-spkn-translate">
        {translation ? (
          <>
            <button type="button" className="pen-btn" onClick={() => onShowTranslation(!showTranslation)}>
              {showTranslation ? 'Hide translation' : `Show ${languageName(translation.lang)} translation`}
            </button>
            <button type="button" className="pen-spkn-link" onClick={dropTranslation}>Remove translation</button>
          </>
        ) : (
          <>
            <span className="pen-label">Translate transcript to</span>
            <select value={lang} onChange={(ev) => setLang(ev.target.value)} aria-label="Translate to">
              {LANGUAGES.filter((x) => x.code !== language).map((x) => (
                <option key={x.code} value={x.code}>{x.name}</option>
              ))}
            </select>
            <button type="button" className="pen-btn" onClick={translate} disabled={translating}>
              {translating ? 'Translating…' : 'Translate'}
            </button>
          </>
        )}
      </div>

      {err && <div className="pen-su-err">{err}</div>}
    </div>
  )
}
