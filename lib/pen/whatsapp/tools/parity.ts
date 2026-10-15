// Everything small the website does that the assistant could not (audit 15 Oct: it failed on
// "merge Titi and Titi Dyas").
//
//   merge_people / edit_person / delete_person     the People page
//   delete_recording                               the recording's Delete
//   combine_recordings / separate_recordings       "Combine with…" and "Separate"
//   combine_day                                    "Combine this day into one event"
//   join_suggestions / dismiss_join_suggestion     "These look like one meeting"
//   missed_items / mark_missed                     "You might have missed": handled, or a to-do
//   translate_transcript / remove_translation      "Translate transcript"
//   send_briefing                                  "Email the briefing" to other people
//   send_to_notion                                 "Send to Notion"
//   draft_deliverable                              memo, tracker entry, LinkedIn post
//   notes_settings                                 Settings: notes language and length
//   set_client                                     the recording's client
//   redo_notes_as                                  rewrite the notes as another kind of meeting
//
// Destructive and outward actions wait for the user's yes (../confirm.ts). Slow ones (notes,
// translation, drafting) run after the reply (ctx.later) and message the user when they are
// done, or when they fail: the after-reply runner only logs errors, so each job reports its own.

import type Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, updateSession, deleteSession, type PenSession } from '../../store'
import { cleanEmail, deletePerson, mergePeople, sessionsWith, updatePerson, type PenPerson } from '../../people'
import { foldName } from '../../speakers'
import { groupSessions, joinSegments, splitGroup } from '../../merge'
import { dayCandidates, joinAsEvent, startMs } from '../../event-day'
import { openJoinSuggestions, dismissJoinSuggestion } from '../../join-suggest'
import { applyItemOp, missedDoneOf } from '../../item-ops'
import { getProfile, saveProfile, LANGUAGES } from '../../profile'
import { COMMON_TYPES } from '../../categories'
import { fmtHours } from '../../plan'
import type { Lang } from '../../currency'
import { sendText } from '../provider'
import { getLinkByEmail, setChat } from '../store'
import { askConfirm } from '../confirm'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'

