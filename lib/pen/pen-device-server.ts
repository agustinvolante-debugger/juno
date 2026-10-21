// Server half of the Juno Pen as a USB drive (21 Oct): the stored pen settings and which of the
// pen's files Juno already has. Routes: app/api/pen/pen-settings, app/api/pen/pen-files. The
// shapes are lib/pen/pen-device.ts; tests .pentest/pen-device-unit.mts.
//
// Settings live in the profile JSON (pen_profiles.profile.pen + penSavedAt), cleaned by
// lib/pen/pen-settings.ts cleanPenSettings like every other profile field.
//
// Which files are SAFE to delete from the pen. What Juno stores is usually NOT the pen's file:
// the browser compresses it first (Opus), and pen_sessions.bytes is the size of what went up,
// so "same size as the pen file" can't be checked for those. What is checked instead, per row
// whose source_name is the pen file's name (case-insensitive), any row passing = safe:
//   · status is not 'error'; the row alone is never enough, the audio itself is checked (so no
//     "older than a minute" guess is needed: a half-finished upload has no object of that size)
//   · plain path (`<email>/<ts>-<name>`): the object is in the pen-audio bucket and its size is
//     the row's `bytes` (what the browser uploaded arrived whole)
//   · parts:<n>:<base> (sent as-is in pieces): every piece is there, the pieces add up to
//     `bytes`, and `bytes` is the pen file's size (pieces are the original file, so this one IS
//     the same-size check)
//   · aai: (pieces already stitched into AssemblyAI, the audio is no longer in our bucket): the
//     transcript is done (transcribed / noting / noted) and `bytes` is the pen file's size
//   · audio_deleted_at set (the 90-day job removed it on purpose): safe
// Joined meetings (merge_group / merge_index) are separate rows per file: the same rules, each.
// text: / sample: rows are never a pen file's audio.

import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET, partPaths, PARTS_PREFIX } from './store'
import { getProfileRaw, cleanProfile } from './profile'
import { cleanPenSettings, roleDefaults, withDefaults } from './pen-settings'
import type { PenFileInfo, PenFilesState, PenSettings, PenSettingsGet, PenSettingsPut } from './pen-device'
import { activeConference, effectiveSettings, eventPrepOn, presetOf, upcomingConferences } from './event-prep'
import { userZone } from './timezone'

/* ---------------------------------------------------------------- settings */

export async function readPenSettings(email: string): Promise<{ settings: PenSettings; savedAt: string | null }> {
  const p = await getProfileRaw(email)
  return { settings: withDefaults(p?.pen, roleDefaults(p)), savedAt: p?.penSavedAt ?? null }
}

/**
 * Merges the valid fields of `raw` over what is stored and saves ONLY the fields the user chose:
 * the rest keep following roleDefaults (switching to Student later still moves an untouched
 * sensitivity to soft voices). Returns the full set.
 */
export async function savePenSettings(email: string, raw: unknown, now = new Date()): Promise<{ settings: PenSettings; savedAt: string }> {
  const current = (await getProfileRaw(email)) ?? {}
  const chosen = { ...(cleanPenSettings(current.pen) ?? {}), ...(cleanPenSettings(raw) ?? {}) }
  const settings = withDefaults(chosen, roleDefaults(current))
  const savedAt = now.toISOString()
  const profile = cleanProfile({ ...current, pen: chosen, penSavedAt: savedAt })
  const { error } = await supabaseAdmin
    .from('pen_profiles')
    .upsert({ user_email: email.toLowerCase(), profile, updated_at: savedAt }, { onConflict: 'user_email' })
  if (error) throw new Error(error.message)
  return { settings, savedAt }
}

/** An IANA zone the runtime knows, or null. */
function knownZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return null
  }
}

/** The calendar read never holds up a pen connection longer than this. */
const PRESET_READ_MS = 4000

/**
 * The saved settings, and what to write onto the pen now: with a conference coming (from 18:00
 * the day before) or on, the conference set-up over the saved ones (lib/pen/event-prep.ts, only
 * with PEN_EVENT_PREP=1). `tz`: the browser's zone (the computer the pen is plugged into), else
 * the user's known one. The profile is never written here.
 */
