// Google Docs & Sheets (15 Oct): Juno writes a recording's notes, a plan it offered, or an export
// of to-dos or contacts into the user's own Google Drive.
//
//   · ONE scope: drive.file (non-sensitive). Juno can create files and read or edit only the files
//     it created; it never sees anything else in their Drive. Asked for incrementally on the same
//     Google connection as Calendar (lib/pen/google-calendar.ts: one pen_gcal row, one token).
//   · Everything goes into a "Juno Pen" folder Juno makes (drive.file allows that). The folder is
//     found again by its appProperties (juno=folder), so nothing new is stored on our side.
//   · A recording's notes go to Docs once: the doc carries appProperties juno_session=<id>, and
//     sending again finds it and opens it (Drive search sees only Juno's own files anyway).
//   · Nothing is created without the user asking (a button, a "yes", a chat request).
//
// Editing (21 Oct), still drive.file, so no new Google review: Juno edits a Doc or Sheet it made,
// or one the user chose for it in the Google Picker (/pen/drive/pick: drive.file grants the app
// exactly the files picked there). Drive's files.list returns only those two kinds of file, so
// "find my price sheet" searches nothing else. Edits keep everything outside the edited range,
// and return an undo record (undoDriveEdit) the chat can keep for "undo that".

import { supabaseAdmin } from '@/lib/supabase'
import { accessToken, driveConnected, hasDrive, open, DRIVE_SCOPE } from './google-calendar'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const DOCS = 'https://docs.googleapis.com/v1'
const SHEETS = 'https://sheets.googleapis.com/v4'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const FOLDER_NAME = 'Juno Pen'

export { driveConnected }

type GErr = { error?: { message?: string; status?: string } }