const SID = { session_id: { type: 'string' } } as const
const obj = (properties: Record<string, unknown>, required: string[]): Anthropic.Tool['input_schema'] => ({
  type: 'object', properties, required, additionalProperties: false,
})

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'merge_people',
    description:
      'Two contacts that are the same person ("Titi" and "Titi Dyas"): moves every recording, event conversation and ' +
      'speaker name from `drop` to `keep`, fills keep\'s blank email/role/company from drop, then deletes drop. Asks ' +
      'the user to confirm first. If the user did not say which to keep, keep the fuller name.',
    input_schema: obj({ keep: { type: 'string', description: 'Name of the contact to keep.' }, drop: { type: 'string', description: 'Name of the contact merged into it.' } }, ['keep', 'drop']),
  },
  {
    name: 'edit_person',
    description:
      'Change a contact: rename them, set their email, the user\'s own line about who they are, their role or company. ' +
      'Leave a field "" to keep it. A rename to a name another contact already has fails: offer merge_people instead.',
    input_schema: obj({
      name: { type: 'string', description: 'The contact as they are called now.' },
      new_name: { type: 'string' }, email: { type: 'string' }, about: { type: 'string' }, role: { type: 'string' }, company: { type: 'string' },
    }, ['name', 'new_name', 'email', 'about', 'role', 'company']),
  },
  {
    name: 'delete_person',
    description: 'Delete a contact (their links to recordings go; the recordings and notes stay). Asks the user to confirm first.',
    input_schema: obj({ name: { type: 'string' } }, ['name']),
  },
  {
    name: 'delete_recording',
    description: 'Delete a recording for good: audio, transcript and notes. Asks the user to confirm first.',
    input_schema: obj(SID, ['session_id']),
  },
  {
    name: 'combine_recordings',
    description:
      'Join two or more recordings into one meeting (the pen split it, or it was one conversation in pieces) and rewrite ' +
      'the notes over all of it. Asks first; the new briefing follows in a few minutes.',
    input_schema: obj({ session_ids: { type: 'array', items: { type: 'string' }, description: 'At least two, from list_recordings.' } }, ['session_ids']),
  },
  {
    name: 'separate_recordings',
    description: 'Undo a combine: a joined meeting or event goes back to its separate recordings. Asks first.',
    input_schema: obj(SID, ['session_id']),
  },
  {
    name: 'combine_day',
    description:
      '"Combine this day into one event": every recording from the same day as this one becomes one event recording ' +
      '(a conference, an open house). Asks first, with how many recordings and hours; notes and conversations follow.',
    input_schema: obj(SID, ['session_id']),
  },
  {
    name: 'join_suggestions',
    description: 'Pairs of recordings Juno thinks are one meeting, with why. Accept one with combine_recordings, turn it down with dismiss_join_suggestion.',
    input_schema: obj({}, []),
  },
  {
    name: 'dismiss_join_suggestion',
    description: '"Not the same meeting": that pair is never suggested again.',
    input_schema: obj({ a_id: { type: 'string' }, b_id: { type: 'string' } }, ['a_id', 'b_id']),
  },
  {
    name: 'missed_items',
    description: 'A recording\'s "you might have missed" items, with an index each and whether the user has dealt with it.',
    input_schema: obj(SID, ['session_id']),
  },
  {
    name: 'mark_missed',
    description: 'A "you might have missed" item: handled (dealt with), unhandled (put it back), or todo (make it the user\'s to-do).',
    input_schema: obj({ ...SID, index: { type: 'number' }, op: { type: 'string', enum: ['handled', 'unhandled', 'todo'] } }, ['session_id', 'index', 'op']),
  },
  {
    name: 'translate_transcript',
    description:
      `Translate a recording's transcript (${LANGUAGES.map((l) => l.code).join(', ')}), to read beside the original on the website. Runs after the ` +
      'reply; a message follows when it is ready.',
    input_schema: obj({ ...SID, lang: { type: 'string', enum: LANGUAGES.map((l) => l.code) } }, ['session_id', 'lang']),
  },
  {
    name: 'remove_translation',
    description: 'Remove a recording\'s transcript translation.',
    input_schema: obj(SID, ['session_id']),
  },
  {
    name: 'send_briefing',
    description:
      'Email a recording\'s briefing (summary, to-dos, notes) to other people. Each entry in `to` is an email address or ' +
      'a contact name with a saved email; at most 5. The user always gets a copy. Asks first.',
    input_schema: obj({ ...SID, to: { type: 'array', items: { type: 'string' } } }, ['session_id', 'to']),
  },
  {
    name: 'send_to_notion',
    description: 'Send a recording\'s notes to the user\'s Notion (connected on the website). Returns the page link.',
    input_schema: obj(SID, ['session_id']),
  },
  {
    name: 'draft_deliverable',
    description:
      'Write a memo, a tracker entry or a LinkedIn post about one item of a recording (a decision, a to-do, a topic). ' +
      'Runs after the reply and is sent here. Follow-up emails are save_draft, not this.',
    input_schema: obj({ ...SID, kind: { type: 'string', enum: ['memo', 'tracker', 'linkedin'] }, item: { type: 'string', description: 'What it is about, in a sentence.' } }, ['session_id', 'kind', 'item']),
  },
  {
    name: 'notes_settings',
    description:
      'The user\'s notes settings: the language notes are written in (a language code, or "recording" for the language of each ' +
      'recording) and their length (short or detailed). Leave both "" to read the current ones. Applies to new notes.',
    input_schema: obj({ notes_language: { type: 'string' }, note_style: { type: 'string' } }, ['notes_language', 'note_style']),
  },
  {
    name: 'set_client',
    description: 'Set or change the client a recording is for ("" clears it).',
    input_schema: obj({ ...SID, client: { type: 'string' } }, ['session_id', 'client']),
  },
  {
    name: 'redo_notes_as',
    description:
      'Rewrite a recording\'s notes as another kind of meeting (e.g. "Sales call", "Property viewing"): changes the ' +
      'category and rewrites. Runs after the reply; the new briefing follows.',
    input_schema: obj({ ...SID, type: { type: 'string' } }, ['session_id', 'type']),
  },
]

/* ---------------------------------------------------------------- helpers */

