// The Juno Pen as a drive, in the browser (21 Oct). Chrome / Edge on a computer only
// (showDirectoryPicker): remember the JUNO drive the person chose once, notice when it is plugged
// in, list its recordings, rewrite MRECSET.TXT, and delete recordings Juno already has safely.
// Everything else (Safari, phones, Firefox) keeps picking files.
//
// The File System Access types aren't in TS's DOM lib, so this file carries the few it uses.
// Nothing here touches the network; usePenDrive does that.

import { PEN_NAME_RE } from '@/lib/pen/pen-device'

export type PenFileH = {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable?(o?: { keepExistingData?: boolean }): Promise<{ write(d: string | Blob): Promise<void>; close(): Promise<void> }>
}
export type PenDirH = {
  kind: 'directory'
  name: string
  values(): AsyncIterable<PenFileH | PenDirH>
  getDirectoryHandle(name: string): Promise<PenDirH>
  getFileHandle(name: string, o?: { create?: boolean }): Promise<PenFileH>
  removeEntry(name: string): Promise<void>
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

/** What was chosen: the JUNO drive itself (root), or its RECORD folder (no clock, no settings). */
export type PenPick = { kind: 'root' | 'record'; handle: PenDirH }

export const SETTINGS_FILE = 'MRECSET.TXT'
const RECORD = 'RECORD'
const AUDIO_RE = /\.(wav|mp3)$/i

/* ------------------------------------------------------------------ dev mock */

// ?penmock=1 (connected, 3 new) · first (never connected) · prompt (needs a click) · nofs (a
// browser without the folder picker, like Safari). Development only: a no-op in production.
export type PenMockMode = 'on' | 'first' | 'prompt' | 'nofs'
export function penMock(): PenMockMode | null {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('penmock')
  return v === '1' ? 'on' : v === 'first' || v === 'prompt' || v === 'nofs' ? v : null
}

/** Chrome / Edge on a computer: the drive can be written to. */
export function canUsePenDrive(): boolean {
  if (typeof window === 'undefined') return false
  const mock = penMock()
  if (mock) return mock !== 'nofs'
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

/** A RIFF/WAV header claiming `sec` seconds at 192 kbps IMA-ADPCM (the real data is absent). */
function mockWav(name: string, sec: number, at: Date): File {
  const byteRate = 24_000
  const h = new DataView(new ArrayBuffer(44))
  const tag = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)))
  tag(0, 'RIFF'); h.setUint32(4, 36 + sec * byteRate, true); tag(8, 'WAVE')
  tag(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 0x11, true); h.setUint16(22, 1, true)
  h.setUint32(24, 48_000, true); h.setUint32(28, byteRate, true); h.setUint16(32, 1024, true); h.setUint16(34, 4, true)
  tag(36, 'data'); h.setUint32(40, sec * byteRate, true)
  return new File([h.buffer], name, { type: 'audio/wav', lastModified: at.getTime() })
}

