// Splitting one recording into the meetings in it: the reads and writes (22 Oct). The rules, the
// cut and the "split at …" parsing are pure, in lib/pen/split.ts.
//
//   · detectSplit     after the notes (unattended.ts): stores a suggestion, never splits. One per
//                     recording, ever (pen_suggestions, kind 'split', dedupe split:<id>): "No, it's
//                     one" dismisses it for good, and a split marks it done.
//   · performSplit    the split itself, from the card, "Split here" or the assistant. New
//                     pen_sessions rows for the later parts (same audio, own transcript slice);
//                     the first part keeps the original row, so links to it still open part 1.
//   · finishSplit     after it: notes for each part (one model call each), then the calendar
//                     guests of each part's own event, then the people cards.
//   · joinBack        undo: the parts become one joined meeting again (lib/pen/merge.ts), whose
//                     timeline is exactly the original's, and the notes are written over all of it.
//
// No new columns: the suggestion lives in pen_suggestions (kept out of every offer list by kind),
// and which slice of the audio a row is lives in its transcript (transcript.split, SplitMarker).

import { supabaseAdmin } from '@/lib/supabase'
import { isMissingSchema } from './allowance'
import { claimStatus, getSession, updateSession, type PenSession } from './store'
import { groupSessions, joinSegments, splitGroup } from './merge'
import { keepSeparate } from './join-suggest'
import { linkPerson, unlinkPerson } from './people'
import { foldName } from './speakers'
import { guestName } from './who'
import {
  describeParts, findSplit, peopleForParts, planSplit, shiftedName, slicePiece, timeline, totalSec,
  MIN_MANUAL_SEC, MIN_TOTAL_SEC, type Piece, type SplitEvent, type SplitFile, type SplitHint, type SplitMarker, type SplitPart,
} from './split'

export const SPLIT_KIND = 'split'
const dedupeOf = (id: string) => `split:${id}`

type Marked = PenSession & { transcript: PenSession['transcript'] & { split?: SplitMarker } }
export const markerOf = (s: Pick<PenSession, 'transcript'>): SplitMarker | null => ((s.transcript as Marked['transcript'] | null)?.split ?? null)

const usable = (s: PenSession) => s.source_channel !== 'sample' && !String(s.storage_path ?? '').startsWith('sample')
const asFile = (s: PenSession): SplitFile => ({ id: s.id, duration_sec: s.duration_sec, utterances: s.transcript?.utterances ?? [], speaker_map: (s.speaker_map ?? null) as SplitFile['speaker_map'] })

/** The recording as one unit: every file of a joined meeting in order, or just itself. */
export async function unitOf(email: string, sessionId: string): Promise<{ primary: PenSession; files: PenSession[] } | null> {
  const s = await getSession(email, sessionId)
  if (!s) return null
  const files = s.merge_group ? await groupSessions(email, s.merge_group) : [s]
  return { primary: files[0] ?? s, files: files.length ? files : [s] }
}

/* ------------------------------------------------------------------ calendar */

/** What detectSplit reads from the calendar, replaceable in tests (.pentest/split-unit.mts). */
export type SplitDeps = {
  events: (email: string, from: Date, to: Date) => Promise<SplitEvent[]>
}

async function realDeps(): Promise<SplitDeps> {
  return {
    events: async (email, from, to) => {
      const c = await import('./calendars')
      const cals = (await c.listCalendars(email).catch(() => [])).filter((x) => !x.broken)
      if (!cals.length) return []
      const read = await c.eventsBetween(email, from, to, undefined, { max: 40, cals })
      return read.events
        .filter((e) => !e.allDay && !e.declined)
        .map((e) => ({ title: e.title, start: e.start, end: e.end, names: e.others.slice(0, 8).map(guestName) }))
    },
  }
}

/* ------------------------------------------------------------------ detection */

export type SplitSuggestion = { id: string; sessionId: string; hint: SplitHint; state: string }

/** Plain words for the stored row (the page builds its own line, in the user's language). */
function hintTitle(h: SplitHint): string {
  return `Looks like ${h.parts.length} conversations: ` + h.parts.map((p) => p.title || (p.people.length ? `with ${p.people.join(', ')}` : `${Math.round(p.from_sec / 60)}–${Math.round(p.to_sec / 60)} min`)).join(' · ')
}

