'use client'

// Names heard + conversations for the recording on screen, shared by the People section, the
// transcript's Who's who and the Conversations section, so the page asks once and a change in
// one (a confirmed name, a fresh scan) shows in all three.

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getJson, postJson } from '@/lib/pen/http'
import type { NameMention, Segment } from '@/lib/pen/name-hints'

export type RecNames = { names_at: string | null; segments_at: string | null; event_mode: boolean; mentions: NameMention[]; segments: Segment[] }
export type NamesData = { me: string | null; recordings: Record<string, RecNames> }

const cache = new Map<string, NamesData | null>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Every cached view that covers one of these recordings takes the fresh rows. */
export function putNames(next: NamesData) {
  for (const [key, cur] of cache) {
    if (!cur) continue
    const ids = key.split(',')
    if (!ids.some((id) => next.recordings[id])) continue
    const recordings = { ...cur.recordings }
    for (const id of ids) if (next.recordings[id]) recordings[id] = next.recordings[id]
    cache.set(key, { me: next.me ?? cur.me, recordings })
  }
  emit()
}

export async function namesAction(body: Record<string, unknown>): Promise<NamesData> {
  const next = await postJson<NamesData>('/api/pen/names', body)
  putNames(next)
  return next
}

export function useNames(ids: string[]): { data: NamesData | null; reload: () => void } {
  const key = ids.filter(Boolean).join(',')
  const data = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => cache.get(key) ?? null,
    () => null,
  )
  const reload = useCallback(() => {
    if (!key) return
    getJson<NamesData>(`/api/pen/names?ids=${key}`)
      .then((d) => { cache.set(key, d); emit() })
      .catch(() => {})
  }, [key])
  useEffect(() => {
    if (key && !cache.has(key)) {
      cache.set(key, null)
      reload()
    }
  }, [key, reload])
  return { data, reload }
}

/* ------------------------------------------------ splitting into conversations */

const splitting = new Set<string>()
const splitErrors = new Map<string, string>()

/** Starts the split for these recordings; any view of them shows it running. */
export async function startSplit(ids: string[]): Promise<void> {
  const key = ids.join(',')
  if (splitting.has(key)) return
  splitting.add(key)
  splitErrors.delete(key)
  emit()
  try {
    await namesAction({ action: 'split', ids })
  } catch (e) {
    splitErrors.set(key, (e as Error).message || 'failed')
  } finally {
    splitting.delete(key)
    emit()
  }
}

export function useSplitting(ids: string[]): { running: boolean; error: string | null } {
  const key = ids.join(',')
  const running = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => splitting.has(key),
    () => false,
  )
  const error = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => splitErrors.get(key) ?? null,
    () => null,
  )
  return { running, error }
}