const UUID = /^[0-9a-f-]{36}$/i
const own = (ctx: Ctx, id: string) => (UUID.test(id) ? getSession(ctx.email, id) : Promise.resolve(null))
const titleOf = (s: PenSession) => s.title ?? s.source_name ?? 'Untitled'
const dayOf = (s: PenSession) => new Date(startMs(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function appUrl(): string {
  return (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
}

/** A contact by name: exact (accents and case aside) first, else the one name containing it. */
async function findPerson(ctx: Ctx, name: string): Promise<{ person: PenPerson } | { error: string; matches?: string[] }> {
  const want = foldName(name)
  if (!want) return { error: 'a name is required' }
  const { data, error } = await supabaseAdmin.from('pen_people').select('*').eq('user_email', ctx.email)
  if (error) throw new Error(error.message)
  const all = (data ?? []) as PenPerson[]
  const exact = all.filter((p) => foldName(p.name) === want)
  if (exact.length === 1) return { person: exact[0] }
  const near = all.filter((p) => foldName(p.name).includes(want) || want.includes(foldName(p.name)))
  if (near.length === 1) return { person: near[0] }
  if (near.length > 1) return { error: `several contacts match "${name}"; ask the user which`, matches: near.map((p) => p.name) }
  return { error: `no contact called "${name}"` }
}

/** A message from Juno after the reply (a job finished or failed), kept in the chat history. */
async function tell(ctx: Ctx, text: string): Promise<void> {
  await sendText(ctx.phone, text)
  const link = await getLinkByEmail(ctx.email).catch(() => null)
  if (link) await setChat(ctx.email, [...(link.chat ?? []), { role: 'assistant', content: text, ts: Date.now() }]).catch(() => {})
}

const S: Record<Lang, {
  combineFailed: (t: string) => string
  dayFailed: (t: string) => string
  translated: (t: string, lang: string, url: string) => string
  translateFailed: (t: string) => string
  deliverable: (kind: string, t: string) => string
  deliverableFailed: (t: string) => string
  kinds: Record<string, string>
  langs: Record<string, string>
}> = {
  en: {
    combineFailed: (t) => `I couldn't finish combining "${t}". Open it on the website to check it, or try again.`,
    dayFailed: (t) => `The recordings are combined into "${t}", but I couldn't write up the event. Open it on the website and press "Write the notes" to try again.`,
    translated: (t, l, u) => `The transcript of "${t}" is translated into ${l}. Read it beside the original on the website: ${u}`,
    translateFailed: (t) => `I couldn't translate "${t}". Nothing changed; try again in a minute, or on the website.`,
    deliverable: (k, t) => `*${k}* from "${t}":`,
    deliverableFailed: (t) => `I couldn't write that from "${t}". Try again in a minute, or on the website.`,
    kinds: { memo: 'Memo', tracker: 'Tracker entry', linkedin: 'LinkedIn post' },
    langs: { en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French', it: 'Italian', de: 'German' },
  },
  es: {
    combineFailed: (t) => `No pude terminar de unir "${t}". Ábrela en el sitio web para revisarla, o inténtalo de nuevo.`,
    dayFailed: (t) => `Las grabaciones quedaron unidas en "${t}", pero no pude escribir las notas del evento. Ábrela en el sitio web y pulsa "Escribir las notas" para intentarlo de nuevo.`,
    translated: (t, l, u) => `La transcripción de "${t}" está traducida al ${l}. Léela junto al original en el sitio web: ${u}`,
    translateFailed: (t) => `No pude traducir "${t}". No cambió nada; inténtalo en un minuto, o en el sitio web.`,
    deliverable: (k, t) => `*${k}* de "${t}":`,
    deliverableFailed: (t) => `No pude escribir eso a partir de "${t}". Inténtalo en un minuto, o en el sitio web.`,
    kinds: { memo: 'Memo', tracker: 'Tarea para el tracker', linkedin: 'Post de LinkedIn' },
    langs: { en: 'inglés', es: 'español', pt: 'portugués', fr: 'francés', it: 'italiano', de: 'alemán' },
  },
  pt: {
    combineFailed: (t) => `Não consegui terminar de juntar "${t}". Abra no site para conferir, ou tente de novo.`,
    dayFailed: (t) => `As gravações foram juntadas em "${t}", mas não consegui escrever as notas do evento. Abra no site e toque em "Escrever as notas" para tentar de novo.`,
    translated: (t, l, u) => `A transcrição de "${t}" foi traduzida para o ${l}. Leia ao lado do original no site: ${u}`,
    translateFailed: (t) => `Não consegui traduzir "${t}". Nada mudou; tente de novo em um minuto, ou no site.`,
    deliverable: (k, t) => `*${k}* de "${t}":`,
    deliverableFailed: (t) => `Não consegui escrever isso a partir de "${t}". Tente de novo em um minuto, ou no site.`,
    kinds: { memo: 'Memo', tracker: 'Item para o tracker', linkedin: 'Post no LinkedIn' },
    langs: { en: 'inglês', es: 'espanhol', pt: 'português', fr: 'francês', it: 'italiano', de: 'alemão' },
  },
}

const transcribed = (s: PenSession) => !!s.transcript?.utterances?.length || !!s.transcript?.text

/* ------------------------------------------------------------------ people */

async function askMerge(ctx: Ctx, keepName: string, dropName: string): Promise<unknown> {
  const [k, d] = await Promise.all([findPerson(ctx, keepName), findPerson(ctx, dropName)])
  if ('error' in k) return k
  if ('error' in d) return d
  if (k.person.id === d.person.id) return { error: `"${keepName}" and "${dropName}" are the same contact (${k.person.name})` }
  const [nk, nd] = await Promise.all([sessionsWith(ctx.email, [k.person.id]), sessionsWith(ctx.email, [d.person.id])])
  const moving = nd.filter((id) => !nk.includes(id)).length
  return askConfirm(ctx, {
    kind: 'merge_people',
    args: { keep: k.person.id, drop: d.person.id },
    summary:
      `Merge ${d.person.name} into ${k.person.name}? ` +
      (moving ? `${d.person.name}'s ${moving} recording${moving === 1 ? '' : 's'} move${moving === 1 ? 's' : ''} to ${k.person.name}, ` : '') +
      `and ${d.person.name} is removed from your contacts. Reply yes (or tell me to keep ${d.person.name} instead).`,
  })
}

async function doMerge(ctx: Ctx, a: Record<string, unknown>): Promise<unknown> {
  const r = await mergePeople(ctx.email, String(a.keep), String(a.drop))
  ctx.enrich.add(r.kept.id)
  return { ok: true, kept: r.kept.name, email: r.kept.email, now_on_recordings: r.recordings }
}

async function editPerson(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const f = await findPerson(ctx, str(input, 'name'))
  if ('error' in f) return f
  const patch: Record<string, string> = {}
  for (const [k, field] of [['new_name', 'name'], ['email', 'email'], ['about', 'about'], ['role', 'role'], ['company', 'company']] as const) {
    if (str(input, k)) patch[field] = str(input, k)
  }
  if (!Object.keys(patch).length) return { error: 'nothing to change' }
  if (patch.email && !cleanEmail(patch.email)) return { error: `"${patch.email}" is not a valid email address; ask the user` }
  try {
    const p = await updatePerson(ctx.email, f.person.id, patch)
    return { ok: true, was: f.person.name, now: { name: p.name, email: p.email, about: p.about ?? null, role: p.role, company: p.company } }
  } catch (e) {
    if (/already exists/.test((e as Error).message)) return { error: `another contact is already called "${patch.name}"`, next: 'offer merge_people (same person?)' }
    throw e
  }
}

async function askDeletePerson(ctx: Ctx, name: string): Promise<unknown> {
  const f = await findPerson(ctx, name)
  if ('error' in f) return f
  const n = (await sessionsWith(ctx.email, [f.person.id])).length
  return askConfirm(ctx, {
    kind: 'delete_person',
    args: { id: f.person.id, name: f.person.name },
    summary: `Delete ${f.person.name} from your contacts?${n ? ` They come off ${n} recording${n === 1 ? '' : 's'}; the recordings and notes stay.` : ''} Reply yes.`,
  })
}

/* -------------------------------------------------------------- recordings */

async function askDeleteRecording(ctx: Ctx, id: string): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording; find it with list_recordings' }
  // Same as the website: deleting a joined meeting deletes the part it opens on and unpicks the
  // join, so the other parts come back as recordings of their own (store.ts deleteSession).
  const parts = s.merge_group ? (await groupSessions(ctx.email, s.merge_group)).length : 1
  return askConfirm(ctx, {
    kind: 'delete_recording',
    args: { id: s.id },
    summary:
      `Delete "${titleOf(s)}" (${dayOf(s)}${s.duration_sec ? `, ${fmtHours(s.duration_sec)}` : ''}) for good? The audio, transcript and notes go, and it can't be undone.` +
      (parts > 1 ? ` It was combined from ${parts} recordings; the other ${parts - 1} stay as separate recordings.` : '') +
      ' Reply yes.',
  })
}

async function askCombine(ctx: Ctx, ids: string[]): Promise<unknown> {
  const clean = [...new Set(ids.map((x) => x.trim()))]
  if (clean.length < 2) return { error: 'pick at least two recordings' }
  const rows = await Promise.all(clean.map((id) => own(ctx, id)))
  if (rows.some((r) => !r)) return { error: 'one of those recordings was not found; use list_recordings' }
  const list = (rows as PenSession[]).sort((a, b) => startMs(a) - startMs(b))
  if (list.some((s) => !transcribed(s))) return { error: 'every recording has to finish transcribing first' }
  if (list.some((s) => s.merge_group)) return { error: 'one of these is already part of a combined meeting; separate it first' }
  return askConfirm(ctx, {
    kind: 'combine_recordings',
    args: { ids: list.map((s) => s.id) },
    summary: `Combine ${list.map((s) => `"${titleOf(s)}" (${dayOf(s)})`).join(', ')} into one meeting? The notes are rewritten over all of it (a few minutes); you can separate them again later. Reply yes.`,
  })
}

async function doCombine(ctx: Ctx, a: Record<string, unknown>): Promise<unknown> {
  const ids = (a.ids as string[]) ?? []
  const rows = (await Promise.all(ids.map((id) => own(ctx, id)))).filter((s): s is PenSession => !!s)
  if (rows.length !== ids.length || rows.some((s) => s.merge_group)) return { error: 'those recordings changed since I asked; nothing was combined' }
  const title = titleOf(rows[0])
  ctx.later.push(async () => {
    try {
      const { writeNotes } = await import('../../pipeline')
      // As on the website (api/pen/merge): every part written up on its own first, they are the
      // floor the combined notes stand on; then the join, then the notes over all of it.
      for (const s of rows) {
        if (s.notes && Object.keys(s.notes).length) continue
        if ((await writeNotes({ email: ctx.email, session: s, claim: false })) === 'taken') throw new Error('notes busy')
      }
      const group = await joinSegments(ctx.email, ids)
      const primary = (await groupSessions(ctx.email, group))[0]
      await updateSession(primary.id, { briefing_sent_at: null })
      const fresh = await getSession(ctx.email, primary.id)
      const r = fresh ? await writeNotes({ email: ctx.email, session: fresh, claim: false }) : 'taken'
      if (r === 'taken' || !r.session) throw new Error('combined notes not written')
      const { sendWhatsAppBriefing } = await import('../bot')
      await sendWhatsAppBriefing(r.session, { ask: false })
    } catch (e) {
      console.warn(`pen whatsapp: combine failed: ${(e as Error).message}`)
      await tell(ctx, S[ctx.lang].combineFailed(title)).catch(() => {})
    }
  })
  return { ok: true, queued: true, recordings: rows.length, note: 'Combining after your reply; the new briefing is sent here in a few minutes. Say so.' }
}

async function askSeparate(ctx: Ctx, id: string): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording' }
  if (!s.merge_group) return { error: 'this recording is not combined with anything' }
  const parts = await groupSessions(ctx.email, s.merge_group)
  return askConfirm(ctx, {
    kind: 'separate_recordings',
    args: { group: s.merge_group },
    summary: `Separate "${titleOf(parts[0] ?? s)}" back into its ${parts.length} recordings? Each keeps its own transcript. Reply yes.`,
  })
}

async function askDay(ctx: Ctx, id: string): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording' }
  const c = await dayCandidates(ctx.email, s.id)
  if (c.recordings < 2) return { error: 'there is nothing else from this day to combine' }
  if (!c.ready) return { error: 'some recordings from this day are still being transcribed; try again when they are done' }
  const hm = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '?')
  return askConfirm(ctx, {
    kind: 'combine_day',
    args: { ids: c.ids },
    summary:
      `Combine the ${c.recordings} recordings from ${dayOf(s)} (${fmtHours(c.totalSec)} of audio, ${hm(c.from)}–${hm(c.to)}) into one event? ` +
      'The conversations and the event\'s notes follow in a few minutes; you can separate them again later. Reply yes.',
  })
}

