'use client'

// The recording page's heavy fields (23 Oct, lib/pen/light.ts). The list carries light rows; the
// transcript, translation, chat, deliverables, note blocks and transcript edits of a recording
// load here when it is opened (GET /api/pen/sessions/[id]), one request per part of a joined
// meeting, and again only when that part's status or last write moves on (fullKey).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PenSession } from '@/lib/pen/store'
import { splitHeavy, fullKey, isFullRow, type HeavyKey } from '@/lib/pen/light'

type Heavy = Partial<Pick<PenSession, HeavyKey>>
type Entry = { forKey: string; heavy: Heavy }

export function useFullRows(parts: PenSession[]) {
  const [cache, setCache] = useState<Record<string, Entry>>({})
  const [failed, setFailed] = useState<string | null>(null)
  const inflight = useRef(new Map<string, string>())
  const cacheNow = useRef(cache)
  cacheNow.current = cache

  const want = parts.map((p) => `${p.id}@${fullKey(p)}`).join(',')
  const load = useCallback(async (p: PenSession) => {
    const key = fullKey(p)
    if (inflight.current.get(p.id) === key) return
    inflight.current.set(p.id, key)
    try {
      const r = await fetch(`/api/pen/sessions/${p.id}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || `HTTP ${r.status}`)
      const { session } = (await r.json()) as { session: PenSession }
      const { heavy } = splitHeavy(session as unknown as Record<string, unknown>)
      // Keyed on the list row it was loaded for, so a list that lags the server can't loop.
      setCache((c) => ({ ...c, [p.id]: { forKey: key, heavy: heavy as Heavy } }))
      setFailed(null)
    } catch (e) {
      setFailed((e as Error).message)
    } finally {
      if (inflight.current.get(p.id) === key) inflight.current.delete(p.id)
    }
  }, [])

  useEffect(() => {
    for (const p of parts) {
      const c = cacheNow.current[p.id]
      if (!c || c.forKey !== fullKey(p)) void load(p)
    }
    // `want` covers ids and keys; parts itself is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, load])

  /** The list row with its heavy fields. A list row that carries some itself (a patch) wins. */
  const merge = useCallback((s: PenSession): PenSession => {
    const c = cache[s.id]
    return c ? ({ ...c.heavy, ...s } as PenSession) : s
  }, [cache])

  /**
   * Heavy fields that arrived some other way (a write-up, a chat answer, an edit saved): kept, so
   * the next light list doesn't take them away. A whole row replaces the entry.
   */
  const absorb = useCallback((id: string, row: Record<string, unknown>) => {
    const { light, heavy } = splitHeavy(row)
    if (!Object.keys(heavy).length) return
    setCache((c) => {
      if (isFullRow(row)) return { ...c, [id]: { forKey: fullKey(light as { status?: string; updated_at?: string }), heavy: heavy as Heavy } }
      const e = c[id]
      return e ? { ...c, [id]: { ...e, heavy: { ...e.heavy, ...(heavy as Heavy) } } } : c
    })
  }, [])

  const ready = parts.every((p) => Boolean(cache[p.id]))
  const retry = useCallback(() => { setFailed(null); for (const p of parts) if (!cacheNow.current[p.id]) void load(p) }, [parts, load])
  return { ready, failed, merge, absorb, retry }
}
