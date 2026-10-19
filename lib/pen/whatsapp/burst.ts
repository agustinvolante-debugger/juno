// Several texts in a row are one turn (19 Oct: "hey" + "i need you to draft an email" two seconds
// apart got two replies, and "ill let u know how" + "give me a sec" two near-identical ones). Pure,
// for tests (.pentest/burst-test.mts); bot.ts does the waiting, store.ts the lock and the claim.
//
//   · Each text is recorded (pen_whatsapp_messages, state 'received', its words in payload.text)
//     and waits QUIET_MS. If a newer text from the same sender came in meanwhile, it steps aside:
//     the newest one answers. That one answers ONCE, with every unanswered text joined in order.
//     A burst that never pauses is answered CAP_MS after its first message anyway.
//   · One turn at a time per phone (store.ts takeLock, a lease so a crash can't wedge the chat).
//     Texts that arrive while an answer is being written wait and are the next turn.
//   · The batch's messages move received → answering → done together (compare-and-set), so none
//     is answered twice and none is dropped.
//   · A bare yes / no / "send it" to a question already on screen is not batched: it is answered
//     at once (as before), alone, unless texts sent before it are still unanswered (then it is
//     part of that burst). A yes typed before the question existed never confirms it (agent.ts
//     sentAt): "delete the Malibu call" + "yes" in one breath must still see the question first.

export const QUIET_MS = Number(process.env.PEN_BURST_QUIET_MS) || 4000
export const CAP_MS = Number(process.env.PEN_BURST_CAP_MS) || 15000
/** Texts older than this are never swept into a turn (rows from before batching, stuck ones). */
export const WINDOW_MS = 10 * 60 * 1000

export type BurstRow = { id: string; created_at: string; text: string }

export type Decision =
  /** This message was already answered (swept into another turn). */
  | { act: 'gone' }
  /** A newer text came in: that one answers. */
  | { act: 'yield' }
  | { act: 'wait'; ms: number }
  | { act: 'answer' }

const at = (r: BurstRow) => Date.parse(r.created_at)

/** Oldest first; same time keeps the given order. */
export function ordered<R extends BurstRow>(rows: R[]): R[] {
  return rows.map((r, i) => [r, i] as const).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map(([r]) => r)
}

/**
 * What the invocation for message `me` does now, given the sender's unanswered texts. Waits until
 * QUIET_MS after the newest text, or CAP_MS after the first, whichever is sooner.
 */
export function decide(rows: BurstRow[], me: string, now: number, o: { quietMs?: number; capMs?: number } = {}): Decision {
  const quietMs = o.quietMs ?? QUIET_MS
  const capMs = o.capMs ?? CAP_MS
  const list = ordered(rows)
  if (!list.some((r) => r.id === me)) return { act: 'gone' }
  const newest = list[list.length - 1]
  if (newest.id !== me) return { act: 'yield' }
  const ms = Math.min(at(newest) + quietMs - now, at(list[0]) + capMs - now)
  // Clamped: a clock that disagrees with the database's can't make it sleep for long.
  return ms > 0 ? { act: 'wait', ms: Math.min(ms, quietMs) } : { act: 'answer' }
}

/** The texts answered in the next turn: a leading bare confirmation alone, else all of them. */
export function nextBatch<R extends BurstRow>(rows: R[], isConfirmation: (r: R) => boolean): R[] {
  const list = ordered(rows)
  if (!list.length) return []
  return isConfirmation(list[0]) ? [list[0]] : list
}

/** One user turn: the texts in order, one per line. Too long, the oldest lines go first. */
export function joinTexts(rows: BurstRow[], max = 2000): string {
  const lines = ordered(rows).map((r) => r.text.trim()).filter(Boolean)
  while (lines.length > 1 && lines.join('\n').length > max) lines.shift()
  return lines.join('\n').slice(-max)
}

/**
 * Whether a text is the answer to something already on screen: a bare yes/no to the question
 * waiting for one, or "send it" for a draft with an address. Only if that was asked BEFORE the
 * text arrived (a yes typed in the same breath as the request is not an answer to it).
 */
export function isConfirmation(
  r: BurstRow,
  facts: { yesNo: boolean; sendIt: boolean; pendingAt: string | null; draftAt: string | null },
): boolean {
  const sent = at(r)
  const before = (iso: string | null) => iso != null && Date.parse(iso) < sent
  return (facts.sendIt && before(facts.draftAt)) || (facts.yesNo && before(facts.pendingAt))
}

/** A turn that waited for the lock: was this ask/draft made after the user's latest message? */
export function unseen(createdAt: string | null | undefined, sentAt: number | null | undefined): boolean {
  return sentAt != null && !!createdAt && Date.parse(createdAt) > sentAt
}