class MockFile implements PenFileH {
  kind = 'file' as const
  constructor(public name: string, public file: File) {}
  async getFile() { return this.file }
  async createWritable() {
    let next = ''
    return {
      write: async (d: string | Blob) => { next += typeof d === 'string' ? d : await d.text() },
      close: async () => { this.file = new File([next], this.name, { type: 'text/plain', lastModified: Date.now() }) },
    }
  }
}
class MockDir implements PenDirH {
  kind = 'directory' as const
  entries = new Map<string, MockFile | MockDir>()
  constructor(public name: string, private perm: () => PermissionState) {}
  async *values() { for (const e of this.entries.values()) yield e }
  async getDirectoryHandle(n: string) {
    const e = this.entries.get(n)
    if (e?.kind !== 'directory') throw new DOMException('Not found', 'NotFoundError')
    return e
  }
  async getFileHandle(n: string) {
    const e = this.entries.get(n)
    if (e?.kind !== 'file') throw new DOMException('Not found', 'NotFoundError')
    return e
  }
  async removeEntry(n: string) { this.entries.delete(n) }
  async queryPermission() { return this.perm() }
  async requestPermission() { granted = true; return 'granted' as PermissionState }
}
let granted = false
let mockRoot: MockDir | null = null
/** The mock JUNO drive: 3 recordings from today and yesterday, 2 older ones Juno already has. */
export function mockDrive(): MockDir {
  if (mockRoot) return mockRoot
  const mode = penMock()
  granted = mode === 'on'
  const perm = (): PermissionState => (granted ? 'granted' : 'prompt')
  const root = new MockDir('JUNO', perm)
  const rec = new MockDir(RECORD, perm)
  const now = new Date()
  const day = (back: number, h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m, 2)
  const p = (n: number) => String(n).padStart(2, '0')
  const nameOf = (d: Date) => `R${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.WAV`
  for (const [d, sec] of [[day(9, 10, 4), 1500], [day(6, 15, 30), 2200], [day(1, 9, 12), 1680], [day(1, 14, 2), 1260], [day(0, 11, 45), 1860]] as const) {
    rec.entries.set(nameOf(d), new MockFile(nameOf(d), mockWav(nameOf(d), sec, d)))
  }
  root.entries.set(RECORD, rec)
  const set = 'TIME:09:00 2026/01/01\t// set the clock\r\nVOR:0\t// voice activated 0 off 1-7\r\nBIT:4\t// 1 32k 2 64k 3 128k 4 192k\r\nGAIN:5\t// mic gain 1-7\r\nPART:60\t// minutes per file\r\n'
  root.entries.set(SETTINGS_FILE, new MockFile(SETTINGS_FILE, new File([set + '\n'.repeat(512 - set.length)], SETTINGS_FILE, { lastModified: Date.now() })))
  mockRoot = root
  return root
}

/* ------------------------------------------------------------- remembered drive */

const DB = 'juno-pen'
const STORE = 'drive'
function idb<T>(fn: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode)
      const r = fn(tx.objectStore(STORE))
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
      tx.oncomplete = () => open.result.close()
    }
  })
}

/** The drive chosen before, or null (none yet, private window, storage blocked). */
export async function loadPick(): Promise<PenPick | null> {
  const mock = penMock()
  if (mock) return mock === 'first' && !mockPicked ? null : { kind: 'root', handle: mockDrive() }
  try {
    return ((await idb((s) => s.get('pen'), 'readonly')) as PenPick | undefined) ?? null
  } catch {
    return null
  }
}
let mockPicked = false
export async function savePick(p: PenPick): Promise<void> {
  if (penMock()) { mockPicked = true; return }
  try { await idb((s) => s.put(p, 'pen'), 'readwrite') } catch {}
}
export async function forgetPick(): Promise<void> {
  if (penMock()) { mockPicked = false; return }
  try { await idb((s) => s.delete('pen'), 'readwrite') } catch {}
}

/**
 * The folder picker, then a check that it's the pen: the JUNO drive (has RECORD/ or MRECSET.TXT)
 * or its RECORD folder. 'cancel' when they closed it, 'wrong' for any other folder.
 */
export async function pickDrive(): Promise<PenPick | 'cancel' | 'wrong'> {
  let dir: PenDirH
  try {
    if (penMock()) {
      dir = mockDrive()
      granted = true
    } else {
      const pick = (window as unknown as { showDirectoryPicker: (o: { id: string; mode: 'readwrite' }) => Promise<PenDirH> }).showDirectoryPicker
      dir = await pick({ id: 'juno-pen', mode: 'readwrite' })
    }
  } catch {
    return 'cancel'
  }
  let hasRecord = false, hasSettings = false, penAudio = false
  try {
    for await (const e of dir.values()) {
      if (e.kind === 'directory' && e.name.toUpperCase() === RECORD) hasRecord = true
      else if (e.kind === 'file' && e.name.toUpperCase() === SETTINGS_FILE) hasSettings = true
      else if (e.kind === 'file' && PEN_NAME_RE.test(e.name)) penAudio = true
    }
  } catch {
    return 'wrong'
  }
  if (hasRecord || hasSettings) return { kind: 'root', handle: dir }
  if (dir.name.toUpperCase() === RECORD || penAudio) return { kind: 'record', handle: dir }
  return 'wrong'
}