async function g<T>(email: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken(email)
  const res = await fetch(url, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const j = (await res.json().catch(() => ({}))) as T & GErr
  if (!res.ok) {
    const what = url.replace(/^https:\/\/[^/]+\/(v\d+\/)?/, '').split('?')[0]
    throw Object.assign(new Error(j.error?.message ?? `Google ${what} failed (${res.status})`), { status: res.status })
  }
  return j
}

/* ------------------------------------------------------------ the folder */

const folderCache = new Map<string, string>()
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** The "Juno Pen" folder: found by its appProperties, made if missing (or trashed). */
export async function ensureFolder(email: string): Promise<string> {
  const lower = email.toLowerCase()
  const hit = folderCache.get(lower)
  if (hit) return hit
  const query = `mimeType='${FOLDER_MIME}' and appProperties has { key='juno' and value='folder' } and trashed=false`
  const found = await g<{ files?: { id: string }[] }>(email, `${DRIVE}/files?${new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1', spaces: 'drive' })}`)
  let id = found.files?.[0]?.id
  if (!id) {
    const made = await g<{ id: string }>(email, `${DRIVE}/files?fields=id`, { body: { name: FOLDER_NAME, mimeType: FOLDER_MIME, appProperties: { juno: 'folder' } } })
    id = made.id
  }
  folderCache.set(lower, id)
  return id
}

/** Files it into the folder and tags it. Best effort: a file outside the folder is still a file. */
async function file(email: string, id: string, props: Record<string, string>): Promise<void> {
  try {
    const folder = await ensureFolder(email)
    const cur = await g<{ parents?: string[] }>(email, `${DRIVE}/files/${encodeURIComponent(id)}?fields=parents`)
    const p = new URLSearchParams({ addParents: folder, fields: 'id' })
    const remove = (cur.parents ?? []).filter((x) => x !== folder)
    if (remove.length) p.set('removeParents', remove.join(','))
    await g(email, `${DRIVE}/files/${encodeURIComponent(id)}?${p}`, { method: 'PATCH', body: { appProperties: { juno: '1', ...props } } })
  } catch (e) {
    folderCache.delete(email.toLowerCase())
    console.warn(`pen gdrive: filing ${id} failed: ${(e as Error).message}`)
  }
}

/** A file Juno made earlier with this appProperty (e.g. juno_session=<id>), or null. */
export async function findByProp(email: string, key: string, value: string): Promise<{ id: string; url: string } | null> {
  const query = `appProperties has { key='${q(key)}' and value='${q(value)}' } and trashed=false`
  const r = await g<{ files?: { id: string; webViewLink?: string }[] }>(email, `${DRIVE}/files?${new URLSearchParams({ q: query, fields: 'files(id,webViewLink)', pageSize: '1', spaces: 'drive' })}`)
  const f = r.files?.[0]
  return f ? { id: f.id, url: f.webViewLink ?? `https://docs.google.com/document/d/${f.id}/edit` } : null
}

/* ---------------------------------------------------------------- docs */

/** A block of a Google Doc Juno writes. `todo` is a checkbox item; `link` a line that opens `url`.
 *  `level` (headings only): 0 = Title, 1–6 = Heading 1–6; Heading 2 when absent. */
export type GDocBlock =
  | { type: 'heading' | 'paragraph' | 'bullet' | 'todo'; text: string; url?: string | null; level?: number }
  | { type: 'link'; text: string; url: string }

const MAX_BLOCKS = 400
const MAX_TEXT = 4000
const oneLine = (t: string) => t.replace(/\s*\n\s*/g, ' ').trim()

type Para = { type: GDocBlock['type']; text: string; url: string | null; level?: number }

/** Blocks → one paragraph each (a paragraph block's own line breaks make several), capped. */
function toParas(blocks: GDocBlock[]): Para[] {
  const paras: Para[] = []
  for (const b of blocks.slice(0, MAX_BLOCKS)) {
    const url = b.url && /^https?:\/\//i.test(b.url) ? b.url : null
    if (b.type === 'paragraph') {
      for (const p of b.text.split(/\n{1,}/).map((x) => x.trim()).filter(Boolean)) paras.push({ type: 'paragraph', text: p.slice(0, MAX_TEXT), url })
    } else {
      const text = oneLine(b.text).slice(0, MAX_TEXT)
      const level = b.type === 'heading' && typeof b.level === 'number' && b.level >= 0 && b.level <= 6 ? Math.floor(b.level) : undefined
      if (text) paras.push({ type: b.type === 'link' && !url ? 'paragraph' : b.type, text, url, ...(level !== undefined ? { level } : {}) })
    }
  }
  return paras
}

/**
 * How the inserted text meets the paragraph it lands in:
 *   trail  at the START of an existing paragraph (or a new doc): text + "\n", so the paragraph
 *          that was there follows untouched
 *   lead   at the final newline of a body whose last paragraph has text: "\n" + text, so that
 *          paragraph ends where it did and ours follow (the last of ours keeps the body's newline)
 *   none   at the final newline of an EMPTY last paragraph: the text fills it
 */
export type InsertMode = 'trail' | 'lead' | 'none'

/** The batchUpdate requests to insert these paragraphs at `at`, and the range they took. */
function insertRequests(paras: Para[], at: number, mode: InsertMode, normalize: boolean): { reqs: Record<string, unknown>[]; start: number; end: number; text: string } {
  const body = paras.map((p) => p.text).join('\n')
  const text = mode === 'trail' ? body + '\n' : mode === 'lead' ? '\n' + body : body
  const reqs: Record<string, unknown>[] = [{ insertText: { location: { index: at }, text } }]
  let pos = mode === 'lead' ? at + 1 : at
  const spans = paras.map((p) => {
    const s = { ...p, start: pos, end: pos + p.text.length }
    pos = s.end + 1 // the newline
    return s
  })
  if (normalize) {
    // Inserted text takes on the style of where it lands (a heading, a list, bold): reset it, so
    // only what the blocks say applies.
    const range = { startIndex: spans[0].start, endIndex: spans[spans.length - 1].end + 1 }
    reqs.push({ updateParagraphStyle: { range, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType' } })
    reqs.push({ deleteParagraphBullets: { range } })
    if (range.endIndex - 1 > range.startIndex) {
      reqs.push({ updateTextStyle: { range: { startIndex: range.startIndex, endIndex: range.endIndex - 1 }, textStyle: {}, fields: 'bold,italic,underline,strikethrough,link' } })
    }
  }
  for (const s of spans) {
    if (s.type === 'heading') {
      const named = s.level === 0 ? 'TITLE' : `HEADING_${s.level ?? 2}`
      reqs.push({ updateParagraphStyle: { range: { startIndex: s.start, endIndex: s.end + 1 }, paragraphStyle: { namedStyleType: named }, fields: 'namedStyleType' } })
    }
  }
  // Runs of bullets / to-dos become one list each.
  for (let i = 0; i < spans.length; i++) {
    const t = spans[i].type
    if (t !== 'bullet' && t !== 'todo') continue
    let j = i
    while (j + 1 < spans.length && spans[j + 1].type === t) j++
    reqs.push({ createParagraphBullets: { range: { startIndex: spans[i].start, endIndex: spans[j].end + 1 }, bulletPreset: t === 'todo' ? 'BULLET_CHECKBOX' : 'BULLET_DISC_CIRCLE_SQUARE' } })
    i = j
  }
  for (const s of spans) {
    if (s.url) reqs.push({ updateTextStyle: { range: { startIndex: s.start, endIndex: s.end }, textStyle: { link: { url: s.url } }, fields: 'link' } })
  }
  return { reqs, start: at, end: at + text.length, text }
}

/**
 * The documents.batchUpdate requests for these blocks (exported for tests): all the text in one
 * insert at index 1, then headings, bullet and checkbox lists (consecutive items share a list)
 * and links over the ranges it made. Indexes are UTF-16 units, as JavaScript counts.
 */
export function docRequests(blocks: GDocBlock[]): Record<string, unknown>[] {
  const paras = toParas(blocks)
  if (!paras.length) return []
  return insertRequests(paras, 1, 'trail', false).reqs
}

export type Created = { id: string; url: string }

/** A Google Doc with these blocks, in the "Juno Pen" folder. `props` tag it (appProperties). */
export async function createDoc(email: string, doc: { title: string; blocks: GDocBlock[]; props?: Record<string, string> }): Promise<Created> {
  const title = oneLine(doc.title).slice(0, 200) || 'Juno Pen'
  const made = await g<{ documentId: string }>(email, `${DOCS}/documents`, { body: { title } })
  const requests = docRequests(doc.blocks)
  if (requests.length) await g(email, `${DOCS}/documents/${encodeURIComponent(made.documentId)}:batchUpdate`, { body: { requests } })
  await file(email, made.documentId, doc.props ?? {})
  return { id: made.documentId, url: `https://docs.google.com/document/d/${made.documentId}/edit` }
}

/* --------------------------------------------------------------- sheets */

/** A cell: text, a number, yes/no, or a link (shown as `text`, opens `url`). */
export type Cell = string | number | boolean | null | { text: string; url: string }

const MAX_ROWS = 5000
const MIN_W = 80
const MAX_W = 420

function cellData(c: Cell, bold = false): Record<string, unknown> {
  const fmt = bold ? { userEnteredFormat: { textFormat: { bold: true } } } : {}
  if (c == null || c === '') return { ...fmt }
  if (typeof c === 'number') return { userEnteredValue: { numberValue: c }, ...fmt }
  if (typeof c === 'boolean') return { userEnteredValue: { boolValue: c }, ...fmt }
  if (typeof c === 'object') {
    const url = /^https?:\/\//i.test(c.url) ? c.url : ''
    if (!url) return { userEnteredValue: { stringValue: c.text.slice(0, 1000) }, ...fmt }
    const esc = (s: string) => s.replace(/"/g, '""')
    return { userEnteredValue: { formulaValue: `=HYPERLINK("${esc(url)}","${esc(c.text.slice(0, 200) || url)}")` }, ...fmt }
  }
  // A leading = + - @ would be read as a formula: keep what was said as text.
  return { userEnteredValue: { stringValue: String(c).slice(0, 5000) }, ...fmt }
}

const shown = (c: Cell) => (c == null ? '' : typeof c === 'object' ? c.text : String(c))

/** Pixel widths from the longest text in each column (header included), clamped. */
export function columnWidths(headers: string[], rows: Cell[][]): number[] {
  return headers.map((h, i) => {
    const longest = Math.max(h.length, ...rows.slice(0, 500).map((r) => shown(r[i] ?? null).length))
    return Math.max(MIN_W, Math.min(MAX_W, Math.round(longest * 7.2 + 24)))
  })
}

/** The spreadsheets.create body (exported for tests): bold frozen header, widths, the rows. */
export function sheetBody(s: { title: string; tab?: string; headers: string[]; rows: Cell[][] }): Record<string, unknown> {
  const rows = s.rows.slice(0, MAX_ROWS)
  const widths = columnWidths(s.headers, rows)
  return {
    properties: { title: oneLine(s.title).slice(0, 200) || 'Juno Pen' },
    sheets: [{
      properties: { title: (s.tab ?? 'Sheet1').slice(0, 100), gridProperties: { frozenRowCount: 1, rowCount: Math.max(rows.length + 1, 50), columnCount: Math.max(s.headers.length, 1) } },
      data: [{
        startRow: 0,
        startColumn: 0,
        rowData: [
          { values: s.headers.map((h) => cellData(h, true)) },
          ...rows.map((r) => ({ values: s.headers.map((_, i) => cellData(r[i] ?? null)) })),
        ],
        columnMetadata: widths.map((pixelSize) => ({ pixelSize })),
      }],
    }],
  }
}

/** A Google Sheet with a bold, frozen header row and sized columns, in the "Juno Pen" folder. */
export async function createSheet(email: string, s: { title: string; tab?: string; headers: string[]; rows: Cell[][]; props?: Record<string, string> }): Promise<Created> {
  const made = await g<{ spreadsheetId: string; spreadsheetUrl?: string }>(email, `${SHEETS}/spreadsheets?fields=spreadsheetId,spreadsheetUrl`, { body: sheetBody(s) })
  await file(email, made.spreadsheetId, s.props ?? {})
  return { id: made.spreadsheetId, url: made.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${made.spreadsheetId}/edit` }
}

/* ======================================================= editing (21 Oct) */

const DOC_MIME = 'application/vnd.google-apps.document'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** A Doc or Sheet Juno can open: one it made, or one the user picked for it. */
export type JunoFile = { id: string; name: string; kind: 'doc' | 'sheet'; modified: string | null; url: string }

type GFile = { id: string; name?: string; mimeType?: string; modifiedTime?: string; webViewLink?: string; trashed?: boolean }
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,trashed'

function toFile(f: GFile): JunoFile | null {
  const kind = f.mimeType === DOC_MIME ? 'doc' : f.mimeType === SHEET_MIME ? 'sheet' : null
  if (!kind) return null
  const url = f.webViewLink ?? (kind === 'doc' ? `https://docs.google.com/document/d/${f.id}/edit` : `https://docs.google.com/spreadsheets/d/${f.id}/edit`)
  return { id: f.id, name: f.name ?? '', kind, modified: f.modifiedTime ?? null, url }
}

/** The words of a name search, as Drive query terms (exported for tests). */
export function searchWords(words?: string | null): string[] {
  return (words ?? '').replace(/["'\\]/g, ' ').split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2).slice(0, 6)
}

/** The files.list query (exported for tests): Docs and Sheets, not in the bin, every word in the name. */
export function filesQuery(words?: string | null, kind?: 'doc' | 'sheet'): string {
  const mime = kind === 'doc' ? `mimeType='${DOC_MIME}'` : kind === 'sheet' ? `mimeType='${SHEET_MIME}'` : `(mimeType='${DOC_MIME}' or mimeType='${SHEET_MIME}')`
  return [`trashed=false`, mime, ...searchWords(words).map((w) => `name contains '${q(w)}'`)].join(' and ')
}

/**
 * Juno's Docs and Sheets, most recently changed first. drive.file means Drive returns only the
 * files Juno made or the user picked, so nothing else is ever searched. With `words`, each must
 * be in the name; nothing found that way, the words are tried against the files' text.
 */
export async function listJunoFiles(email: string, words?: string | null, o: { kind?: 'doc' | 'sheet'; limit?: number } = {}): Promise<JunoFile[]> {
  const limit = String(Math.max(1, Math.min(o.limit ?? 20, 50)))
  const list = async (query: string, ordered: boolean) => {
    const p = new URLSearchParams({ q: query, fields: `files(${FILE_FIELDS})`, pageSize: limit, spaces: 'drive', ...(ordered ? { orderBy: 'modifiedTime desc' } : {}) })
    const r = await g<{ files?: GFile[] }>(email, `${DRIVE}/files?${p}`)
    return (r.files ?? []).map(toFile).filter((f): f is JunoFile => !!f)
  }
  const hits = await list(filesQuery(words, o.kind), true)
  const terms = searchWords(words)
  if (hits.length || !terms.length) return hits
  // fullText can't be combined with orderBy; sort here.
  const base = filesQuery(null, o.kind)
  const more = await list(`${base} and fullText contains '${q(terms.join(' '))}'`, false)
  return more.sort((a, b) => String(b.modified ?? '').localeCompare(String(a.modified ?? '')))
}

/** A file id from an id, a docs.google.com / drive.google.com link, or null (exported for tests). */
export function fileIdOf(ref: string): string | null {
  const t = ref.trim()
  const m = t.match(/\/d\/([A-Za-z0-9_-]{20,})/) ?? t.match(/[?&]id=([A-Za-z0-9_-]{20,})/)
  if (m) return m[1]
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null
}

export type Resolved =
  | { ok: true; file: JunoFile }
  | { ok: false; reason: 'no_access' | 'not_found' | 'wrong_kind' | 'ambiguous'; matches?: JunoFile[] }

/** The file a tool call means: an id or link (checked: Juno must be able to open it), or a name. */
export async function resolveFile(email: string, ref: string, kind?: 'doc' | 'sheet'): Promise<Resolved> {
  const id = fileIdOf(ref)
  if (id) {
    let f: GFile
    try {
      f = await g<GFile>(email, `${DRIVE}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS}&supportsAllDrives=true`)
    } catch (e) {
      const st = (e as { status?: number }).status
      if (st === 404 || st === 403) return { ok: false, reason: 'no_access' }
      throw e
    }
    const file = f.trashed ? null : toFile(f)
    if (!file) return { ok: false, reason: f.trashed ? 'not_found' : 'wrong_kind' }
    if (kind && file.kind !== kind) return { ok: false, reason: 'wrong_kind', matches: [file] }
    return { ok: true, file }
  }
  const hits = await listJunoFiles(email, ref, { kind, limit: 10 })
  if (!hits.length) return { ok: false, reason: 'not_found' }
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim()
  const exact = hits.filter((f) => norm(f.name) === norm(ref))
  if (exact.length === 1 || hits.length === 1) return { ok: true, file: exact[0] ?? hits[0] }
  return { ok: false, reason: 'ambiguous', matches: hits.slice(0, 5) }
}

/* ------------------------------------------------------- reading a Doc */

type DocRun = { startIndex?: number; textRun?: { content?: string } }
type DocEl = {
  startIndex?: number
  endIndex?: number
  paragraph?: { elements?: DocRun[]; paragraphStyle?: { namedStyleType?: string }; bullet?: unknown }
  table?: { tableRows?: { tableCells?: { content?: DocEl[] }[] }[] }
  tableOfContents?: { content?: DocEl[] }
  sectionBreak?: unknown
}
export type GDoc = { documentId?: string; title?: string; revisionId?: string; body?: { content?: DocEl[] } }

/** One top-level piece of a Doc: a paragraph (text without its newline), or a table / contents. */
export type DocPara = { start: number; end: number; text: string; style: string; bullet: boolean; table?: boolean }

const runsText = (els: DocRun[] | undefined) => (els ?? []).map((r) => r.textRun?.content ?? '').join('')

function nestedText(content: DocEl[] | undefined): string {
  return (content ?? []).map((el) => {
    if (el.paragraph) return runsText(el.paragraph.elements).replace(/\n$/, '')
    if (el.table) return (el.table.tableRows ?? []).map((r) => (r.tableCells ?? []).map((c) => nestedText(c.content).replace(/\n/g, ' ')).join(' | ')).join('\n')
    return ''
  }).filter(Boolean).join('\n')
}

/** The Doc's top-level paragraphs and tables with their indexes (exported for tests). */
export function docOutline(doc: GDoc): DocPara[] {
  const out: DocPara[] = []
  for (const el of doc.body?.content ?? []) {
    if (el.sectionBreak || el.startIndex == null || el.endIndex == null) continue
    if (el.paragraph) {
      out.push({ start: el.startIndex, end: el.endIndex, text: runsText(el.paragraph.elements).replace(/\n$/, ''), style: el.paragraph.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT', bullet: !!el.paragraph.bullet })
    } else if (el.table || el.tableOfContents) {
      out.push({ start: el.startIndex, end: el.endIndex, text: nestedText(el.table ? [el] : el.tableOfContents?.content), style: 'NORMAL_TEXT', bullet: false, table: true })
    }
  }
  return out
}

/** 0 for Title, 1–6 for Heading 1–6, null for anything else. */
export function headingLevel(style: string): number | null {
  if (style === 'TITLE') return 0
  const m = style.match(/^HEADING_([1-6])$/)
  return m ? Number(m[1]) : null
}

/** The Doc as plain text for the model: "# " headings, "- " bullets, capped (exported for tests). */
export function docText(outline: DocPara[], max = 12000): { text: string; truncated: boolean } {
  const lines = outline.map((p) => {
    const lv = headingLevel(p.style)
    if (lv != null) return `${'#'.repeat(Math.max(lv, 1))} ${p.text}`
    return p.bullet ? `- ${p.text}` : p.text
  })
  const text = lines.join('\n')
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false }
}

/** The characters at [start, end) of the Doc, from its text runs (tables included). */
export function docSlice(doc: GDoc, start: number, end: number): string {
  const chars: string[] = []
  const walk = (content: DocEl[] | undefined) => {
    for (const el of content ?? []) {
      if (el.paragraph) {
        for (const r of el.paragraph.elements ?? []) {
          const c = r.textRun?.content
          if (c == null || r.startIndex == null) continue
          for (let i = 0; i < c.length; i++) {
            const at = r.startIndex + i
            if (at >= start && at < end) chars[at - start] = c[i]
          }
        }
      }
      if (el.table) for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) walk(cell.content)
      if (el.tableOfContents) walk(el.tableOfContents.content)
    }
  }
  walk(doc.body?.content)
  let out = ''
  for (let i = 0; i < end - start; i++) out += chars[i] ?? '\u0000'
  return out
}

/** Paragraphs back to blocks (an undo puts replaced text back). Tables come back as plain lines. */
export function outlineBlocks(paras: DocPara[]): GDocBlock[] {
  const out: GDocBlock[] = []
  for (const p of paras) {
    if (p.table) {
      for (const line of p.text.split('\n').filter((x) => x.trim())) out.push({ type: 'paragraph', text: line })
      continue
    }
    if (!p.text.trim()) continue
    const lv = headingLevel(p.style)
    out.push(lv != null ? { type: 'heading', text: p.text, level: lv } : p.bullet ? { type: 'bullet', text: p.text } : { type: 'paragraph', text: p.text })
  }
  return out
}

/* ------------------------------------------------------- editing a Doc */

export type DocEditMode = 'append' | 'replace_section' | 'replace_all' | 'insert_after_heading'

/**
 * Enough to take a Doc edit back: delete what was inserted (if it is still exactly there), put
 * back what was replaced (text and headings/bullets; not bold, links, images or table layout),
 * and give the paragraph an append ran into its style again.
 */
export type DocUndo = {
  kind: 'doc'
  fileId: string
  name: string
  inserted: { start: number; end: number; text: string }
  restore: { at: number; mode: InsertMode; blocks: GDocBlock[] } | null
  restyle: { at: number; namedStyleType: string } | null
}

export type DocPlan =
  | { ok: true; requests: Record<string, unknown>[]; undo: Omit<DocUndo, 'fileId' | 'name'>; replaced: string }
  | { ok: false; error: string; headings?: string[] }

const normHead = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The heading `want` names: an exact (accent- and case-blind) match first, then one containing it. */
export function findHeading(outline: DocPara[], want: string): DocPara | null {
  const hs = outline.filter((p) => !p.table && headingLevel(p.style) != null && p.text.trim())
  const w = normHead(want)
  if (!w) return null
  return hs.find((h) => normHead(h.text) === w) ?? hs.find((h) => normHead(h.text).includes(w)) ?? hs.find((h) => w.includes(normHead(h.text)) && normHead(h.text).length >= 3) ?? null
}

/**
 * The batchUpdate for an edit (pure; exported for tests). Indexes are the Doc's own (UTF-16).
 *   append                after the last paragraph
 *   replace_all           everything replaced
 *   insert_after_heading  at the END of that heading's section (after what is already under it,
 *                         before the next heading of the same or a higher level)
 *   replace_section       what is under that heading replaced; the heading itself stays
 */
export function planDocEdit(doc: GDoc, mode: DocEditMode, blocks: GDocBlock[], heading?: string | null): DocPlan {
  const paras = toParas(blocks)
  if (!paras.length) return { ok: false, error: 'nothing to write: give the content as blocks' }
  const outline = docOutline(doc)
  const content = doc.body?.content ?? []
  const E = Math.max(1, ...content.map((el) => el.endIndex ?? 0))
  const last = outline[outline.length - 1]
  const atEnd = (): { at: number; mode: InsertMode; restyle: DocUndo['restyle'] } =>
    !last || (!last.table && last.text === '')
      ? { at: E - 1, mode: 'none', restyle: null }
      : { at: E - 1, mode: 'lead', restyle: last.table ? null : { at: last.start, namedStyleType: last.style } }

  let del: { start: number; end: number } | null = null
  let spot: { at: number; mode: InsertMode; restyle: DocUndo['restyle'] }

  if (mode === 'append') {
    spot = atEnd()
  } else if (mode === 'replace_all') {
    del = E - 1 > 1 ? { start: 1, end: E - 1 } : null
    spot = { at: 1, mode: 'none', restyle: null }
  } else {
    if (!heading?.trim()) return { ok: false, error: 'say which heading' }
    const h = findHeading(outline, heading)
    if (!h) {
      return { ok: false, error: `no heading "${heading.slice(0, 80)}" in this Doc`, headings: outline.filter((p) => headingLevel(p.style) != null && p.text.trim()).map((p) => p.text).slice(0, 30) }
    }
    const lv = headingLevel(h.style)!
    const next = outline.find((p) => p.start > h.start && !p.table && headingLevel(p.style) != null && headingLevel(p.style)! <= lv && p.text.trim())
    if (mode === 'insert_after_heading') {
      spot = next ? { at: next.start, mode: 'trail', restyle: null } : atEnd()
    } else if (next) {
      del = next.start > h.end ? { start: h.end, end: next.start } : null
      spot = { at: h.end, mode: 'trail', restyle: null }
    } else if (h.end >= E) {
      spot = atEnd()
    } else {
      del = E - 1 > h.end ? { start: h.end, end: E - 1 } : null
      spot = { at: h.end, mode: 'none', restyle: null }
    }
  }

  const old = del ? outline.filter((p) => p.start >= del!.start && p.start < del!.end) : []
  const ins = insertRequests(paras, spot.at, spot.mode, true)
  const requests = [...(del ? [{ deleteContentRange: { range: { startIndex: del.start, endIndex: del.end } } }] : []), ...ins.reqs]
  const restoreBlocks = outlineBlocks(old)
  return {
    ok: true,
    requests,
    replaced: docText(old, 4000).text,
    undo: {
      kind: 'doc',
      inserted: { start: ins.start, end: ins.end, text: ins.text },
      restore: restoreBlocks.length ? { at: spot.at, mode: spot.mode, blocks: restoreBlocks } : null,
      restyle: spot.restyle,
    },
  }
}

/** The batchUpdate that takes an edit back, or why it can't (the Doc changed since). Pure. */
export function planDocUndo(doc: GDoc, rec: DocUndo): { ok: true; requests: Record<string, unknown>[] } | { ok: false; error: string } {
  const { start, end, text } = rec.inserted
  if (docSlice(doc, start, end) !== text) return { ok: false, error: 'the Doc changed since, so Juno won’t guess: use File → Version history in Google Docs' }
  const requests: Record<string, unknown>[] = [{ deleteContentRange: { range: { startIndex: start, endIndex: end } } }]
  const paras = rec.restore ? toParas(rec.restore.blocks) : []
  if (rec.restore && paras.length) requests.push(...insertRequests(paras, rec.restore.at, rec.restore.mode, true).reqs)
  if (rec.restyle) requests.push({ updateParagraphStyle: { range: { startIndex: rec.restyle.at, endIndex: rec.restyle.at + 1 }, paragraphStyle: { namedStyleType: rec.restyle.namedStyleType }, fields: 'namedStyleType' } })
  return { ok: true, requests }
}

const getDoc = (email: string, id: string) => g<GDoc>(email, `${DOCS}/documents/${encodeURIComponent(id)}`)

/** documents.batchUpdate, refused by Google if the Doc changed after `revision` was read. */
const docUpdate = (email: string, id: string, requests: Record<string, unknown>[], revision?: string) =>
  g(email, `${DOCS}/documents/${encodeURIComponent(id)}:batchUpdate`, { body: { requests, ...(revision ? { writeControl: { requiredRevisionId: revision } } : {}) } })

/** Edits a Doc Juno can open. Returns the undo record and what was replaced (for the reply). */
export async function editDoc(email: string, file: JunoFile, mode: DocEditMode, blocks: GDocBlock[], heading?: string | null): Promise<{ ok: true; undo: DocUndo; replaced: string } | { ok: false; error: string; headings?: string[] }> {
  const doc = await getDoc(email, file.id)
  const plan = planDocEdit(doc, mode, blocks, heading)
  if (!plan.ok) return plan
  await docUpdate(email, file.id, plan.requests, doc.revisionId)
  return { ok: true, undo: { ...plan.undo, fileId: file.id, name: file.name }, replaced: plan.replaced }
}

/* ----------------------------------------------------- editing a Sheet */

export type SheetValue = string | number | boolean

/** 0 → A, 25 → Z, 26 → AA. */
export function colName(n: number): string {
  let s = ''
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

/** "B12" → { c: 1, r: 11 } (0-based), or null. */
export function parseCell(a1: string): { c: number; r: number } | null {
  const m = a1.trim().toUpperCase().replace(/\$/g, '').match(/^([A-Z]{1,3})([1-9]\d{0,6})$/)
  if (!m) return null
  const c = [...m[1]].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  return { c, r: Number(m[2]) - 1 }
}

export const quoteTab = (t: string) => `'${t.replace(/'/g, "''")}'`

/** "Sheet 1" + "B2" + a 2×3 block → "'Sheet 1'!B2:D3" (exported for tests). */
export function blockRange(tab: string, start: { c: number; r: number }, rows: unknown[][]): string {
  const h = Math.max(rows.length, 1)
  const w = Math.max(1, ...rows.map((r) => r.length))
  return `${quoteTab(tab)}!${colName(start.c)}${start.r + 1}:${colName(start.c + w - 1)}${start.r + h}`
}

/** "Prices!B2:C4" / "B2" → the tab named in it (if any) and its first cell. */
export function splitRange(range: string): { tab: string | null; start: { c: number; r: number } | null } {
  const t = range.trim()
  const bang = t.lastIndexOf('!')
  const tabRaw = bang >= 0 ? t.slice(0, bang) : null
  const tab = tabRaw ? tabRaw.replace(/^'(.*)'$/, '$1').replace(/''/g, "'") : null
  const cells = (bang >= 0 ? t.slice(bang + 1) : t).split(':')[0]
  return { tab, start: parseCell(cells) }
}

const NUMERIC = /^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$/

/**
 * What a tool call gives → what the Sheet gets (exported for tests): numbers stay numbers, and so
 * do plain number strings ("1200", "-3.5"; not "0123", not "$1,200"); yes/no stays; empty is "".
 * Written RAW, so a text starting with "=" stays text and never becomes a formula.
 */
export function sheetValues(rows: unknown[], width = 50): SheetValue[][] {
  return rows.filter(Array.isArray).slice(0, MAX_ROWS).map((r) =>
    (r as unknown[]).slice(0, width).map((c): SheetValue => {
      if (typeof c === 'number') return Number.isFinite(c) ? c : ''
      if (typeof c === 'boolean') return c
      if (c == null) return ''
      const s = String(c).slice(0, 5000)
      return NUMERIC.test(s.trim()) ? Number(s.trim()) : s
    }),
  )
}

type SheetMeta = { properties?: { title?: string }; sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[] }

export async function sheetTabs(email: string, id: string): Promise<string[]> {
  const m = await g<SheetMeta>(email, `${SHEETS}/spreadsheets/${encodeURIComponent(id)}?fields=properties.title,sheets.properties(sheetId,title,gridProperties)`)
  return (m.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean)
}

/** The tab a call means: by name (case-blind), else the first. */
export function pickTab(tabs: string[], want?: string | null): string | null {
  if (!tabs.length) return null
  if (!want?.trim()) return tabs[0]
  const w = want.trim().toLowerCase()
  return tabs.find((t) => t.toLowerCase() === w) ?? tabs.find((t) => t.toLowerCase().includes(w)) ?? null
}

/**
 * Enough to take a Sheet edit back: the range written and what was written there (to check
 * nobody changed it since), and the values (formulas included) that were there before.
 */
export type SheetUndo = {
  kind: 'sheet'
  fileId: string
  name: string
  written: string | null
  wrote: SheetValue[][]
  prev: { range: string; values: unknown[][] } | null
}

export type SheetEditMode = 'append_rows' | 'update_cells' | 'replace_table'

const MAX_UNDO_CELLS = 50_000
const vals = (id: string, range: string, extra = '') => `${SHEETS}/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}${extra}`

/** Edits a Sheet Juno can open. append_rows: after the table; update_cells: at `range`; replace_table: the whole tab. */
export async function editSheet(
  email: string,
  file: JunoFile,
  o: { mode: SheetEditMode; sheet?: string | null; rows?: unknown[]; range?: string | null },
): Promise<{ ok: true; undo: SheetUndo | null; range: string; cells: number } | { ok: false; error: string; tabs?: string[] }> {
  const fromRange = o.range ? splitRange(o.range) : null
  const tabs = await sheetTabs(email, file.id)
  const tab = pickTab(tabs, o.sheet || fromRange?.tab)
  if (!tab) return { ok: false, error: `no tab "${o.sheet || fromRange?.tab}" in this Sheet`, tabs }
  const values = sheetValues(o.rows ?? [])
  if (!values.length || !values.some((r) => r.length)) return { ok: false, error: 'give the rows to write' }
  const cells = values.reduce((n, r) => n + r.length, 0)
  const base = { kind: 'sheet' as const, fileId: file.id, name: file.name }

  if (o.mode === 'append_rows') {
    const r = await g<{ updates?: { updatedRange?: string } }>(email, vals(file.id, `${quoteTab(tab)}!A1`, ':append?valueInputOption=RAW&insertDataOption=OVERWRITE'), { body: { values } })
    const written = r.updates?.updatedRange ?? null
    return { ok: true, range: written ?? tab, cells, undo: { ...base, written, wrote: values, prev: null } }
  }
  if (o.mode === 'update_cells') {
    const start = fromRange?.start
    if (!start) return { ok: false, error: 'give the range to change, like B2 or B2:D5 (read the Sheet first)' }
    const range = blockRange(tab, start, values)
    const before = await g<{ values?: unknown[][] }>(email, vals(file.id, range, '?valueRenderOption=FORMULA'))
    await g(email, vals(file.id, range, '?valueInputOption=RAW'), { method: 'PUT', body: { range, majorDimension: 'ROWS', values } })
    return { ok: true, range, cells, undo: { ...base, written: range, wrote: values, prev: { range, values: before.values ?? [] } } }
  }
  // replace_table: the tab's old contents (for undo), cleared, then the new table from A1.
  const before = await g<{ values?: unknown[][] }>(email, vals(file.id, quoteTab(tab), '?valueRenderOption=FORMULA'))
  const old = before.values ?? []
  const oldCells = old.reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0)
  await g(email, vals(file.id, quoteTab(tab), ':clear'), { body: {} })
  const range = blockRange(tab, { c: 0, r: 0 }, values)
  await g(email, vals(file.id, range, '?valueInputOption=RAW'), { method: 'PUT', body: { range, majorDimension: 'ROWS', values } })
  // Too big to keep: no undo (clearing the new table alone would lose the old one for good).
  if (oldCells > MAX_UNDO_CELLS) return { ok: true, range, cells, undo: null }
  const prev = old.length ? { range: blockRange(tab, { c: 0, r: 0 }, old), values: old } : null
  return { ok: true, range, cells, undo: { ...base, written: range, wrote: values, prev } }
}

/** True when what is in the range now is what the edit wrote (exported for tests). */
export function sameValues(now: unknown[][], wrote: SheetValue[][]): boolean {
  for (let r = 0; r < wrote.length; r++) {
    for (let c = 0; c < wrote[r].length; c++) {
      const a = now[r]?.[c]
      if (String(a ?? '') !== String(wrote[r][c] ?? '')) return false
    }
  }
  return true
}

/* ------------------------------------------------------------- reading */

export type FileRead =
  | { kind: 'doc'; file: JunoFile; text: string; truncated: boolean; headings: string[] }
  | { kind: 'sheet'; file: JunoFile; tabs: string[]; sheet: string; rows: { row: number; values: unknown[] }[]; total_rows: number; truncated: boolean }

const MAX_READ_ROWS = 200
const MAX_READ_COLS = 26

/** What is in a Doc (text, headings) or a Sheet tab (rows with their row numbers), capped. */
export async function readFile(email: string, file: JunoFile, o: { sheet?: string | null } = {}): Promise<FileRead | { error: string; tabs?: string[] }> {
  if (file.kind === 'doc') {
    const outline = docOutline(await getDoc(email, file.id))
    const t = docText(outline)
    return { kind: 'doc', file, text: t.text, truncated: t.truncated, headings: outline.filter((p) => headingLevel(p.style) != null && p.text.trim()).map((p) => p.text).slice(0, 50) }
  }
  const tabs = await sheetTabs(email, file.id)
  const tab = pickTab(tabs, o.sheet)
  if (!tab) return { error: `no tab "${o.sheet}" in this Sheet`, tabs }
  const r = await g<{ values?: unknown[][] }>(email, vals(file.id, quoteTab(tab), '?valueRenderOption=FORMATTED_VALUE'))
  const all = r.values ?? []
  const wide = all.some((row) => Array.isArray(row) && row.length > MAX_READ_COLS)
  return {
    kind: 'sheet',
    file,
    tabs,
    sheet: tab,
    rows: all.slice(0, MAX_READ_ROWS).map((v, i) => ({ row: i + 1, values: (Array.isArray(v) ? v : []).slice(0, MAX_READ_COLS) })),
    total_rows: all.length,
    truncated: all.length > MAX_READ_ROWS || wide,
  }
}

/* ---------------------------------------------------------------- undo */

export type DriveUndo = DocUndo | SheetUndo

/**
 * Takes an edit back. The agent core keeps the record an edit returned (`undo` in the tool
 * result's private part) and calls this for "undo that". Refuses, without touching anything, if
 * the file changed after the edit (someone typed in it): then Google's version history is the way.
 */
export async function undoDriveEdit(email: string, rec: DriveUndo): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    if (rec.kind === 'doc') {
      const doc = await getDoc(email, rec.fileId)
      const plan = planDocUndo(doc, rec)
      if (!plan.ok) return plan
      await docUpdate(email, rec.fileId, plan.requests, doc.revisionId)
      return { ok: true, name: rec.name }
    }
    if (rec.written) {
      const now = await g<{ values?: unknown[][] }>(email, vals(rec.fileId, rec.written, '?valueRenderOption=UNFORMATTED_VALUE'))
      if (!sameValues(now.values ?? [], rec.wrote)) return { ok: false, error: 'the Sheet changed since, so Juno won’t guess: use File → Version history in Google Sheets' }
      await g(email, vals(rec.fileId, rec.written, ':clear'), { body: {} })
    }
    if (rec.prev && rec.prev.values.length) {
      // USER_ENTERED, so the formulas that were there come back as formulas.
      await g(email, vals(rec.fileId, rec.prev.range, '?valueInputOption=USER_ENTERED'), { method: 'PUT', body: { range: rec.prev.range, majorDimension: 'ROWS', values: rec.prev.values } })
    }
    return { ok: true, name: rec.name }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/* ------------------------------------------------- the Picker's token */

/**
 * A short-lived access token for the Google Picker on /pen/drive/pick, asked of Google for
 * drive.file ONLY (a refresh may narrow the grant), so the browser never holds a token that can
 * touch the calendar. The refresh token never leaves the server. Null when Docs & Sheets isn't on.
 */
export async function pickerToken(email: string): Promise<{ accessToken: string; expiresIn: number; account: string | null } | null> {
  const lower = email.toLowerCase()
  const { data, error } = await supabaseAdmin.from('pen_gcal').select('refresh_token,scope,calendar_email,last_error').eq('email', lower).maybeSingle()
  const row = data as { refresh_token?: string; scope?: string | null; calendar_email?: string | null; last_error?: string | null } | null
  if (error || !row?.refresh_token || row.last_error || !hasDrive(row.scope)) return null
  const account = row.calendar_email ?? null
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token', refresh_token: open(row.refresh_token), scope: DRIVE_SCOPE }).toString(),
    })
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string }
    if (res.ok && j.access_token && (!j.scope || j.scope.split(/\s+/).every((s) => s === DRIVE_SCOPE || s === 'openid' || s.endsWith('userinfo.email')))) {
      return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600, account }
    }
  } catch {
    /* falls through to the shared token, which also marks a revoked grant */
  }
  // Google wouldn't narrow it: the connection's own short-lived token (same user, same browser).
  return { accessToken: await accessToken(lower), expiresIn: 3000, account }
}

/** After a pick: the files Juno can now open (each checked with Drive), for the success screen. */
export async function pickedFiles(email: string, ids: string[]): Promise<JunoFile[]> {
  const out: JunoFile[] = []
  for (const id of [...new Set(ids)].slice(0, 5)) {
    const r = await resolveFile(email, id).catch(() => null)
    if (r?.ok) out.push(r.file)
  }
  return out
}