export async function effectivePen(email: string, saved: PenSettings, o: { now?: Date; tz?: string | null } = {}): Promise<{ effective: PenSettings; preset: PenSettingsGet['preset'] }> {
  if (!eventPrepOn()) return { effective: saved, preset: null }
  const now = o.now ?? new Date()
  const tz = knownZone(o.tz) ?? knownZone((await userZone(email).catch(() => null))?.tz) ?? 'UTC'
  let timer: ReturnType<typeof setTimeout> | undefined
  const confs = await Promise.race([
    upcomingConferences(email, now, tz),
    new Promise<never[]>((res) => { timer = setTimeout(() => res([]), PRESET_READ_MS) }),
  ]).finally(() => clearTimeout(timer))
  const preset = presetOf(activeConference(confs, now, tz))
  return { effective: effectiveSettings(saved, preset), preset }
}

/** GET /api/pen/pen-settings. */
export async function penSettingsGet(email: string, o: { now?: Date; tz?: string | null } = {}): Promise<PenSettingsGet> {
  const { settings: saved, savedAt } = await readPenSettings(email)
  const { effective, preset } = await effectivePen(email, saved, o)
  return { settings: effective, saved, savedAt, preset }
}

/** PUT /api/pen/pen-settings: saves, then says what to write onto the pen now. */
export async function penSettingsPut(email: string, raw: unknown, o: { now?: Date; tz?: string | null } = {}): Promise<PenSettingsPut> {
  const r = await savePenSettings(email, raw, o.now)
  const { effective, preset } = await effectivePen(email, r.settings, o)
  return { ...r, effective, preset }
}

/* ------------------------------------------------------------------- files */

export const MAX_PEN_FILES = 500

/** The request body's files, or an error string. Names trimmed; bad entries refuse the whole call. */
export function parsePenFiles(body: unknown): PenFileInfo[] | string {
  const files = (body as { files?: unknown } | null)?.files
  if (!Array.isArray(files)) return 'files must be a list'
  if (files.length > MAX_PEN_FILES) return `at most ${MAX_PEN_FILES} files`
  const out: PenFileInfo[] = []
  for (const f of files) {
    const o = (f ?? {}) as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name || name.length > 255 || /[\\/]/.test(name)) return 'each file needs a plain name'
    if (typeof o.size !== 'number' || !Number.isFinite(o.size) || o.size < 0) return 'each file needs a size'
    const lastModified = typeof o.lastModified === 'number' && Number.isFinite(o.lastModified) ? o.lastModified : 0
    out.push({ name, size: Math.round(o.size), lastModified })
  }
  return out
}

export type PenRow = {
  id: string
  source_name: string | null
  storage_path: string | null
  status: string
  bytes: number | null
  created_at: string
  audio_deleted_at?: string | null
}

/** Object name → size, for the folders asked; a folder that can't be listed is missing (unverified). */
export type ObjectSizes = Map<string, number | null>

/** lib/pen/transcribe.ts AAI_PREFIX (not imported: that module pulls the whole pipeline in). */
const AAI_PREFIX = 'aai:'
const TRANSCRIBED = new Set(['transcribed', 'noting', 'noted'])

/** Is this row's audio safely kept for a pen file of `size` bytes? Pure. */
export function rowSafe(r: PenRow, size: number, objects: ObjectSizes): boolean {
  if (r.status === 'error') return false
  if (r.audio_deleted_at) return true
  const p = r.storage_path ?? ''
  if (!p) return false
  if (p.startsWith(AAI_PREFIX)) return TRANSCRIBED.has(r.status) && r.bytes === size
  if (p.startsWith(PARTS_PREFIX)) {
    const parts = partPaths(p)
    if (!parts.length || r.bytes !== size) return false
    let sum = 0
    for (const part of parts) {
      const s = objects.get(part)
      if (s == null) return false
      sum += s
    }
    return sum === r.bytes
  }
  if (/^(text|sample|parts):/.test(p) || p.startsWith('sample')) return false
  const s = objects.get(p)
  return s != null && r.bytes != null && s === r.bytes
}

