// "Import from Granola": each Granola meeting becomes a Juno recording (lib/pen/granola.ts reads
// it, lib/pen/import-text.ts makes it a recording). With a transcript, Juno writes its own notes
// through the normal pipeline, names heard and all; without one, Granola's summary and the
// user's own notes are kept as a notes-only recording.
//
// The same meeting never imports twice: the recording's storage_path is text:granola:<note id>,
// checked before anything is made. Batches run two at a time, in the background.

import { supabaseAdmin } from '@/lib/supabase'
import { getMeeting, listMeetings, noteImport, turnsToText, type GranolaMeeting } from './granola'
import { finishImport, importNotesOnly, importText, MAX_CHARS } from './import-text'
import { getProfile } from './profile'
import { getAllowance } from './allowance'

export const pathOf = (id: string) => `text:granola:${id}`
export const GRANOLA_ID = /^[A-Za-z0-9_-]{6,80}$/

export type ListedMeeting = GranolaMeeting & { imported: boolean }

/** Meetings to pick from, with the ones already in Juno marked. */
export async function listForPicker(email: string, o: { since?: Date; limit?: number } = {}): Promise<ListedMeeting[]> {
  const list = await listMeetings(email, o)
  const done = await importedIds(email, list.map((m) => m.id))
  return list.map((m) => ({ ...m, imported: done.has(m.id) }))
}

async function importedIds(email: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { data } = await supabaseAdmin.from('pen_sessions').select('storage_path').eq('user_email', email).in('storage_path', ids.map(pathOf))
  return new Set((data ?? []).map((r) => (r.storage_path as string).slice('text:granola:'.length)))
}

export type ImportOne = { granolaId: string; id?: string; existing?: boolean; notesOnly?: boolean; error?: string; title?: string }

/** One meeting into Juno. Already imported: that recording, untouched. */
export async function importGranolaMeeting(email: string, granolaId: string, o: { people?: { id?: unknown; name?: unknown }[]; notes?: 'after' | 'now' | 'caller' } = {}): Promise<ImportOne> {
  const storagePath = pathOf(granolaId)
  const prior = await supabaseAdmin.from('pen_sessions').select('id').eq('user_email', email).eq('storage_path', storagePath).limit(1).maybeSingle()
  if (prior.data?.id) return { granolaId, id: prior.data.id, existing: true }

  const m = await getMeeting(email, granolaId)
  const title = m.title.slice(0, 90)
  const sourceName = `Granola: ${m.title}`.slice(0, 200)
  const profile = await getProfile(email).catch(() => ({ name: undefined as string | undefined }))
  const text = m.turns ? turnsToText(m.turns, profile.name) : m.transcriptText
  if (!text?.trim()) {
    const r = await importNotesOnly(email, { title, summary: m.summary, ownNotes: m.privateNotes, sourceName: `Granola (notes only): ${m.title}`.slice(0, 200), storagePath, recordedAt: m.start, durationSec: m.seconds })
    return { granolaId, id: r.id, notesOnly: true, title }
  }
  if (text.length > MAX_CHARS) return { granolaId, error: 'That transcript is too long to import in one go.', title }
  // People on the invite who are also named speakers in the transcript go on the recording
  // as people (matched to contacts by name); the rest of the invite is left to names heard.
  const speakers = new Set((m.turns ?? []).map((t) => t.speaker.trim().toLowerCase()))
  const invited = m.attendees
    .filter((a) => a.email?.toLowerCase() !== m.ownerEmail && a.name?.trim() && speakers.has(a.name.trim().toLowerCase()))
    .slice(0, 8)
    .map((a) => ({ name: a.name!.trim() }))
  const r = await importText(email, {
    text,
    title,
    sourceName,
    people: [...(o.people ?? []), ...invited],
    recordedAt: m.start,
    durationSec: m.seconds,
    storagePath,
    selfLabel: profile.name?.trim() ? undefined : 'Me',
    notes: o.notes,
  })
  return { granolaId, id: r.id, title }
}

/**
 * A batch, two at a time, as a background job. First every meeting becomes a recording (a second
 * or two each), then Juno's notes are written two at a time while the time budget lasts. A
 * recording whose notes didn't fit waits as 'transcribed' and the app writes them when it is
 * next open (its usual fallback). Stops early when the month's hours run out. Nothing is ever
 * imported twice, so running it again only adds what is missing.
 */
export async function importMany(email: string, ids: string[], o: { budgetMs?: number } = {}): Promise<ImportOne[]> {
  const unique = [...new Set(ids.filter((id) => GRANOLA_ID.test(id)))].slice(0, 60)
  const t0 = Date.now()
  const budget = o.budgetMs ?? 270_000
  const { pool } = await import('./event-day')
  const allowance = await getAllowance(email).catch(() => null)
  if (allowance && !allowance.canProcess) {
    const results = unique.map((granolaId) => ({ granolaId, error: 'no recording hours left this month' }))
    await noteImport(email, results.length ? 'No recording hours left this month.' : null)
    return results
  }
  const results = await pool(unique, 2, async (id): Promise<ImportOne> => {
    if (Date.now() - t0 > budget) return { granolaId: id, error: 'not started: out of time, import again for the rest' }
    try {
      return await importGranolaMeeting(email, id, { notes: 'caller' })
    } catch (e) {
      return { granolaId: id, error: (e as Error).message.slice(0, 200) }
    }
  })
  const fresh = results.filter((r) => r.id && !r.existing && !r.notesOnly)
  await pool(fresh, 2, async (r) => {
    if (Date.now() - t0 > budget) return
    await finishImport(email, r.id!)
  })
  const failed = results.filter((r) => r.error)
  await noteImport(email, failed.length ? `${failed.length} of ${results.length} didn’t import: ${failed[0].error}` : null)
  return results
}