export async function permissionOf(p: PenPick): Promise<PermissionState> {
  try { return (await p.handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted' } catch { return 'prompt' }
}
/** Must run inside a click. */
export async function askPermission(p: PenPick): Promise<boolean> {
  try { return (await p.handle.requestPermission?.({ mode: 'readwrite' })) === 'granted' } catch { return false }
}

/* ------------------------------------------------------------------ the drive */

export type PenRecording = { name: string; file: File; sec: number | null }

async function recordDir(p: PenPick): Promise<PenDirH> {
  return p.kind === 'record' ? p.handle : p.handle.getDirectoryHandle(RECORD)
}

/** Seconds of audio from a WAV header (byte rate and data size), or null. */
async function wavSeconds(file: File): Promise<number | null> {
  try {
    const v = new DataView(await file.slice(0, 4096).arrayBuffer())
    if (v.byteLength < 44 || v.getUint32(0) !== 0x52494646) return null // "RIFF"
    let o = 12, byteRate = 0
    while (o + 8 <= v.byteLength) {
      const id = v.getUint32(o), size = v.getUint32(o + 4, true)
      if (id === 0x666d7420) byteRate = v.getUint32(o + 16, true) // "fmt "
      if (id === 0x64617461) { // "data"
        if (!byteRate) return null
        const data = size > 0 && size !== 0xffffffff ? size : file.size - o - 8
        return data / byteRate
      }
      o += 8 + size + (size % 2)
    }
  } catch {}
  return null
}

/**
 * The pen's recordings, or null when it isn't plugged in (the folder is gone or unreadable).
 * MP3 lengths are estimated at 128 kbps; only WAVs carry a header worth reading.
 */
export async function listRecordings(p: PenPick): Promise<PenRecording[] | null> {
  try {
    const dir = await recordDir(p)
    const out: PenRecording[] = []
    for await (const e of dir.values()) {
      if (e.kind !== 'file' || !AUDIO_RE.test(e.name) || e.name.startsWith('.')) continue
      const file = await e.getFile()
      const sec = /\.wav$/i.test(e.name) ? await wavSeconds(file) : file.size / 16_000
      out.push({ name: e.name, file, sec })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return null
  }
}

/** The settings file's text, or null (picked RECORD only, or no such file, or locked). */
export async function readSettingsFile(p: PenPick): Promise<string | null> {
  if (p.kind !== 'root') return null
  try {
    return await (await (await p.handle.getFileHandle(SETTINGS_FILE)).getFile()).text()
  } catch (e) {
    return (e as DOMException)?.name === 'NotFoundError' ? '' : null
  }
}

/** Writes the settings file (created when missing). False when the pen is read-only or locked. */
export async function writeSettingsFile(p: PenPick, text: string): Promise<boolean> {
  if (p.kind !== 'root') return false
  try {
    const fh = await p.handle.getFileHandle(SETTINGS_FILE, { create: true })
    if (!fh.createWritable) return false
    const w = await fh.createWritable({ keepExistingData: false })
    await w.write(text)
    await w.close()
    return true
  } catch {
    return false
  }
}

/** Deletes these recordings from RECORD/ (audio names only, nothing else). How many went. */
export async function removeRecordings(p: PenPick, names: string[]): Promise<number> {
  let n = 0
  try {
    const dir = await recordDir(p)
    for (const name of names) {
      if (!AUDIO_RE.test(name) || name.includes('/') || name.includes('\\')) continue
      try { await dir.removeEntry(name); n++ } catch {}
    }
  } catch {}
  return n
}

/** When the recording started: the pen's file name (its clock), else the file's date. */
export function penStartOf(file: { name: string; lastModified: number }): Date {
  const m = PEN_NAME_RE.exec(file.name)
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2020) return d
  }
  return new Date(file.lastModified)
}
