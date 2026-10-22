// 90-day audio retention (founder decision, 15 Oct 2026).
//
// The audio a recording was made from is deleted from our bucket 90 days after it was UPLOADED
// (pen_sessions.created_at; recorded_at comes from the pen's clock, which is often wrong). The
// transcript, notes, names, conversations and the row itself stay: search, WhatsApp and "Ask this
// meeting" all run on the database, never on the audio.
//
//   keep_audio      the user's "Keep this audio": never deleted while it is true
//   audio_deleted_at when the audio went; the recording page says so instead of offering it
//
// A joined meeting (merge_group) is one unit: kept if any part is kept, aged by its LATEST upload,
// and only touched once every part is finished. Deletion ships DISABLED: the cron is a dry run
// unless PEN_AUDIO_DELETE=1, and it refuses to delete at all until the two columns exist
// (2026-10-15 ALTER at the bottom of lib/pen/schema.sql).
//
// Where audio can live, from the upload and transcription code:
//   plain path      `<email>/<ts>-<name>`: one object in pen-audio (the browser's compressed copy
//                   IS the upload; nothing else is written next to it)
//   parts:<n>:<base> pieces `<base>.part0..n-1`, only until transcription stitches them into
//                   AssemblyAI (then storage_path becomes aai:…); a finished recording should have
//                   none left, but any stragglers are removed with it
//   aai: / text: / sample:  nothing in our bucket (AssemblyAI storage, imports, the sample)

import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET, partPaths, PARTS_PREFIX } from './store'
import { AUDIO_DAYS } from './audio-state'

export const RETAIN_DAYS = AUDIO_DAYS
const DAY = 86_400_000

/** The columns a row needs here. Light on purpose: never the transcript. */
export type RetentionRow = {
  id: string
  user_email: string
  status: string
  storage_path: string | null
  created_at: string
  merge_group: string | null
  merge_index: number | null
  bytes: number | null
  audio_deleted_at?: string | null
  keep_audio?: boolean | null
}

export type Unit = {
  /** merge_group, or the session id for a single recording. */
  key: string
  user_email: string
  /** Latest upload among the parts: the meeting is as old as its newest piece. */
  uploaded_at: string
  /** Parts whose audio is still in our bucket (what deleteAudio would remove). */
  sessions: RetentionRow[]
  bytes: number
}

export type Plan = {
  /** Past 90 days, nothing kept, every part finished, audio still there. */
  expired: Unit[]
  /** Past 90 days but the user kept it. */
  kept: Unit[]
  /** Past 90 days but some part is not finished (uploading, held, transcribing, failed). */
  skipped: Unit[]
}

const LIGHT = 'id,user_email,status,storage_path,created_at,merge_group,merge_index,bytes'
const FULL = `${LIGHT},audio_deleted_at,keep_audio`

/** Postgres/PostgREST's way of saying a column is not there yet. */
export const missingColumn = (msg: string | undefined) => !!msg && /audio_deleted_at|keep_audio|does not exist|schema cache/i.test(msg)

/** Object paths in our bucket for one storage_path. [] when the audio is not ours. */
export function audioPaths(storagePath: string | null | undefined): string[] {
  const p = storagePath ?? ''
  if (!p) return []
  if (p.startsWith(PARTS_PREFIX)) return partPaths(p)
  if (/^(aai|text|sample|parts):/.test(p)) return []
  return [p]
}

/** Is there audio of ours behind this recording (and not yet removed)? */
export const hasBucketAudio = (s: { storage_path: string | null; audio_deleted_at?: string | null }) =>
  !s.audio_deleted_at && audioPaths(s.storage_path).length > 0

/** Only 'noted' is finished: every part of a joined meeting is written up before the join. */
const finished = (r: RetentionRow) => r.status === 'noted'

/**
 * The rule, as a pure function of rows (tests run it on made-up rows). `rows` must include every
 * part of any joined meeting in it, old or not, whatever its storage.
 */