async function doDay(ctx: Ctx, a: Record<string, unknown>): Promise<unknown> {
  const segments = await joinAsEvent(ctx.email, (a.ids as string[]) ?? [])
  const primary = segments[0]
  ctx.later.push(async () => {
    try {
      const { finishEvent } = await import('../../event-day')
      await finishEvent(ctx.email, primary.id)
      const fresh = await getSession(ctx.email, primary.id)
      if (!fresh?.notes || !Object.keys(fresh.notes).length) throw new Error('event notes not written')
      const { sendWhatsAppBriefing } = await import('../bot')
      await sendWhatsAppBriefing(fresh, { ask: false })
    } catch (e) {
      console.warn(`pen whatsapp: event day failed: ${(e as Error).message}`)
      await tell(ctx, S[ctx.lang].dayFailed(titleOf(primary))).catch(() => {})
    }
  })
  return { ok: true, combined: segments.length, event: titleOf(primary), session_id: primary.id, note: 'Combined now. The conversations and event notes are written after your reply; the briefing is sent here in a few minutes. Say so.' }
}

async function joinSuggestions(ctx: Ctx): Promise<unknown> {
  const list = await openJoinSuggestions(ctx.email)
  if (!list.length) return { suggestions: [] }
  const { data } = await supabaseAdmin.from('pen_sessions').select('id,title,source_name,recorded_at,created_at').eq('user_email', ctx.email)
    .in('id', [...new Set(list.flatMap((x) => [x.a_id, x.b_id]))])
  const by = new Map(((data ?? []) as PenSession[]).map((s) => [s.id, `${titleOf(s)} (${(s.recorded_at ?? s.created_at).slice(0, 10)})`]))
  return { suggestions: list.map((x) => ({ a_id: x.a_id, a: by.get(x.a_id), b_id: x.b_id, b: by.get(x.b_id), why: x.reason })) }
}