/** uploaded / safe from the rows and the bucket listing. Pure. */
export function penFilesFrom(files: PenFileInfo[], rows: PenRow[], objects: ObjectSizes): PenFilesState {
  const byName = new Map<string, PenRow[]>()
  for (const r of rows) {
    const k = (r.source_name ?? '').toLowerCase()
    if (k) byName.set(k, [...(byName.get(k) ?? []), r])
  }
  const uploaded: string[] = []
  const safe: string[] = []
  for (const f of files) {
    const mine = byName.get(f.name.toLowerCase())
    if (!mine?.length) continue
    uploaded.push(f.name)
    if (mine.some((r) => rowSafe(r, f.size, objects))) safe.push(f.name)
  }
  return { uploaded, safe }
}

/** Bucket objects a row's audio lives in (plain path or its pieces). */
function objectPaths(r: PenRow): string[] {
  const p = r.storage_path ?? ''
  if (!p || r.audio_deleted_at) return []
  if (p.startsWith(PARTS_PREFIX)) return partPaths(p)
  if (/^(aai|text|sample|parts):/.test(p) || p.startsWith('sample')) return []
  return [p]
}

const LIST_PAGE = 1000
/** 20 000 objects in one folder; past that the rest stays unverified (= not safe). */
const LIST_PAGES = 20

/** Sizes of the objects in each folder asked, from Supabase storage's listing (metadata.size). */
async function listSizes(folders: string[]): Promise<ObjectSizes> {
  const out: ObjectSizes = new Map()
  for (const folder of folders) {
    for (let page = 0; page < LIST_PAGES; page++) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: LIST_PAGE, offset: page * LIST_PAGE })
      if (error) {
        console.warn(`pen-files: list ${folder}: ${error.message}`)
        break
      }
      for (const o of (data ?? []) as { name: string; metadata?: { size?: unknown } | null }[]) {
        const size = o.metadata?.size
        out.set(`${folder}/${o.name}`, typeof size === 'number' ? size : null)
      }
      if ((data ?? []).length < LIST_PAGE) break
    }
  }
  return out
}

/** The rows of this user named like any of the files (case-insensitive), in chunks. */
async function rowsNamed(email: string, names: string[]): Promise<PenRow[]> {
  const variants = [...new Set(names.flatMap((n) => [n, n.toUpperCase(), n.toLowerCase()]))]
  const out: PenRow[] = []
  const cols = 'id,source_name,storage_path,status,bytes,created_at'
  for (let i = 0; i < variants.length; i += 150) {
    const chunk = variants.slice(i, i + 150)
    let res = await supabaseAdmin.from('pen_sessions').select(`${cols},audio_deleted_at`).eq('user_email', email).in('source_name', chunk)
    // Before the 2026-10-15 ALTER there is no audio_deleted_at: nothing was deleted yet.
    if (res.error && /audio_deleted_at|does not exist|schema cache/i.test(res.error.message)) {
      res = (await supabaseAdmin.from('pen_sessions').select(cols).eq('user_email', email).in('source_name', chunk)) as typeof res
    }
    if (res.error) throw new Error(res.error.message)
    out.push(...((res.data ?? []) as PenRow[]))
  }
  // A mixed-case name ("r20261021-151231.Wav") is caught here only if one of the three spellings matches.
  const wanted = new Set(names.map((n) => n.toLowerCase()))
  const seen = new Set<string>()
  return out.filter((r) => wanted.has((r.source_name ?? '').toLowerCase()) && !seen.has(r.id) && (seen.add(r.id), true))
}

export async function penFilesState(email: string, files: PenFileInfo[]): Promise<PenFilesState> {
  if (!files.length) return { uploaded: [], safe: [] }
  const rows = await rowsNamed(email, files.map((f) => f.name))
  const folders = [...new Set(rows.flatMap(objectPaths).map((p) => p.slice(0, p.lastIndexOf('/'))).filter(Boolean))]
  const objects = folders.length ? await listSizes(folders) : new Map()
  return penFilesFrom(files, rows, objects)
}