/**
 * After the notes: does this recording hold two meetings or more? Stores the suggestion when the
 * rules are confident (lib/pen/split.ts findSplit). Never throws, never splits, and never asks
 * twice about the same recording. Returns the hint it stored, or null.
 */
export async function detectSplit(email: string, sessionId: string, deps?: SplitDeps): Promise<SplitHint | null> {
  try {
    const unit = await unitOf(email, sessionId)
    if (!unit) return null
    const { primary, files } = unit
    if (!usable(primary) || primary.event_mode || files.some((f) => f.event_mode)) return null
    if (String(primary.storage_path ?? '').startsWith('text:')) return null
    if (files.some((f) => f.status !== 'noted')) return null
    if (totalSec(files.map(asFile)) < MIN_TOTAL_SEC) return null
    const { data: prior, error } = await supabaseAdmin.from('pen_suggestions').select('id').eq('user_email', email).eq('dedupe', dedupeOf(primary.id)).limit(1)
    if (error) return null
    if (prior?.length) return null
    let events: SplitEvent[] = []
    if (primary.recorded_at) {
      const start = Date.parse(primary.recorded_at)
      const end = start + totalSec(files.map(asFile)) * 1000
      const d = deps ?? (await realDeps())
      events = await d.events(email, new Date(start - 30 * 60_000), new Date(end + 30 * 60_000)).catch(() => [])
    }
    const hint = findSplit({ files: files.map(asFile), startIso: primary.recorded_at, events })
    if (!hint) return null
    const { error: e2 } = await supabaseAdmin.from('pen_suggestions').upsert({
      user_email: email, session_id: primary.id, kind: SPLIT_KIND, title: hintTitle(hint), detail: hint as unknown as Record<string, unknown>,
      state: 'suggested', dedupe: dedupeOf(primary.id),
    }, { onConflict: 'user_email,dedupe', ignoreDuplicates: true })
    if (e2) throw new Error(e2.message)
    return hint
  } catch (e) {
    const msg = (e as Error).message
    if (!isMissingSchema(msg)) console.warn(`pen split: detect ${sessionId}: ${msg}`)
    return null
  }
}

/** The open split suggestion for a recording (any file of a joined meeting), or null. */
export async function openSplit(email: string, sessionId: string): Promise<SplitSuggestion | null> {
  const unit = await unitOf(email, sessionId)
  if (!unit) return null
  const { data, error } = await supabaseAdmin.from('pen_suggestions').select('id,session_id,detail,state').eq('user_email', email).eq('kind', SPLIT_KIND).eq('session_id', unit.primary.id).in('state', ['suggested', 'offered']).limit(1)
  if (error) {
    if (isMissingSchema(error.message)) return null
    throw new Error(error.message)
  }
  const r = (data ?? [])[0] as { id: string; session_id: string; detail: SplitHint; state: string } | undefined
  if (!r || !Array.isArray(r.detail?.cuts) || !r.detail.cuts.length) return null
  return { id: r.id, sessionId: r.session_id, hint: r.detail, state: r.state }
}

