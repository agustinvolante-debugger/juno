// What went wrong in the browser during an upload, kept where we can read it (23 Oct).
//
// Every prep fallback (worker → page, or → uploading the original as-is) and every upload that
// ended in an error posts here (POST /api/pen/prep-log), with how long the tab had been hidden,
// because the leading theory for the founder's as-is fallbacks is background-tab throttling and
// a server log line can't say. The route writes one pen_client_events row (lib/pen/schema.sql);
// before that table exists it only logs. The client half has no DOM dependency beyond the
// visibility snapshot, and the row builder is pure, for the tests.

import { visibilitySnapshot, type VisibilitySnapshot } from './watchdog'

export type ClientEventKind = 'prep-fallback' | 'prep-as-is' | 'upload-failed'
export const CLIENT_EVENT_KINDS: readonly ClientEventKind[] = ['prep-fallback', 'prep-as-is', 'upload-failed']

export type ClientEventBody = {
  kind: ClientEventKind
  name: string
  bytes: number
  stage?: string | null
  pct?: number | null
  reason?: string | null
  visibility?: VisibilitySnapshot | null
  /** The prep attempts, oldest first (stream-prep-client PrepFallback). */
  trail?: { path?: string; stage?: string; pct?: number; error?: string }[]
}

export type ClientEventRow = {
  user_email: string
  at: string
  kind: ClientEventKind
  file_name: string
  file_bytes: number | null
  stage: string | null
  pct: number | null
  reason: string | null
  visibility: { state: string; hidden_ms_last_min: number; hidden_ms_since_start: number | null; hidden_spans: number } | null
  ua: string | null
}

const str = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The row for one event, from an untrusted body. Null = not an event we keep. */
export function clientEventRow(email: string, b: Record<string, unknown>, ua: string | null, now = new Date()): ClientEventRow | null {
  // Older clients (before 23 Oct) sent { name, bytes, outcome, trail }: still kept.
  const outcome = str(b.outcome, 20)
  const kind = (CLIENT_EVENT_KINDS as readonly string[]).includes(str(b.kind, 20))
    ? (b.kind as ClientEventKind)
    : outcome === 'as-is' ? 'prep-as-is' : outcome ? 'prep-fallback' : null
  if (!kind) return null
  const trail = (Array.isArray(b.trail) ? b.trail : []).slice(0, 4).map((t) => (t ?? {}) as Record<string, unknown>)
  const last = trail[trail.length - 1]
  const trailText = trail.map((x) => `${str(x.path, 12)}/${str(x.stage, 8)}@${num(x.pct) ?? '?'}%: ${str(x.error, 200)}`).join(' | ')
  const v = (b.visibility ?? null) as Record<string, unknown> | null
  return {
    user_email: email,
    at: now.toISOString(),
    kind,
    file_name: str(b.name, 200),
    file_bytes: num(b.bytes),
    stage: str(b.stage, 40) || (last ? `${str(last.path, 12)}/${str(last.stage, 8)}` : '') || null,
    pct: num(b.pct) ?? (last ? num(last.pct) : null),
    reason: (str(b.reason, 500) || trailText).slice(0, 1000) || null,
    visibility: v && typeof v === 'object'
      ? {
        state: str(v.state, 12) || 'unknown',
        hidden_ms_last_min: Math.max(0, Math.round(num(v.hidden_ms_last_min) ?? 0)),
        hidden_ms_since_start: num(v.hidden_ms_since_start) === null ? null : Math.round(num(v.hidden_ms_since_start)!),
        hidden_spans: Math.max(0, Math.round(num(v.hidden_spans) ?? 0)),
      }
      : null,
    ua: str(ua, 300) || null,
  }
}

/** Browser side: fire and forget, survives the tab closing (keepalive). */
export function logClientEvent(e: Omit<ClientEventBody, 'visibility'> & { since?: number }): void {
  try {
    const { since, ...rest } = e
    const body: ClientEventBody = { ...rest, trail: rest.trail?.slice(0, 4), visibility: visibilitySnapshot(since) }
    void fetch('/api/pen/prep-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => {})
  } catch {}
}
