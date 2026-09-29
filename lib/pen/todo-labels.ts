// The to-do labels as the browser needs them: types and the "is it mine" rule. Kept apart from
// todo-meta.ts, which calls the model and the database and so cannot ship to the client.

export type Mine = 'me' | 'shared' | 'other' | 'unclear'
export type ActionMeta = {
  mine: Mine
  /** YYYY-MM-DD, resolved against the recording's date. Null when no deadline was said. */
  due_date: string | null
  /** Who is waiting on this if it is the user's, e.g. "Sarah". Null if nobody in particular. */
  waiting: string | null
}

/** Unclassified (older rows, or the pass failed) counts as the user's: never hide by accident. */
export function isMine(m: { mine: Mine | null } | null | undefined): boolean {
  return !m || m.mine == null || m.mine === 'me' || m.mine === 'shared'
}