export function planUnits(rows: RetentionRow[], now: Date, days = RETAIN_DAYS): Plan {
  const cutoff = now.getTime() - days * DAY
  // One unit per joined meeting, and per audio file: the parts of a split recording share one
  // (lib/pen/split-server.ts), so "keep" on any of them keeps it for all.
  const up = new Map<string, string>()
  const find = (k: string): string => { let x = k; while (up.has(x) && up.get(x) !== x) x = up.get(x)!; return x }
  const join = (a: string, b: string) => {
    if (!up.has(b)) up.set(b, b)
    const ra = find(a), rb = find(b)
    if (ra !== rb) up.set(rb, ra)
  }
  for (const r of rows) {
    if (!up.has(r.id)) up.set(r.id, r.id)
    if (r.merge_group) join(r.id, `g:${r.merge_group}`)
    for (const path of audioPaths(r.storage_path)) join(r.id, `p:${path}`)
  }
  const byRoot = new Map<string, RetentionRow[]>()
  for (const r of rows) byRoot.set(find(r.id), [...(byRoot.get(find(r.id)) ?? []), r])
  // Keyed as before (the meeting's group, or the recording) unless audio is shared across them.
  const groups = new Map<string, RetentionRow[]>()
  for (const [root, parts] of byRoot) {
    const g = parts[0].merge_group
    groups.set(g && parts.every((p) => p.merge_group === g) ? g : parts.length === 1 ? parts[0].id : root, parts)
  }
  const plan: Plan = { expired: [], kept: [], skipped: [] }
  for (const [key, parts] of groups) {
    const live = parts.filter(hasBucketAudio)
    if (!live.length) continue
    const uploaded = Math.max(...parts.map((p) => Date.parse(p.created_at)))
    if (!(uploaded < cutoff)) continue
    const unit: Unit = {
      key,
      user_email: parts[0].user_email,
      uploaded_at: new Date(uploaded).toISOString(),
      sessions: live,
      bytes: live.reduce((n, p) => n + (p.bytes ?? 0), 0),
    }
    if (parts.some((p) => p.keep_audio === true)) plan.kept.push(unit)
    else if (!parts.every(finished)) plan.skipped.push(unit)
    else plan.expired.push(unit)
  }
  const byAge = (a: Unit, b: Unit) => Date.parse(a.uploaded_at) - Date.parse(b.uploaded_at)
  plan.expired.sort(byAge)
  plan.kept.sort(byAge)
  plan.skipped.sort(byAge)
  return plan
}

/** Every row with (possibly) bucket audio, plus every part of the joined meetings among them. */
export async function loadRows(opts: { only?: string } = {}): Promise<{ rows: RetentionRow[]; columns: boolean }> {
  let columns = true
  const page = async (cols: string, from: number) => {
    let q = supabaseAdmin.from('pen_sessions').select(cols)
      .not('storage_path', 'like', 'aai:%').not('storage_path', 'like', 'text:%').not('storage_path', 'like', 'sample%')
      .order('created_at', { ascending: true }).range(from, from + 999)
    if (opts.only) q = q.eq('user_email', opts.only)
    return q
  }
  const rows: RetentionRow[] = []
  for (let from = 0; ; from += 1000) {
    let { data, error } = await page(columns ? FULL : LIGHT, from)
    if (error && columns && missingColumn(error.message)) {
      columns = false
      ;({ data, error } = await page(LIGHT, from))
    }
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as unknown as RetentionRow[]))
    if ((data?.length ?? 0) < 1000) break
  }
  // The other parts of joined meetings, whatever their storage (an aai: part still counts for
  // "kept", "finished" and the latest upload).
  const groups = [...new Set(rows.map((r) => r.merge_group).filter((g): g is string => !!g))]
  const have = new Set(rows.map((r) => r.id))
  for (let i = 0; i < groups.length; i += 100) {
    const { data, error } = await supabaseAdmin.from('pen_sessions').select(columns ? FULL : LIGHT).in('merge_group', groups.slice(i, i + 100))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as RetentionRow[]) if (!have.has(r.id)) { have.add(r.id); rows.push(r) }
  }
  return { rows, columns }
}

