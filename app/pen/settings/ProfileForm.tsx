'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ROLES, roleOf, type AgentProfile, type Question } from '@/lib/pen/profile-fields'
import { putJson, errMessage } from '@/lib/pen/http'

/**
 * What the user tells us about themselves. Broad first: what they do. That answer opens the
 * questions that only make sense for it (a student's major, a realtor's brokerage), then a
 * few that apply to everyone. Every field is optional, and a blank profile writes the same
 * notes as before.
 */
export default function ProfileForm({ initial, loadError }: { initial: AgentProfile; loadError: string | null }) {
  const [p, setP] = useState<AgentProfile>(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [err, setErr] = useState<string | null>(loadError)
  const role = roleOf(p.role)

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
    } catch (e) {
      setErr(errMessage(e, 'Could not save your profile.'))
      setState('idle')
    }
  }

  return (
    <form onSubmit={save} className="pen-set-card">
      <div className="pen-set-card-head">
        <h2 className="pen-set-h2">Profile</h2>
        <p className="pen-set-lede">
          Juno Pen reads this before it writes your notes, so it knows what matters to you and how to
          spell the names you use. Everything here is optional.
        </p>
      </div>

      {err && <div className="pen-su-err">{err}</div>}

      <label className="pen-su-field">
        <span className="pen-label">Name</span>
        <input value={p.name ?? ''} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
      </label>

      <fieldset className="pen-su-choice">
        <legend className="pen-label">What do you do?</legend>
        <div className="pen-set-roles">
          {ROLES.map((r) => (
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
              <Field key={q.key} q={q} value={p.answers?.[q.key]} onChange={(v) => answer(q.key, v)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <label className="pen-su-field">
        <span className="pen-label">Anything else Juno Pen should know</span>
        <textarea
          rows={2}
          value={p.useFor ?? ''}
          onChange={(e) => set('useFor', e.target.value)}
          placeholder="e.g. I record client calls, and voice memos on the drive home"
        />
      </label>

      <fieldset className="pen-su-choice">
        <legend className="pen-label">How you like your notes</legend>
        <div className="pen-su-choice-row">
          <button type="button" className="pen-su-opt" data-on={p.noteStyle === 'short'} onClick={() => set('noteStyle', 'short')}>
            <strong>Short</strong>
            <span>Bullets, the fewest words that keep every fact.</span>
          </button>
          <button type="button" className="pen-su-opt" data-on={p.noteStyle === 'detailed'} onClick={() => set('noteStyle', 'detailed')}>
            <strong>Detailed</strong>
            <span>Specifics, numbers, and who said what.</span>
          </button>
        </div>
      </fieldset>

      <label className="pen-su-field">
        <span className="pen-label">Names and terms to spell right <em>one per line</em></span>
        <textarea
          rows={4}
          value={p.vocabulary ?? ''}
          onChange={(e) => set('vocabulary', e.target.value)}
          placeholder={'People, places, products, jargon\ne.g. Dr. Okonkwo\nEBITDA'}
        />
      </label>

      <div className="pen-set-actions">
        <button type="submit" className="pen-btn pen-btn-accent" disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save profile'}
        </button>
        {state === 'saved' && <span className="pen-set-saved" role="status">Saved. Your next notes will use it.</span>}
      </div>
    </form>
  )
}

/** One role question, drawn from its spec in lib/pen/profile-fields. */
function Field({ q, value, onChange }: { q: Question; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  if (q.kind === 'chips') {
    const picked = Array.isArray(value) ? value : []
    return (
      <fieldset className="pen-su-choice">
        <legend className="pen-label">{q.label}{!q.single && <em>pick any</em>}</legend>
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
              {o}
            </button>
          ))}
        </div>
      </fieldset>
    )
  }
  if (q.kind === 'choice') {
    return (
      <fieldset className="pen-su-choice">
        <legend className="pen-label">{q.label}</legend>
        <div className="pen-su-choice-row">
          {q.options.map((o) => (
            <button type="button" key={o.value} className="pen-su-opt" data-on={value === o.value} onClick={() => onChange(o.value)}>
              <strong>{o.title}</strong>
              <span>{o.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
    )
  }
  const text = typeof value === 'string' ? value : ''
  return (
    <label className="pen-su-field">
      <span className="pen-label">{q.label}</span>
      {q.kind === 'textarea' ? (
        <textarea rows={3} value={text} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder} />
      ) : (
        <input value={text} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder} />
      )}
    </label>
  )
}
