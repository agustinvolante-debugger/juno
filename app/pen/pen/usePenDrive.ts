'use client'

// The Juno Pen drive as React state (21 Oct). Chrome / Edge on a computer:
//   · first time: connectFirst() opens the folder picker (after the picture guide) and remembers
//     the JUNO drive in IndexedDB;
//   · every visit after: on load, on focus and every 5 s while the tab is visible, if the browser
//     still allows it, check the pen is plugged in; if it asks again, state 'prompt' and the card
//     says "click to connect" (a click is required to ask);
//   · on every connection, silently: set the pen's clock and write the saved settings into
//     MRECSET.TXT (only what differs, the clock at most once a minute), and ask Juno which of the
//     pen's recordings it already has.
// Settings → Pen uses it too (files: false), to write a change to the pen straight away.

import { useCallback, useEffect, useRef, useState } from 'react'
import { PEN_DEFAULTS, type PenFileInfo, type PenFilesState, type PenPreset, type PenSettings, type PenSettingsGet, type PenSettingsPut } from '@/lib/pen/pen-device'
import {
  askPermission, canUsePenDrive, forgetPick, listRecordings, loadPick, permissionOf, pickDrive, readSettingsFile,
  removeRecordings, savePick, writeSettingsFile, type PenPick, type PenRecording,
} from './pen-drive'
import { parseMrecset, parseTime, penSettingsToKeys, timeLine, writeMrecset } from '@/lib/pen/pen-settings'

export type PenDriveState = 'off' | 'none' | 'prompt' | 'unplugged' | 'connected'

const POLL_MS = 5_000
const CLOCK_EVERY_MS = 60_000
const CLOCK_KEY = 'juno-pen-clock-at'