/* -------------------------------------------------------- missed, settings */

async function missedItems(ctx: Ctx, id: string): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording' }
  const done = new Set(missedDoneOf(s))
  return { recording: titleOf(s), items: (s.notes?.missed ?? []).map((m, i) => ({ index: i, item: m.item, why: m.why, handled: done.has(i) })) }
}

async function markMissed(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const s = await own(ctx, str(input, 'session_id'))
  if (!s) return { error: 'no such recording' }
  const op = str(input, 'op') as 'handled' | 'unhandled' | 'todo'
  const index = Number(input.index)
  if (!['handled', 'unhandled', 'todo'].includes(op) || !Number.isInteger(index)) return { error: 'op and index required' }
  const r = await applyItemOp(s, op, index)
  if (!r.ok) return { error: `no item ${index}; use missed_items` }
  return { ok: true, item: s.notes?.missed?.[index]?.item, now: op === 'todo' ? 'a to-do of the user\'s (and handled)' : op }
}

async function notesSettings(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const p = await getProfile(ctx.email)
  const lang = str(input, 'notes_language').toLowerCase()
  const style = str(input, 'note_style').toLowerCase()
  const show = (x: typeof p) => ({ notes_language: x.notesLanguage ?? 'the language of each recording', note_style: x.noteStyle ?? 'standard' })
  if (!lang && !style) return show(p)
  const next = { ...p }
  if (lang) {
    if (lang === 'recording') delete next.notesLanguage
    else if (LANGUAGES.some((l) => l.code === lang)) next.notesLanguage = lang
    else return { error: `notes language must be ${LANGUAGES.map((l) => l.code).join(', ')} or "recording"` }
  }
  if (style) {
    if (style !== 'short' && style !== 'detailed') return { error: 'note style must be short or detailed' }
    next.noteStyle = style
  }
  return { ok: true, was: show(p), now: show(await saveProfile(ctx.email, next)), note: 'Applies to notes written from now on; redo_notes rewrites an old one.' }
}

