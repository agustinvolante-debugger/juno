// A stall watchdog that knows about background tabs (23 Oct).
//
// The founder's Chrome kept falling back to "upload as-is" with "prep stalled: no progress for
// N s", while headless Chrome never did. He switches apps while a batch uploads. A hidden tab's
// timers are throttled (1 s minimum, then once a minute after 5 minutes hidden), messages and
// WebCodecs work get a lower priority, and a frozen tab runs nothing at all; when it comes back,
// every wall-clock watchdog finds "no progress for 20 s" and fires at once on healthy work.
//
// So this one counts only VISIBLE time without progress, and not the first `graceMs` after the
// tab becomes visible again (the work needs a moment to get going). Hidden time still counts
// towards a generous absolute cap (`capMs`, 3 minutes by default): work that has really died
// in the background is still caught. No DOM in here: the visibility comes from a function, so
// the page, the Web Worker (told by the page) and the unit tests can all drive it.

export type Visibility = { hidden: () => boolean; /** Subscribe to changes; returns the way to stop. */ onChange?: (fn: () => void) => () => void }

export type WatchdogOpts = {
  /** Visible time without progress that counts as stalled. */
  visibleMs: number
  /** Wall-clock time without progress that counts as stalled even while hidden. */
  capMs?: number
  /** After the tab becomes visible again, this long before the visible clock runs. */
  graceMs?: number
  visibility?: Visibility
  now?: () => number
  /** How often to look. Defaults to a quarter of visibleMs, at most 1 s. */
  tickMs?: number
  onStall: (why: { visibleMs: number; wallMs: number; capped: boolean }) => void
}

export const WATCHDOG_CAP_MS = 180_000
export const WATCHDOG_GRACE_MS = 10_000

/** Visible-time accounting, separate from the timer so the tests can drive it by hand. */
export class StallClock {
  private lastKick: number
  private lastT: number
  private visibleAcc = 0
  private graceUntil = 0
  private hidden: boolean
  constructor(private readonly now: () => number, hidden: boolean, private readonly graceMs: number) {
    this.lastKick = this.lastT = now()
    this.hidden = hidden
  }
  private advance() {
    const t = this.now()
    if (!this.hidden) this.visibleAcc += Math.max(0, t - Math.max(this.lastT, this.graceUntil))
    this.lastT = Math.max(this.lastT, t)
  }
  /** Progress: both clocks back to zero. */
  kick() {
    this.advance()
    this.visibleAcc = 0
    this.lastKick = this.lastT
  }
  setHidden(h: boolean) {
    this.advance()
    if (this.hidden && !h) this.graceUntil = this.now() + this.graceMs
    this.hidden = h
  }
  /** Visible ms and wall ms since the last progress. */
  read(): { visibleMs: number; wallMs: number } {
    this.advance()
    return { visibleMs: this.visibleAcc, wallMs: this.lastT - this.lastKick }
  }
}

export type Watchdog = { kick: () => void; stop: () => void; setHidden: (h: boolean) => void }

/** Starts watching at once (the start counts as progress). `kick` on every bit of progress. */
export function startWatchdog(o: WatchdogOpts): Watchdog {
  const now = o.now ?? Date.now
  const cap = o.capMs ?? Math.max(WATCHDOG_CAP_MS, o.visibleMs)
  const clock = new StallClock(now, o.visibility?.hidden() ?? false, o.graceMs ?? WATCHDOG_GRACE_MS)
  let done = false
  const look = () => {
    if (done) return
    const r = clock.read()
    if (r.visibleMs > o.visibleMs || r.wallMs > cap) {
      stop()
      o.onStall({ ...r, capped: r.visibleMs <= o.visibleMs })
    }
  }
  const timer = setInterval(look, o.tickMs ?? Math.max(5, Math.min(1000, Math.floor(o.visibleMs / 4))))
  const off = o.visibility?.onChange?.(() => { clock.setHidden(o.visibility!.hidden()); look() })
  function stop() {
    done = true
    clearInterval(timer)
    off?.()
  }
  return {
    kick: () => clock.kick(),
    stop,
    setHidden: (h) => { clock.setHidden(h); look() },
  }
}

/** The page's visibility, or "always visible" where there is no document (node, a worker). */
export function pageVisibility(): Visibility {
  const d = (globalThis as { document?: Document }).document
  if (!d || typeof d.addEventListener !== 'function') return { hidden: () => false }
  return {
    hidden: () => d.visibilityState === 'hidden',
    onChange: (fn) => {
      d.addEventListener('visibilitychange', fn)
      return () => d.removeEventListener('visibilitychange', fn)
    },
  }
}

/**
 * How long the page has been hidden, for the diagnostics row: the state now, ms hidden in the
 * last minute, and ms hidden since `since`. Installed once per page (trackVisibility).
 */
type Span = { from: number; to: number | null }
const spans: Span[] = []
let tracking = false
export function trackVisibility(): void {
  const d = (globalThis as { document?: Document }).document
  if (tracking || !d || typeof d.addEventListener !== 'function') return
  tracking = true
  if (d.visibilityState === 'hidden') spans.push({ from: Date.now(), to: null })
  d.addEventListener('visibilitychange', () => {
    const t = Date.now()
    if (d.visibilityState === 'hidden') spans.push({ from: t, to: null })
    else { const open = spans[spans.length - 1]; if (open && open.to === null) open.to = t }
    // Only the last hour matters.
    while (spans.length && (spans[0].to ?? t) < t - 3_600_000) spans.shift()
  })
}

export function hiddenMsBetween(from: number, to: number, list: Span[] = spans): number {
  let ms = 0
  for (const s of list) {
    const a = Math.max(from, s.from)
    const b = Math.min(to, s.to ?? to)
    if (b > a) ms += b - a
  }
  return ms
}

export type VisibilitySnapshot = { state: string; hidden_ms_last_min: number; hidden_ms_since_start: number | null; hidden_spans: number }
export function visibilitySnapshot(since?: number): VisibilitySnapshot {
  const d = (globalThis as { document?: Document }).document
  const t = Date.now()
  return {
    state: d?.visibilityState ?? 'unknown',
    hidden_ms_last_min: hiddenMsBetween(t - 60_000, t),
    hidden_ms_since_start: since ? hiddenMsBetween(since, t) : null,
    hidden_spans: since ? spans.filter((s) => (s.to ?? t) > since).length : spans.length,
  }
}