/** When Juno last set the pen's clock in this browser (ms), or null. */
export function lastClockSet(): number | null {
  try {
    const v = Number(localStorage.getItem(CLOCK_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/** ?tz=<this computer's zone>: a conference set-up (lib/pen/event-prep.ts) starts at 18:00 here. */
function tzQuery(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz ? `?tz=${encodeURIComponent(tz)}` : ''
  } catch {
    return ''
  }
}

/**
 * GET: `settings` = what to write onto the pen now (a temporary event set-up over the saved ones
 * while `preset` is set), `saved` = the user's own choices (what a form edits).
 */
export async function fetchPenSettingsState(): Promise<{ settings: PenSettings; saved: PenSettings; preset: PenPreset | null } | null> {
  try {
    const r = await fetch(`/api/pen/pen-settings${tzQuery()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = (await r.json()) as PenSettingsGet
    const settings = { ...PEN_DEFAULTS, ...j.settings }
    return { settings, saved: { ...PEN_DEFAULTS, ...(j.saved ?? j.settings) }, preset: j.preset ?? null }
  } catch {
    return null
  }
}

/** What to write onto the pen now. */
export async function fetchPenSettings(): Promise<PenSettings | null> {
  return (await fetchPenSettingsState())?.settings ?? null
}

/** Saves the choices the user just made (only those: the rest keep following their role's
 *  suggestion, lib/pen/pen-settings.ts roleDefaults); `effective` = what to write onto the pen now. */
export async function putPenSettingsState(s: Partial<PenSettings>): Promise<{ saved: PenSettings; effective: PenSettings; preset: PenPreset | null } | null> {
  try {
    const r = await fetch(`/api/pen/pen-settings${tzQuery()}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
    if (!r.ok) return null
    const j = (await r.json()) as PenSettingsPut
    const saved = { ...PEN_DEFAULTS, ...j.settings }
    return { saved, effective: { ...PEN_DEFAULTS, ...(j.effective ?? j.settings) }, preset: j.preset ?? null }
  } catch {
    return null
  }
}

/** Saves the choices the user just made (returns the full saved set). */
export async function putPenSettings(s: Partial<PenSettings>): Promise<PenSettings | null> {
  return (await putPenSettingsState(s))?.saved ?? null
}

export async function fetchPenFiles(files: PenRecording[]): Promise<PenFilesState | null> {
  try {
    const body: { files: PenFileInfo[] } = { files: files.map((f) => ({ name: f.name, size: f.file.size, lastModified: f.file.lastModified })) }
    const r = await fetch('/api/pen/pen-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) return null
    return (await r.json()) as PenFilesState
  } catch {
    return null
  }
}

export type PenDrive = ReturnType<typeof usePenDrive>

export function usePenDrive({ files: wantFiles = true }: { files?: boolean } = {}) {
  const [state, setState] = useState<PenDriveState>('off')
  const [pick, setPick] = useState<PenPick | null>(null)
  const [recordings, setRecordings] = useState<PenRecording[]>([])
  /** Names Juno already has; null until asked (or when the question failed). */
  const [uploaded, setUploaded] = useState<string[] | null>(null)
  /** What is (or will be) on the pen: the saved settings, or a temporary event set-up over them. */
  const [settings, setSettings] = useState<PenSettings | null>(null)
  /** The user's own choices, and the event set-up in force (null = none). */
  const [saved, setSaved] = useState<PenSettings | null>(null)
  const [preset, setPreset] = useState<PenPreset | null>(null)
  /** This connection's clock write: when it happened, or 'failed' (locked / read-only). */
  const [clock, setClock] = useState<number | 'failed' | null>(null)
  const pickRef = useRef<PenPick | null>(null)
  const stateRef = useRef<PenDriveState>('off')
  const settingsRef = useRef<PenSettings | null>(null)
  const clockAt = useRef(0)
  const busy = useRef(false)

  const set = useCallback((s: PenDriveState) => { stateRef.current = s; setState(s) }, [])

  /** MRECSET.TXT ← the clock and `s`, only when something differs or the clock is a minute old. */
  const writePen = useCallback(async (p: PenPick, s: PenSettings | null, force = false): Promise<boolean | null> => {
    if (p.kind !== 'root') return null
    const text = await readSettingsFile(p)
    if (text === null) return false
    const cur = parseMrecset(text)
    const now = new Date()
    const want: Partial<Record<'TIME' | 'VOR' | 'BIT' | 'GAIN' | 'PART', string | number>> = {}
    if (s) for (const [k, v] of Object.entries(penSettingsToKeys(s)) as ['VOR' | 'BIT' | 'GAIN' | 'PART', number][]) if (cur[k] !== v) want[k] = v
    // The TIME line has minute resolution: "a minute old" = not this minute, or unreadable.
    const was = parseTime(cur.TIME)
    const clockOld = !was || Math.abs(now.getTime() - was.getTime()) >= CLOCK_EVERY_MS || clockAt.current === 0
    if (!force && !clockOld && !Object.keys(want).length) return true
    want.TIME = timeLine(now)
    const ok = await writeSettingsFile(p, writeMrecset(text, want))
    if (ok) {
      clockAt.current = Date.now()
      setClock(clockAt.current)
      try { localStorage.setItem(CLOCK_KEY, String(clockAt.current)) } catch {}
    } else {
      setClock('failed')
    }
    return ok
  }, [])

  const refreshFiles = useCallback(async (p: PenPick) => {
    const list = await listRecordings(p)
    if (!list) return null
    setRecordings(list)
    if (wantFiles) {
      const st = await fetchPenFiles(list)
      setUploaded(st ? st.uploaded : null)
      return { list, st }
    }
    return { list, st: null }
  }, [wantFiles])

  /** A fresh connection: list, ask Juno, then the clock and the settings. */
  const onConnected = useCallback(async (p: PenPick) => {
    set('connected')
    await refreshFiles(p)
    // Asked again on every connection: an event set-up starts or ends between two of them.
    const st = await fetchPenSettingsState()
    const s = st?.settings ?? settingsRef.current
    settingsRef.current = s
    setSettings(s)
    if (st) { setSaved(st.saved); setPreset(st.preset) }
    await writePen(p, s)
  }, [refreshFiles, set, writePen])

  /** Is it there? Runs on load, focus and the poll. */
  const check = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const p = pickRef.current ?? (await loadPick())
      pickRef.current = p
      setPick(p)
      if (!p) return set('none')
      if ((await permissionOf(p)) !== 'granted') return set('prompt')
      const present = (await listRecordings(p)) !== null
      if (!present) {
        if (stateRef.current === 'connected') { clockAt.current = 0; setClock(null); setUploaded(null); setRecordings([]) }
        return set('unplugged')
      }
      if (stateRef.current !== 'connected') await onConnected(p)
      else await writePen(p, settingsRef.current) // keeps the clock no more than a minute behind
    } finally {
      busy.current = false
    }
  }, [onConnected, set, writePen])

  useEffect(() => {
    if (!canUsePenDrive()) return
    set('none')
    void check()
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible' && stateRef.current !== 'none' && stateRef.current !== 'prompt') void check()
    }, POLL_MS)
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(t) }
  }, [check, set])

  /** The first time: the folder picker. Must run inside a click. */
  const connectFirst = useCallback(async (): Promise<'ok' | 'cancel' | 'wrong'> => {
    const p = await pickDrive()
    if (p === 'cancel' || p === 'wrong') return p
    await savePick(p)
    pickRef.current = p
    setPick(p)
    await onConnected(p)
    return 'ok'
  }, [onConnected])

  /** The browser forgot the permission: ask again. Must run inside a click. */
  const reconnect = useCallback(async (): Promise<boolean> => {
    const p = pickRef.current
    if (!p || !(await askPermission(p))) return false
    if ((await listRecordings(p)) === null) { set('unplugged'); return false }
    await onConnected(p)
    return true
  }, [onConnected, set])

  /** Settings changed (Settings → Pen): write them now if the pen is here. */
  const applySettings = useCallback(async (s: PenSettings): Promise<boolean> => {
    settingsRef.current = s
    setSettings(s)
    const p = pickRef.current
    if (!p || stateRef.current !== 'connected') return false
    return Boolean(await writePen(p, s, true))
  }, [writePen])

  /** Deletes these from the pen (callers pass only names Juno says are safe). */
  const removeFromPen = useCallback(async (names: string[]): Promise<number> => {
    const p = pickRef.current
    if (!p || !names.length) return 0
    const n = await removeRecordings(p, names)
    await refreshFiles(p)
    return n
  }, [refreshFiles])

  const forget = useCallback(async () => {
    await forgetPick()
    pickRef.current = null
    setPick(null)
    set('none')
  }, [set])

  const newFiles = uploaded ? recordings.filter((r) => !uploaded.includes(r.name)) : []
  return {
    state,
    /** RECORD only was chosen: uploads work, the clock and settings can't be set. */
    recordOnly: pick?.kind === 'record',
    recordings,
    newFiles,
    /** Juno answered which recordings it has (false while asking, or if it failed). */
    known: uploaded !== null,
    settings,
    setSettings: (s: PenSettings) => { settingsRef.current = s; setSettings(s) },
    /** The user's own choices (null until asked); change them with putPenSettings, never from `settings`. */
    saved,
    /** A temporary event set-up on the pen (Juno restores the saved settings after `end`). */
    preset,
    setSettingsState: (st: { settings: PenSettings; saved: PenSettings; preset: PenPreset | null }) => {
      settingsRef.current = st.settings
      setSettings(st.settings)
      setSaved(st.saved)
      setPreset(st.preset)
    },
    clock,
    check,
    connectFirst,
    reconnect,
    applySettings,
    removeFromPen,
    refreshFiles: async () => (pickRef.current ? refreshFiles(pickRef.current) : null),
    forget,
  }
}