/* ------------------------------------------------------- slow or outward */

async function translate(ctx: Ctx, id: string, lang: string): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording' }
  if (!LANGUAGES.some((l) => l.code === lang)) return { error: `lang must be one of ${LANGUAGES.map((l) => l.code).join(', ')}` }
  if (!s.aai_id || !s.transcript?.utterances?.length) return { error: 'this recording has no transcript that can be translated' }
  if (s.translation?.lang === lang) return { ok: true, already: true, note: 'Already translated; it is on the website beside the transcript.' }
  const L = S[ctx.lang]
  ctx.later.push(async () => {
    try {
      const { translateTranscript } = await import('../../aai')
      const lines = await translateTranscript(s.aai_id!, lang)
      // Same rule as the website: a line count that differs means the copies differ; refuse.
      if (lines.length !== s.transcript!.utterances!.length) throw new Error('translation did not line up')
      await updateSession(s.id, { translation: { lang, utterances: lines } })
      await tell(ctx, L.translated(titleOf(s), L.langs[lang] ?? lang, appUrl()))
    } catch (e) {
      console.warn(`pen whatsapp: translate ${s.id} failed: ${(e as Error).message}`)
      await tell(ctx, L.translateFailed(titleOf(s))).catch(() => {})
    }
  })
  return { ok: true, queued: true, note: 'Translating after your reply; a message follows here in a minute or two. Say so.' }
}