/** Recordings whose audio is due to go: `limit` units, oldest first. */
export async function findExpired(opts: { now?: Date; limit?: number; only?: string } = {}): Promise<Plan & { columns: boolean }> {
  const { rows, columns } = await loadRows({ only: opts.only })
  const plan = planUnits(rows, opts.now ?? new Date())
  return { ...plan, expired: plan.expired.slice(0, opts.limit ?? Infinity), columns }
}

export type DeleteResult = { id: string; paths: string[]; removed: number; dry: boolean; marked: boolean }

/**
 * Removes one recording's audio from the bucket, then stamps audio_deleted_at. Nothing else on the
 * row changes. Idempotent: an object already gone counts as deleted (Supabase's remove does not
 * error on a missing path), and a row already stamped is left alone.
 *
 * `markDeleted` exists for tests run before the columns are added; production uses the default.
 */
export async function deleteAudio(
  session: Pick<RetentionRow, 'id' | 'storage_path' | 'audio_deleted_at'>,
  opts: { dry: boolean; markDeleted?: (id: string, at: string) => Promise<void> },
): Promise<DeleteResult> {
  const paths = audioPaths(session.storage_path)
  if (opts.dry || session.audio_deleted_at) return { id: session.id, paths, removed: 0, dry: opts.dry, marked: false }
  let removed = 0
  if (paths.length) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).remove(paths)
    if (error) throw new Error(`audio not removed for ${session.id}: ${error.message}`)
    removed = data?.length ?? 0
  }
  const at = new Date().toISOString()
  const mark = opts.markDeleted ?? (async (id: string, when: string) => {
    const { error } = await supabaseAdmin.from('pen_sessions').update({ audio_deleted_at: when }).eq('id', id).is('audio_deleted_at', null)
    if (error) throw new Error(error.message)
  })
  await mark(session.id, at)
  return { id: session.id, paths, removed, dry: false, marked: true }
}

export type RunResult = {
  dry: boolean
  columns: boolean
  candidates: number
  bytes: number
  deleted: number
  kept: number
  skipped: number
  /** Live run stopped because the time budget ran out; tomorrow's run carries on. */
  partial?: boolean
  errors?: string[]
  refused?: string
}

/**
 * One pass. Dry unless `dry: false` AND the columns exist. Units are deleted oldest first until
 * `budgetMs` runs out; a unit is all its parts or none started.
 */
export async function runRetention(opts: {
  dry: boolean
  now?: Date
  limit?: number
  only?: string
  budgetMs?: number
  markDeleted?: (id: string, at: string) => Promise<void>
}): Promise<RunResult> {
  const t0 = Date.now()
  const plan = await findExpired({ now: opts.now, limit: opts.limit, only: opts.only })
  const base: RunResult = {
    dry: true,
    columns: plan.columns,
    candidates: plan.expired.reduce((n, u) => n + u.sessions.length, 0),
    bytes: plan.expired.reduce((n, u) => n + u.bytes, 0),
    deleted: 0,
    kept: plan.kept.reduce((n, u) => n + u.sessions.length, 0),
    skipped: plan.skipped.reduce((n, u) => n + u.sessions.length, 0),
  }
  if (opts.dry) return base
  // Without keep_audio a kept recording would look unkept, and without audio_deleted_at the page
  // could not say the audio went. Never delete blind.
  if (!plan.columns && !opts.markDeleted) {
    return { ...base, refused: 'pen_sessions is missing audio_deleted_at / keep_audio. Run the 2026-10-15 ALTER in lib/pen/schema.sql first.' }
  }
  const budget = opts.budgetMs ?? 50_000
  const errors: string[] = []
  let deleted = 0
  let partial = false
  for (const unit of plan.expired) {
    if (Date.now() - t0 > budget) { partial = true; break }
    for (const s of unit.sessions) {
      try {
        const r = await deleteAudio(s, { dry: false, markDeleted: opts.markDeleted })
        if (r.marked) deleted++
      } catch (e) {
        errors.push((e as Error).message)
      }
    }
  }
  return { ...base, dry: false, deleted, ...(partial ? { partial } : {}), ...(errors.length ? { errors: errors.slice(0, 10) } : {}) }
}

/** The env switch. Anything but exactly "1" is a dry run. */
export const deleteEnabled = () => process.env.PEN_AUDIO_DELETE === '1'