/** "No, it's one": never suggested for this recording again. */
export async function dismissSplit(email: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('pen_suggestions').update({ state: 'dismissed', decided_at: new Date().toISOString() })
    .eq('user_email', email).eq('id', id).eq('kind', SPLIT_KIND).select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

/* ------------------------------------------------------------------ the split */

export type SplitOutcome =
  | { ok: true; splitId: string; parts: { id: string; from_sec: number; to_sec: number; title: string | null }[]; rewrite: string[] }
  | { ok: false; status: number; error: string }

/** Why a recording can't be split, or null when it can. */
export function cannotSplit(files: PenSession[]): string | null {
  if (!files.length) return 'not found'
  if (files.some((f) => f.event_mode)) return 'this is an event: its conversations are listed separately already (Conversations)'
  if (files.some((f) => !usable(f))) return 'the sample recording can\'t be split'
  if (files.some((f) => ['uploaded', 'held', 'transcribing', 'transcribed', 'noting'].includes(f.status))) return 'this recording is still being processed; try again when its notes are written'
  if (!files.some((f) => f.transcript?.utterances?.length)) return 'this recording has no transcript to split'
  return null
}

/**
 * Splits a recording at `cuts` (seconds from its start). The first part keeps the original row;
 * each later part is a new row with the same audio and its own transcript slice, corrections,
 * translation, names heard and people. Notes are NOT written here (finishSplit, after the
 * response): each part is left 'noting'. `titles` names the parts (calendar event titles from a
 * suggestion); otherwise the notes' headline will.
 */
export async function performSplit(
  email: string,
  sessionId: string,
  cuts: number[],
  opts: { titles?: (string | null)[]; suggestionId?: string | null; minSec?: number } = {},
): Promise<SplitOutcome> {
  const unit = await unitOf(email, sessionId)
  if (!unit) return { ok: false, status: 404, error: 'not found' }
  const { primary, files } = unit
  const why = cannotSplit(files)
  if (why) return { ok: false, status: 409, error: why }
  const plan = planSplit(files.map(asFile), cuts, opts.minSec ?? MIN_MANUAL_SEC)
  if ('error' in plan) return { ok: false, status: 400, error: plan.error }

  // One split at a time: the first part is claimed (noted|error → noting), so a double click or
  // the card and the chat at once can't cut it twice.
  if (!(await claimStatus(primary.id, primary.status, 'noting'))) return { ok: false, status: 409, error: 'this recording is being changed already' }

  const splitId = crypto.randomUUID()
  const created: string[] = []
  let phase: 'insert' | 'update' = 'insert'
  try {
    const lines = timeline(files.map(asFile))
    const total = totalSec(files.map(asFile))
    const parts = describeParts(lines, plan.map((o) => o[0].startSec).slice(1), total, null)
    const now = new Date().toISOString()
    const len = (p: Piece) => files[p.file].transcript?.utterances?.length ?? 0
    // Rows that get new notes: every piece that changed, the head of a part made of several
    // pieces (its combined notes), and the original first row (its notes covered everything).
    const rewrite = new Set<Piece>()
    for (const out of plan) {
      for (const p of out) if (!p.reuse || p.from > 0 || p.to < len(p)) rewrite.add(p)
      if (out.length > 1 || files[out[0].file].id === primary.id) rewrite.add(out[0])
    }

    // 1. The new rows first: nothing of the original changes until they all exist.
    const rowOf = new Map<Piece, string>()
    for (const [o, out] of plan.entries()) {
      for (const p of out) {
        const f = files[p.file]
        if (p.reuse) { rowOf.set(p, f.id); continue }
        const sl = slicePiece({ utterances: f.transcript?.utterances ?? [], transcript_edits: f.transcript_edits, translation: f.translation ?? null }, p)
        const marker = markerFor(splitId, primary, f, p, o, plan.length)
        // Everything the original has (so a column added later is carried too), minus what is
        // the original's own: its id, its AssemblyAI job and what it was charged.
        const { id: _id, aai_id: _a, metered_at: _m, metered_sec: _ms, ...base } = f as PenSession & { metered_at?: unknown; metered_sec?: unknown }
        void _id; void _a; void _m; void _ms
        const row: Record<string, unknown> = {
          ...base,
          title: opts.titles?.[o] ?? null,
          status: 'noting',
          source_name: shiftedName(f.source_name, p.offsetSec, o + 1),
          recorded_at: f.recorded_at ? new Date(Date.parse(f.recorded_at) + p.offsetSec * 1000).toISOString() : null,
          duration_sec: p.durationSec,
          transcript: { text: sl.text, utterances: sl.utterances, split: marker },
          transcript_edits: sl.edits,
          translation: sl.translation,
          notes: {}, chat: [], action_done: [], action_meta: null, note_blocks: [], user_notes: null, deliverables: [],
          meeting_type: null, client_name: null, error_text: null, briefing_sent_at: null,
          merge_group: null, merge_index: null, segments_at: null, event_mode: false,
          created_at: f.created_at, updated_at: now,
        }
        for (const k of ['who_at', 'cal_people_at', 'missed_done'] as const) if (k in base) row[k] = k === 'missed_done' ? [] : null
        const { data, error } = await supabaseAdmin.from('pen_sessions').insert(row).select('id').single()
        if (error || !data) throw new Error(error?.message ?? 'the new part was not saved')
        created.push((data as { id: string }).id)
        rowOf.set(p, (data as { id: string }).id)
      }
    }

    // 2. The rows that stay: their own slice (the first piece of each file). A file left whole
    //    keeps its own notes unless it now heads a joined part, or it carried the notes of the
    //    whole joined meeting before.
    phase = 'update'
    if (primary.merge_group) await splitGroup(email, primary.merge_group)
    for (const [o, out] of plan.entries()) {
      for (const p of out) {
        if (!p.reuse) continue
        const f = files[p.file]
        const sl = slicePiece({ utterances: f.transcript?.utterances ?? [], transcript_edits: f.transcript_edits, translation: f.translation ?? null }, p)
        const split = markerFor(splitId, primary, f, p, o, plan.length)
        const title = out[0] === p && opts.titles?.[o] ? { title: opts.titles[o] } : {}
        if (!rewrite.has(p)) {
          await updateSession(f.id, { transcript: { ...(f.transcript ?? {}), split }, ...title })
          continue
        }
        const m = f as PenSession & { metered_at?: string | null; metered_sec?: number | null }
        await updateSession(f.id, {
          status: 'noting',
          duration_sec: p.durationSec,
          transcript: { ...(f.transcript ?? {}), text: sl.text, utterances: sl.utterances, split },
          transcript_edits: sl.edits,
          translation: sl.translation,
          notes: {}, action_done: [], action_meta: null, meeting_type: null, client_name: null, error_text: null,
          title: out[0] === p ? opts.titles?.[o] ?? null : f.title,
          segments_at: null,
          // Still charged for the whole file it was: the hours used don't shrink with the split.
          ...(f.aai_id ? { metered_sec: m.metered_sec ?? f.duration_sec, metered_at: m.metered_at ?? f.created_at } : {}),
        })
        if ('cal_people_at' in f) await supabaseAdmin.from('pen_sessions').update({ cal_people_at: null, who_at: null }).eq('id', f.id)
      }
    }

    // 3. Each output with more than one piece is a joined meeting of its own.
    const outIds = plan.map((out) => out.map((p) => rowOf.get(p)!))
    for (const ids of outIds) if (ids.length > 1) await joinSegments(email, ids)

    // 4. Names heard move with their lines.
    await moveMentions(email, files, plan, rowOf)

    // 5. People: calendar guests are re-read per part after the notes (finishSplit); the user's
    //    own go to the parts where they are heard (all parts when that can't be told).
    await movePeople(email, files, plan, outIds.map((x) => x[0]))

    // 6. Bookkeeping: the suggestion is done, and the filename rule must not offer to join the
    //    parts back (their names are consecutive by design).
    await markDone(email, primary.id, opts.suggestionId ?? null, splitId, outIds.map((x) => x[0]))
    await keepSeparate(email, outIds.map((x) => x[0])).catch(() => {})

    return {
      ok: true,
      splitId,
      parts: outIds.map((ids, o) => ({ id: ids[0], from_sec: parts[o]?.from_sec ?? 0, to_sec: parts[o]?.to_sec ?? 0, title: opts.titles?.[o] ?? null })),
      rewrite: plan.flatMap((out) => out.filter((p) => rewrite.has(p)).map((p) => rowOf.get(p)!)),
    }
  } catch (e) {
    const msg = (e as Error).message
    console.warn(`pen split: ${sessionId} (${phase}): ${msg}`)
    if (phase === 'insert') {
      // Nothing of the original was touched before the new rows all existed: those go (the row
      // only, the audio is shared) and the recording is as it was.
      for (const id of created) await supabaseAdmin.from('pen_sessions').delete().eq('user_email', email).eq('id', id)
      await updateSession(primary.id, { status: primary.status }).catch(() => {})
    } else {
      // Half-way: every line is still in some row (the new ones hold the later parts), so keep
      // them all and say so; Redo notes or Join back recovers it.
      await updateSession(primary.id, { status: 'error', error_text: `The split did not finish: ${msg}` }).catch(() => {})
    }
    return { ok: false, status: 500, error: msg }
  }
}

function markerFor(splitId: string, primary: PenSession, f: PenSession, p: Piece, o: number, n: number): SplitMarker {
  const prev = markerOf(f)
  return {
    id: splitId, part: o + 1, parts: n, of: primary.id, from_sec: p.startSec,
    aai_id: prev?.aai_id ?? f.aai_id ?? null,
    first_utt: (prev?.first_utt ?? 0) + p.from,
  }
}

async function moveMentions(email: string, files: PenSession[], plan: Piece[][], rowOf: Map<Piece, string>) {
  const { data, error } = await supabaseAdmin.from('pen_name_mentions').select('id,session_id,utterance,at_sec').eq('user_email', email).in('session_id', files.map((f) => f.id))
  if (error) return
  for (const m of (data ?? []) as { id: number; session_id: string; utterance: number; at_sec: number }[]) {
    const k = files.findIndex((f) => f.id === m.session_id)
    const p = plan.flat().find((x) => x.file === k && m.utterance >= x.from && m.utterance < x.to)
    if (!p || (p.reuse && p.from === 0)) continue
    await supabaseAdmin.from('pen_name_mentions').update({ session_id: rowOf.get(p), utterance: m.utterance - p.from, at_sec: Math.max(0, (m.at_sec ?? 0) - p.offsetSec) }).eq('id', m.id)
  }
}

async function movePeople(email: string, files: PenSession[], plan: Piece[][], primaries: string[]) {
  const ids = files.map((f) => f.id)
  const { data, error } = await supabaseAdmin.from('pen_session_people').select('session_id,person_id,source,pen_people(id,name)').eq('user_email', email).in('session_id', ids)
  if (error) return
  const links = (data ?? []) as unknown as { session_id: string; person_id: string; source: string; pen_people: { id: string; name: string } | null }[]
  // A calendar guest was the guest of ONE event; each part gets its own event's guests later.
  await supabaseAdmin.from('pen_session_people').delete().eq('user_email', email).in('session_id', ids).eq('source', 'calendar')
  const mine = new Map<string, { id: string; name: string; source: string }>()
  for (const l of links) if (l.source !== 'calendar' && l.pen_people) mine.set(l.person_id, { id: l.person_id, name: l.pen_people.name, source: l.source })
  if (!mine.size) return
  // Who is heard in each part: named voices, and names said (Names heard).
  const lines = timeline(files.map(asFile))
  const { data: ms } = await supabaseAdmin.from('pen_name_mentions').select('session_id,name,utterance').eq('user_email', email).in('session_id', ids)
  const heard = plan.map((out) => {
    const set = new Set<string>()
    for (const p of out) {
      for (const l of lines) if (l.file === p.file && l.idx >= p.from && l.idx < p.to && l.name) set.add(foldName(l.name))
      for (const m of (ms ?? []) as { session_id: string; name: string; utterance: number }[]) {
        if (m.session_id === files[p.file].id && m.utterance >= p.from && m.utterance < p.to) set.add(foldName(m.name))
      }
    }
    return set
  })
  const where = peopleForParts([...mine.values()], heard)
  for (const [pid, outs] of where) {
    const src = (mine.get(pid)!.source === 'import' ? 'import' : 'user') as 'user' | 'import'
    for (let o = 0; o < primaries.length; o++) {
      if (outs.includes(o)) await linkPerson(email, primaries[o], pid, src)
      else if (links.some((l) => l.session_id === primaries[o] && l.person_id === pid)) await unlinkPerson(email, primaries[o], pid)
    }
  }
}

async function markDone(email: string, primaryId: string, suggestionId: string | null, splitId: string, parts: string[]) {
  const detail = { split_id: splitId, parts }
  const at = new Date().toISOString()
  const q = supabaseAdmin.from('pen_suggestions')
  const { data } = suggestionId
    ? await q.update({ state: 'done', decided_at: at }).eq('user_email', email).eq('id', suggestionId).select('id,detail')
    : await q.update({ state: 'done', decided_at: at }).eq('user_email', email).eq('dedupe', dedupeOf(primaryId)).select('id,detail')
  const row = (data ?? [])[0] as { id: string; detail: Record<string, unknown> } | undefined
  if (row) {
    await supabaseAdmin.from('pen_suggestions').update({ detail: { ...(row.detail ?? {}), ...detail } }).eq('id', row.id)
    return
  }
  // Split by hand: remembered, so the recording is never suggested for a split afterwards.
  await supabaseAdmin.from('pen_suggestions').upsert(
    { user_email: email, session_id: primaryId, kind: SPLIT_KIND, title: 'Split by hand', detail, state: 'done', decided_at: at, dedupe: dedupeOf(primaryId) },
    { onConflict: 'user_email,dedupe', ignoreDuplicates: true },
  ).then(() => {}, () => {})
}

/**
 * After performSplit, with nobody waiting: notes for every changed row (each part first, then a
 * joined part's combined notes), the calendar guests of each part's own event, then the people
 * cards. Never throws; a part whose notes failed is left 'error' with the reason (writeNotes).
 */
export async function finishSplit(email: string, r: Extract<SplitOutcome, { ok: true }>): Promise<void> {
  const { writeNotes } = await import('./pipeline')
  const { linkCalendarGuests } = await import('./who-server')
  const { enrichPerson, peopleOnSession } = await import('./people')
  const { pool } = await import('./event-day')
  const heads = new Set(r.parts.map((p) => p.id))
  const write = async (id: string) => {
    const s = await getSession(email, id)
    if (s) await writeNotes({ email, session: s, claim: false }).catch((e) => console.warn(`pen split: notes ${id}: ${(e as Error).message}`))
  }
  // A joined part's own pieces first: their notes are the floor its combined notes stand on.
  await pool(r.rewrite.filter((id) => !heads.has(id)), 3, write)
  await pool(r.parts, 3, async (p) => {
    if (r.rewrite.includes(p.id)) await write(p.id)
    await linkCalendarGuests(email, p.id)
    const people = await peopleOnSession(email, p.id).catch(() => [])
    await Promise.all(people.map((x) => enrichPerson(email, x.id).catch(() => {})))
  })
  // Never left 'noting' (a write that was skipped): the page polls until it isn't.
  for (const id of r.rewrite) {
    const s = await getSession(email, id).catch(() => null)
    if (s?.status === 'noting') await updateSession(id, { status: 'noted' }).catch(() => {})
  }
}

/** Every row of the split this recording came from, in order (each joined part's files too). */
export async function splitSiblings(email: string, sessionId: string): Promise<PenSession[]> {
  const s = await getSession(email, sessionId)
  const m = s ? markerOf(s) : null
  if (!m) return []
  const { data, error } = await supabaseAdmin.from('pen_sessions').select('*').eq('user_email', email).eq('transcript->split->>id', m.id)
  if (error) throw new Error(error.message)
  return ((data ?? []) as PenSession[]).sort((a, b) => (markerOf(a)?.from_sec ?? 0) - (markerOf(b)?.from_sec ?? 0))
}

/**
 * "Join back": the parts of a split become one joined meeting again, and the notes are written
 * over the whole of it. The joined timeline is the original's (each part lasts exactly up to the
 * next), so times and citations line up. Returns the first part's id.
 */
export async function joinBack(email: string, sessionId: string): Promise<{ ok: true; primaryId: string } | { ok: false; status: number; error: string }> {
  const rows = await splitSiblings(email, sessionId)
  if (rows.length < 2) return { ok: false, status: 409, error: 'this recording isn\'t split from another one any more' }
  if (rows.some((r) => ['transcribing', 'noting'].includes(r.status))) return { ok: false, status: 409, error: 'the parts are still being written up; try again in a minute' }
  for (const g of new Set(rows.map((r) => r.merge_group).filter((x): x is string => !!x))) await splitGroup(email, g)
  const group = await joinSegments(email, rows.map((r) => r.id))
  const parts = await groupSessions(email, group)
  const { writeNotes } = await import('./pipeline')
  await updateSession(parts[0].id, { briefing_sent_at: null })
  const fresh = await getSession(email, parts[0].id)
  if (fresh) await writeNotes({ email, session: fresh, claim: false }).catch((e) => console.warn(`pen split: join back notes: ${(e as Error).message}`))
  return { ok: true, primaryId: parts[0].id }
}

/** The AssemblyAI transcript a row's translation comes from, and where its lines start in it. */
export function translationSource(s: Pick<PenSession, 'aai_id' | 'transcript'>): { aaiId: string; from: number } | null {
  const m = markerOf(s)
  if (m) return m.aai_id ? { aaiId: m.aai_id, from: m.first_utt } : null
  return s.aai_id ? { aaiId: s.aai_id, from: 0 } : null
}

/** For a page or a chat answer: the parts described in plain data. */
export type { SplitPart, SplitHint }