async function askSendBriefing(ctx: Ctx, id: string, to: string[]): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording' }
  const n = s.notes ?? {}
  if (!(n.summary || n.actions?.length || n.missed?.length || n.open_questions?.length)) return { error: 'this recording has no notes to send yet' }
  const out: { label: string; email: string }[] = []
  for (const raw of to.map((x) => String(x).trim()).filter(Boolean)) {
    const direct = cleanEmail(raw)
    if (direct) { out.push({ label: direct, email: direct }); continue }
    const f = await findPerson(ctx, raw)
    if ('error' in f) return f
    if (!f.person.email) return { error: `${f.person.name} has no saved email; ask the user for it (edit_person saves it)` }
    out.push({ label: `${f.person.name} <${f.person.email}>`, email: f.person.email })
  }
  const extras = out.filter((x, i) => x.email !== ctx.email.toLowerCase() && out.findIndex((y) => y.email === x.email) === i)
  if (!extras.length) return { error: 'who should get it? Give a name or an email' }
  if (extras.length > 5) return { error: 'at most 5 people at a time' }
  return askConfirm(ctx, {
    kind: 'send_briefing',
    args: { id: s.id, to: extras.map((x) => x.email) },
    summary: `Email the briefing of "${titleOf(s)}" to ${extras.map((x) => x.label).join(', ')}? You get a copy, and replies come to you. Reply yes.`,
  })
}

async function doSendBriefing(ctx: Ctx, a: Record<string, unknown>): Promise<unknown> {
  const s = await own(ctx, String(a.id))
  if (!s) return { error: 'that recording is gone' }
  const { sendBriefing } = await import('../../briefing')
  // The user always first and always included, as on the website: never an open relay.
  const to = [ctx.email, ...((a.to as string[]) ?? [])]
  const r = await sendBriefing({ session: s, to, replyTo: ctx.email })
  if (!r.ok) return { error: r.error ?? 'nothing was sent' }
  await updateSession(s.id, { briefing_sent_at: new Date().toISOString() })
  return { ok: true, sent_to: to }
}

async function toNotion(ctx: Ctx, id: string): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording' }
  const { getConnection, sendToNotion } = await import('../../notion')
  if (!(await getConnection(ctx.email))) return { error: 'Notion is not connected', next: `the user connects it once on the website, in Settings (${appUrl()})` }
  if (!s.notes?.summary && !s.notes?.actions?.length) return { error: 'there are no notes to send yet' }
  const r = await sendToNotion(ctx.email, s)
  return { ok: true, url: r.url, already_there: !r.created }
}

async function deliverable(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const s = await own(ctx, str(input, 'session_id'))
  if (!s) return { error: 'no such recording' }
  const kind = str(input, 'kind') as 'memo' | 'tracker' | 'linkedin'
  const item = str(input, 'item')
  if (!['memo', 'tracker', 'linkedin'].includes(kind) || !item) return { error: 'kind and item required' }
  const L = S[ctx.lang]
  ctx.later.push(async () => {
    try {
      const { draftDeliverable } = await import('../../deliverables')
      const d = await draftDeliverable({
        kind, item: item.slice(0, 1200), notes: s.notes ?? {}, sessionTitle: titleOf(s),
        sessionDate: (s.recorded_at ?? s.created_at).slice(0, 10), clientName: s.client_name, userNotes: s.user_notes,
      })
      // Kept on the recording like the website's, so it is there on the page too.
      const fresh = await getSession(ctx.email, s.id)
      const existing = Array.isArray(fresh?.deliverables) ? fresh!.deliverables : []
      await updateSession(s.id, { deliverables: [{ ...d, id: Math.random().toString(36).slice(2, 10), ts: Date.now() }, ...existing].slice(0, 40) })
      await tell(ctx, `${L.deliverable(L.kinds[kind], titleOf(s))}\n\n${d.title ? `*${d.title}*\n\n` : ''}${d.body}`)
    } catch (e) {
      console.warn(`pen whatsapp: deliverable ${s.id} failed: ${(e as Error).message}`)
      await tell(ctx, L.deliverableFailed(titleOf(s))).catch(() => {})
    }
  })
  return { ok: true, queued: true, note: 'Writing it after your reply; it is sent here in a minute. Say so; do not write it yourself.' }
}

