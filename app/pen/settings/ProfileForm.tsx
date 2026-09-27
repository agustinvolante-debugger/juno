'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ROLES, LANGUAGES, APP_LANGUAGES, roleOf, type AgentProfile, type Question } from '@/lib/pen/profile-fields'
import { putJson, errMessage } from '@/lib/pen/http'
import { useRouter } from 'next/navigation'
import { useCopy, useLang } from '../LangContext'
import { languageLabel, type Copy, type Lang } from '@/lib/pen/i18n'
import { roleText, questionText, optionText } from '@/lib/pen/profile-fields-i18n'

const PF_EN = {
  saveFailed: 'Could not save your profile.',
  title: 'Profile',
  lede: 'Juno Pen reads this before it writes your notes, so it knows what matters to you and how to spell the names you use. Everything here is optional.',
  name: 'Name',
  whatDo: 'What do you do?',
  anything: 'Anything else Juno Pen should know',
  anythingPh: 'e.g. I record client calls, and voice memos on the drive home',
  noteStyle: 'How you like your notes',
  short: 'Short',
  shortHint: 'Bullets, the fewest words that keep every fact.',
  detailed: 'Detailed',
  detailedHint: 'Specifics, numbers, and who said what.',
  appLanguage: 'App language',
  speak: 'Languages you speak on recordings',
  pickAny: 'pick any',
  notesIn: 'Write my notes in',
  recLang: 'The language of the recording',
  always: (l: string) => `Always ${l}`,
  vocab: 'Names and terms to spell right',
  perLine: 'one per line',
  vocabPh: 'People, places, products, jargon\ne.g. Dr. Okonkwo\nEBITDA',
  saving: 'Saving…',
  save: 'Save profile',
  saved: 'Saved. Your next notes will use it.',
}

const PF: Copy<typeof PF_EN> = {
  en: PF_EN,
  es: {
    saveFailed: 'No se pudo guardar tu perfil.',
    title: 'Perfil',
    lede: 'Juno Pen lee esto antes de escribir tus notas, para saber qué te importa y cómo se escriben los nombres que usas. Todo es opcional.',
    name: 'Nombre',
    whatDo: '¿A qué te dedicas?',
    anything: 'Algo más que Juno Pen deba saber',
    anythingPh: 'p. ej. Grabo reuniones con clientes y notas de voz de camino a casa',
    noteStyle: 'Cómo te gustan las notas',
    short: 'Cortas',
    shortHint: 'Viñetas, las menos palabras que mantengan cada dato.',
    detailed: 'Detalladas',
    detailedHint: 'Detalles, cifras y quién dijo qué.',
    appLanguage: 'Idioma de la app',
    speak: 'Idiomas que hablas en las grabaciones',
    pickAny: 'elige los que quieras',
    notesIn: 'Escribir mis notas en',
    recLang: 'El idioma de la grabación',
    always: (l) => `Siempre en ${l.toLowerCase()}`,
    vocab: 'Nombres y términos que hay que escribir bien',
    perLine: 'uno por línea',
    vocabPh: 'Personas, lugares, productos, jerga\np. ej. Dra. Undurraga\nEBITDA',
    saving: 'Guardando…',
    save: 'Guardar perfil',
    saved: 'Guardado. Tus próximas notas lo usarán.',
  },
  pt: {
    saveFailed: 'Não foi possível salvar seu perfil.',
    title: 'Perfil',
    lede: 'O Juno Pen lê isto antes de escrever suas notas, para saber o que importa para você e como se escrevem os nomes que você usa. Tudo é opcional.',
    name: 'Nome',
    whatDo: 'O que você faz?',
    anything: 'Algo mais que o Juno Pen deveria saber',
    anythingPh: 'ex.: Gravo reuniões com clientes e áudios no caminho de casa',
    noteStyle: 'Como você gosta das notas',
    short: 'Curtas',
    shortHint: 'Tópicos, o mínimo de palavras sem perder nenhum fato.',
    detailed: 'Detalhadas',
    detailedHint: 'Detalhes, números e quem disse o quê.',
    appLanguage: 'Idioma do app',
    speak: 'Idiomas que você fala nas gravações',
    pickAny: 'escolha quantos quiser',
    notesIn: 'Escrever minhas notas em',
    recLang: 'O idioma da gravação',
    always: (l) => `Sempre em ${l.toLowerCase()}`,
    vocab: 'Nomes e termos para escrever certo',
    perLine: 'um por linha',
    vocabPh: 'Pessoas, lugares, produtos, jargões\nex.: Dra. Figueiredo\nEBITDA',
    saving: 'Salvando…',
    save: 'Salvar perfil',
    saved: 'Salvo. Suas próximas notas vão usar isto.',
  },
}

