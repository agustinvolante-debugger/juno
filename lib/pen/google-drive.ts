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

import { accessToken, driveConnected } from './google-calendar'

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

/** A block of a Google Doc Juno writes. `todo` is a checkbox item; `link` a line that opens `url`. */
export type GDocBlock =
  | { type: 'heading' | 'paragraph' | 'bullet' | 'todo'; text: string; url?: string | null }
  | { type: 'link'; text: string; url: string }

const MAX_BLOCKS = 400
const MAX_TEXT = 4000
const oneLine = (t: string) => t.replace(/\s*\n\s*/g, ' ').trim()

/**
 * The documents.batchUpdate requests for these blocks (exported for tests): all the text in one
 * insert at index 1, then headings, bullet and checkbox lists (consecutive items share a list)
 * and links over the ranges it made. Indexes are UTF-16 units, as JavaScript counts.
 */
export function docRequests(blocks: GDocBlock[]): Record<string, unknown>[] {
  const paras: { type: GDocBlock['type']; text: string; url: string | null }[] = []
  for (const b of blocks.slice(0, MAX_BLOCKS)) {
    const url = b.url && /^https?:\/\//i.test(b.url) ? b.url : null
    if (b.type === 'paragraph') {
      for (const p of b.text.split(/\n{1,}/).map((x) => x.trim()).filter(Boolean)) paras.push({ type: 'paragraph', text: p.slice(0, MAX_TEXT), url })
    } else {
      const text = oneLine(b.text).slice(0, MAX_TEXT)
      if (text) paras.push({ type: b.type === 'link' && !url ? 'paragraph' : b.type, text, url })
    }
  }
  if (!paras.length) return []
  const all = paras.map((p) => p.text).join('\n') + '\n'
  const reqs: Record<string, unknown>[] = [{ insertText: { location: { index: 1 }, text: all } }]
  let at = 1
  const spans = paras.map((p) => {
    const s = { ...p, start: at, end: at + p.text.length }
    at = s.end + 1 // the newline
    return s
  })
  for (const s of spans) {
    if (s.type === 'heading') {
      reqs.push({ updateParagraphStyle: { range: { startIndex: s.start, endIndex: s.end + 1 }, paragraphStyle: { namedStyleType: 'HEADING_2' }, fields: 'namedStyleType' } })
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
  return reqs
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