async function redoAs(ctx: Ctx, id: string, type: string): Promise<unknown> {
  const s = await own(ctx, id)
  if (!s) return { error: 'no such recording' }
  if (!transcribed(s)) return { error: 'this recording has no transcript yet' }
  if (ctx.redo) return { error: 'one rewrite per message' }
  const t = (COMMON_TYPES.find((x) => foldName(x) === foldName(type)) ?? type.trim()).slice(0, 40)
  if (!t) return { error: 'a meeting type is required' }
  await updateSession(s.id, { meeting_type: t })
  ctx.redo = { sessionId: s.id, type: t }
  return { ok: true, queued: true, recording: titleOf(s), was: s.meeting_type, now: t, note: 'Rewriting after your reply; the new briefing is sent here in a minute or two.' }
}

/* -------------------------------------------------------------- dispatch */

function run(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<unknown> | undefined {
  const sid = str(input, 'session_id')
  switch (name) {
    case 'merge_people': return askMerge(ctx, str(input, 'keep'), str(input, 'drop'))
    case 'edit_person': return editPerson(ctx, input)
    case 'delete_person': return askDeletePerson(ctx, str(input, 'name'))
    case 'delete_recording': return askDeleteRecording(ctx, sid)
    case 'combine_recordings': return askCombine(ctx, Array.isArray(input.session_ids) ? (input.session_ids as unknown[]).map(String) : [])
    case 'separate_recordings': return askSeparate(ctx, sid)
    case 'combine_day': return askDay(ctx, sid)
    case 'join_suggestions': return joinSuggestions(ctx)
    case 'dismiss_join_suggestion': return dismissJoinSuggestion(ctx.email, str(input, 'a_id'), str(input, 'b_id')).then(() => ({ ok: true }))
    case 'missed_items': return missedItems(ctx, sid)
    case 'mark_missed': return markMissed(ctx, input)
    case 'translate_transcript': return translate(ctx, sid, str(input, 'lang'))
    case 'remove_translation': return own(ctx, sid).then(async (s) => (s ? (await updateSession(s.id, { translation: null }), { ok: true, recording: titleOf(s) }) : { error: 'no such recording' }))
    case 'send_briefing': return askSendBriefing(ctx, sid, Array.isArray(input.to) ? (input.to as unknown[]).map(String) : [])
    case 'send_to_notion': return toNotion(ctx, sid)
    case 'draft_deliverable': return deliverable(ctx, input)
    case 'notes_settings': return notesSettings(ctx, input)
    case 'set_client': return own(ctx, sid).then(async (s) => {
      if (!s) return { error: 'no such recording' }
      const client = str(input, 'client').slice(0, 120)
      await updateSession(s.id, { client_name: client || null })
      return { ok: true, recording: titleOf(s), was: s.client_name, now: client || null }
    })
    case 'redo_notes_as': return redoAs(ctx, sid, str(input, 'type'))
    default: return undefined
  }
}

export const parityModule: ToolModule = {
  tools: TOOLS,
  run,
  confirm: {
    merge_people: doMerge,
    delete_person: async (ctx, a) => (await deletePerson(ctx.email, String(a.id)), { ok: true, deleted: a.name }),
    delete_recording: async (ctx, a) => ((await deleteSession(ctx.email, String(a.id))) ? { ok: true, deleted: true } : { error: 'that recording was already gone' }),
    combine_recordings: doCombine,
    separate_recordings: async (ctx, a) => (await splitGroup(ctx.email, String(a.group)), { ok: true, separated: true, note: 'Each part is its own recording again.' }),
    combine_day: doDay,
    send_briefing: doSendBriefing,
  },
  prompt:
    '- Contacts: two that are one person ("merge Titi and Titi Dyas") is merge_people (keep the fuller name unless the ' +
    'user said otherwise); rename, email, role, company or the user\'s note about someone is edit_person; delete_person removes one.\n' +
    '- Recordings: delete_recording; combine_recordings joins recordings that are one meeting, separate_recordings undoes ' +
    'it; combine_day makes a whole day (a conference) one event; join_suggestions lists pairs Juno thinks are one meeting.\n' +
    '- "You might have missed": missed_items, then mark_missed (handled, back, or make it a to-do).\n' +
    '- Also: translate_transcript / remove_translation, send_briefing (email the notes to other people), send_to_notion, ' +
    'draft_deliverable (memo, tracker entry, LinkedIn post), notes_settings (notes language and length), set_client, ' +
    'redo_notes_as (rewrite as another kind of meeting).\n' +
    '- Say an ask_user question in the language of the user\'s message, keeping every name and number. After a slow ' +
    'job is queued (combine, event, translate, draft), say in one line that it is running and what message follows.',
}