/**
 * What the user tells us about themselves. Broad first: what they do. That answer opens the
 * questions that only make sense for it (a student's major, a realtor's brokerage), then a
 * few that apply to everyone. Every field is optional, and a blank profile writes the same
 * notes as before.
 */
export default function ProfileForm({ initial, loadError }: { initial: AgentProfile; loadError: string | null }) {
  const T = useCopy(PF)
  const lang = useLang()
  const router = useRouter()
  const langName = (code: string, name: string) => languageLabel(code, lang) ?? name
  const [p, setP] = useState<AgentProfile>(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [err, setErr] = useState<string | null>(loadError)
  const baseRole = roleOf(p.role)
  const role = baseRole && roleText(baseRole, lang)

  const set = <K extends keyof AgentProfile>(k: K, v: AgentProfile[K]) => {
    setP((prev) => ({ ...prev, [k]: v }))
    setState('idle')
  }
  const answer = (key: string, v: string | string[]) => {
    setP((prev) => ({ ...prev, answers: { ...(prev.answers ?? {}), [key]: v } }))
    setState('idle')
  }
  // Answers belong to a role. Switching drops them here, and the server drops them anyway,
  // so the form never shows answers that will not be saved.
  const pickRole = (value: string) => {
    if (value === p.role) return
    setP((prev) => ({ ...prev, role: value, answers: {} }))
    setState('idle')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setState('saving')
    try {
      const j = await putJson<{ profile: AgentProfile }>('/api/pen/profile', { profile: p })
      setP(j.profile)
      setState('saved')
      // A new app language: re-render Settings (and the app, next time it loads) in it.
      if ((j.profile.appLanguage ?? 'en') !== lang) router.refresh()
    } catch (e) {
      setErr(errMessage(e, T.saveFailed))
      setState('idle')
    }
  }

  return (
    <form onSubmit={save} className="pen-set-card">
      <div className="pen-set-card-head">
        <h2 className="pen-set-h2">{T.title}</h2>
        <p className="pen-set-lede">{T.lede}</p>
      </div>

      {err && <div className="pen-su-err">{err}</div>}

      <label className="pen-su-field">
        <span className="pen-label">{T.name}</span>
        <input value={p.name ?? ''} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
      </label>

      <fieldset className="pen-su-choice">
        <legend className="pen-label">{T.whatDo}</legend>
        <div className="pen-set-roles">
          {ROLES.map((r0) => roleText(r0, lang)).map((r) => (
            <button
              type="button"
              key={r.value}
              className="pen-su-opt"
              data-on={p.role === r.value}
              aria-pressed={p.role === r.value}
              onClick={() => pickRole(r.value)}
            >
              <strong>{r.title}</strong>
              <span>{r.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <AnimatePresence mode="wait" initial={false}>
        {role && (
          <motion.div
            key={role.value}
            className="pen-set-follow"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="pen-set-follow-head">{role.followTitle}</div>
            <label className="pen-su-field">
              <span className="pen-label">{role.orgLabel}</span>
              <input value={p.org ?? ''} onChange={(e) => set('org', e.target.value)} placeholder={role.orgPlaceholder} />
            </label>
            {role.questions.map((q) => (
              <Field key={q.key} role={role.value} lang={lang} pickAny={T.pickAny} q={q} value={p.answers?.[q.key]} onChange={(v) => answer(q.key, v)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <label className="pen-su-field">
        <span className="pen-label">{T.anything}</span>
        <textarea
          rows={2}
          value={p.useFor ?? ''}
          onChange={(e) => set('useFor', e.target.value)}
          placeholder={T.anythingPh}
        />
      </label>

      <fieldset className="pen-su-choice">
        <legend className="pen-label">{T.noteStyle}</legend>
        <div className="pen-su-choice-row">
          <button type="button" className="pen-su-opt" data-on={p.noteStyle === 'short'} onClick={() => set('noteStyle', 'short')}>
            <strong>{T.short}</strong>
            <span>{T.shortHint}</span>
          </button>
          <button type="button" className="pen-su-opt" data-on={p.noteStyle === 'detailed'} onClick={() => set('noteStyle', 'detailed')}>
            <strong>{T.detailed}</strong>
            <span>{T.detailedHint}</span>
          </button>
        </div>
      </fieldset>

      <label className="pen-su-field">
        <span className="pen-label">{T.appLanguage}</span>
        <select id="profile-app-language" value={p.appLanguage ?? 'en'} onChange={(e) => set('appLanguage', e.target.value)}>
          {APP_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
      </label>

      <fieldset className="pen-su-choice">
        <legend className="pen-label">{T.speak} <em>{T.pickAny}</em></legend>
        <div className="pen-set-chips">
          {LANGUAGES.map((l) => {
            const on = (p.languages ?? []).includes(l.code)
            return (
              <button
                type="button"
                key={l.code}
                className="pen-set-chip"
                data-on={on}
                aria-pressed={on}
                onClick={() => set('languages', on ? (p.languages ?? []).filter((c) => c !== l.code) : [...(p.languages ?? []), l.code])}
              >
                {langName(l.code, l.name)}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="pen-su-field">
        <span className="pen-label">{T.notesIn}</span>
        <select value={p.notesLanguage ?? ''} onChange={(e) => set('notesLanguage', e.target.value || undefined)}>
          <option value="">{T.recLang}</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{T.always(langName(l.code, l.name))}</option>
          ))}
        </select>
      </label>

      <label className="pen-su-field">
        <span className="pen-label">{T.vocab} <em>{T.perLine}</em></span>
        <textarea
          rows={4}
          value={p.vocabulary ?? ''}
          onChange={(e) => set('vocabulary', e.target.value)}
          placeholder={T.vocabPh}
        />
      </label>

      <div className="pen-set-actions">
        <button type="submit" className="pen-btn pen-btn-accent" disabled={state === 'saving'}>
          {state === 'saving' ? T.saving : T.save}
        </button>
        {state === 'saved' && <span className="pen-set-saved" role="status">{T.saved}</span>}
      </div>
    </form>
  )
}

/** One role question, drawn from its spec in lib/pen/profile-fields. */
function Field({ q, value, onChange, role, lang, pickAny }: { q: Question; value: string | string[] | undefined; onChange: (v: string | string[]) => void; role: string; lang: Lang; pickAny: string }) {
  const qt = questionText(role, q, lang)
  if (q.kind === 'chips') {
    const picked = Array.isArray(value) ? value : []
    return (
      <fieldset className="pen-su-choice">
        <legend className="pen-label">{qt.label}{!q.single && <em>{pickAny}</em>}</legend>
        <div className="pen-set-chips">
          {q.options.map((o) => (
            <button
              type="button"
              key={o}
              className="pen-set-chip"
              data-on={picked.includes(o)}
              aria-pressed={picked.includes(o)}
              onClick={() =>
                onChange(picked.includes(o) ? picked.filter((x) => x !== o) : q.single ? [o] : [...picked, o])
              }
            >
              {optionText(o, lang)}
            </button>
          ))}
        </div>
      </fieldset>
    )
  }
  if (q.kind === 'choice') {
    return (
      <fieldset className="pen-su-choice">
        <legend className="pen-label">{qt.label}</legend>
        <div className="pen-su-choice-row">
          {q.options.map((o) => (
            <button type="button" key={o.value} className="pen-su-opt" data-on={value === o.value} onClick={() => onChange(o.value)}>
              <strong>{optionText(o.title, lang)}</strong>
              <span>{optionText(o.hint, lang)}</span>
            </button>
          ))}
        </div>
      </fieldset>
    )
  }
  const text = typeof value === 'string' ? value : ''
  return (
    <label className="pen-su-field">
      <span className="pen-label">{qt.label}</span>
      {q.kind === 'textarea' ? (
        <textarea rows={3} value={text} onChange={(e) => onChange(e.target.value)} placeholder={qt.placeholder} />
      ) : (
        <input value={text} onChange={(e) => onChange(e.target.value)} placeholder={qt.placeholder} />
      )}
    </label>
  )
}
