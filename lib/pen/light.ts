// Light lists (23 Oct). Shared by the server (which columns a list reads) and the browser (which
// fields of a recording only arrive when it is opened). No imports: safe on either side.
//
// Why: the recordings list, the 6-second status poll and every refresh read whole rows. A
// two-hour transcript with word timings is megabytes, so a list of 100 was tens of MB per read,
// several reads per finished upload, and the database timed out ("canceling statement due to
// statement timeout", GET /api/pen/sessions 500 after 100 s) during the founder's 4-file batch.
// Now lists carry everything but these, and the recording page loads them for itself.

/** Never in a list read: loaded with GET /api/pen/sessions/[id] when a recording is opened. */
export const HEAVY_COLS = ['transcript', 'translation', 'chat', 'deliverables', 'note_blocks', 'transcript_edits'] as const
export type HeavyKey = (typeof HEAVY_COLS)[number]

/** The heavy fields of a row, and the rest. */
export function splitHeavy<T extends Record<string, unknown>>(row: T): { light: Omit<T, HeavyKey>; heavy: Partial<Pick<T, HeavyKey & keyof T>> } {
  const light: Record<string, unknown> = {}
  const heavy: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if ((HEAVY_COLS as readonly string[]).includes(k)) heavy[k] = v
    else light[k] = v
  }
  return { light: light as Omit<T, HeavyKey>, heavy: heavy as Partial<Pick<T, HeavyKey & keyof T>> }
}

/** A whole row (from getSession / select('*')), not a list row or a patch. */
export function isFullRow(row: Record<string, unknown>): boolean {
  return 'transcript' in row
}

/**
 * When a loaded recording's heavy fields need loading again: its status or last write moved on
 * (a transcript landed, the notes were rewritten, an edit came in from WhatsApp).
 */
export function fullKey(row: { status?: string | null; updated_at?: string | null }): string {
  return `${row.status ?? ''}|${row.updated_at ?? ''}`
}

/**
 * Many calls, one run: calls within `waitMs` of each other share one run of `fn`, and a call
 * that arrives while a run is in flight gets one more run after it (never two at once). Every
 * caller's promise settles when the run that covers its call has finished.
 */
export function coalesce(fn: () => Promise<void>, waitMs: number, timers: { set: typeof setTimeout; clear: typeof clearTimeout } = {
  // Wrapped: a browser's setTimeout called as timers.set(…) throws "Illegal invocation".
  set: ((h: () => void, ms?: number) => setTimeout(h, ms)) as typeof setTimeout,
  clear: (t) => clearTimeout(t),
}): () => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let waiting: { resolve: () => void; reject: (e: unknown) => void }[] = []
  let running = false
  const run = async () => {
    timer = null
    running = true
    const mine = waiting
    waiting = []
    try {
      await fn()
      for (const w of mine) w.resolve()
    } catch (e) {
      for (const w of mine) w.reject(e)
    } finally {
      running = false
      // Calls that came in during the run: one more run for all of them.
      if (waiting.length && !timer) timer = timers.set(run, waitMs)
    }
  }
  return () => new Promise<void>((resolve, reject) => {
    waiting.push({ resolve, reject })
    // The first call opens the window; later ones join it (a steady stream can't starve it).
    if (!running && !timer) timer = timers.set(run, waitMs)
  })
}
