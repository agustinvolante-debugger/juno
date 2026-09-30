'use client'
// Tiny client store for Saved (read-later). Signed in → prefs.layout.saved on the server;
// signed out → localStorage on this device. Components subscribe for live updates
// (row stars, the rail's Saved block, the Saved tab) without a page reload.
export type SavedItem = { l: string; t: string; s: string; d: string | null; savedAt: number; done?: boolean }

let items: SavedItem[] = []
let authed = false
let ready = false
const subs = new Set<(x: SavedItem[]) => void>()
const LS = 'db:saved'

function emit() { subs.forEach((f) => f(items)) }
function persistLocal() { try { localStorage.setItem(LS, JSON.stringify(items.slice(0, 100))) } catch { /* private mode */ } }
function post(body: object) {
  if (!authed) { persistLocal(); return }
  fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
}

export function initSaved(initial: SavedItem[], isAuthed: boolean) {
  if (ready) return
  ready = true
  authed = isAuthed
  if (authed) items = initial || []
  else {
    try { items = JSON.parse(localStorage.getItem(LS) || '[]') } catch { items = [] }
  }
  emit()
}

export const getSaved = () => items
export const isSaved = (l: string) => items.some((x) => x.l === l)

export function subscribeSaved(f: (x: SavedItem[]) => void): () => void {
  subs.add(f)
  return () => { subs.delete(f) }
}

export function toggleSaved(it: { l: string; t: string; s: string; d: string | null }): boolean {
  if (isSaved(it.l)) {
    items = items.filter((x) => x.l !== it.l)
    post({ unsave: it.l })
    emit()
    return false
  }
  items = [{ ...it, savedAt: Date.now(), done: false }, ...items].slice(0, 100)
  post({ save: it })
  emit()
  return true
}

export function setDone(l: string, done: boolean) {
  items = items.map((x) => (x.l === l ? { ...x, done } : x))
  post({ saveDone: { l, done } })
  emit()
}

export function removeSaved(l: string) {
  items = items.filter((x) => x.l !== l)
  post({ unsave: l })
  emit()
}
