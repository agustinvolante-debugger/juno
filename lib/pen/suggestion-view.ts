// What the web shows of a suggestion ("Juno noticed" on a recording, "Juno is waiting on you"
// on Home). No server imports: the type is shared with the browser.

import type { SuggestionKind, SuggestionState } from './suggestions-types'

export type WebSuggestion = {
  id: string
  sessionId: string | null
  sessionTitle: string | null
  kind: SuggestionKind
  state: SuggestionState
  /** One line: "Weekly check-in with Charlie". */
  title: string
  /** The words heard, cut short. */
  why: string | null
  /** "Thu, Oct 22" / "Tue, Oct 21, 2:00 PM PDT", or "". */
  when: string
  person: string | null
  /** YYYY-MM-DD the meeting is on, when known (to ask only for the time). */
  day: string | null
  /** notion: which page ('study_plan' | 'memo' | 'prep'). */
  doc: string | null
  decidedAt: string | null
  /** What saying yes did, for "Juno did". */
  done: {
    gcalLink?: string | null
    ics?: string | null
    google?: string | null
    notionUrl?: string | null
    remindAt?: string | null
    toDoOnly?: boolean
    plain?: boolean
  } | null
}

/** The result of a web accept, read from offer-accept.ts's fields. */
export type AcceptOutcome =
  | { status: 'done'; suggestion: WebSuggestion; addedTo?: 'google' | 'links'; reminderAt?: string | null; dueDate?: string | null; notionUrl?: string | null; plan?: string[] }
  | { status: 'needs_time' }
  | { status: 'needs_zone' }
  | { status: 'connect_notion'; settings: string }
  | { status: 'error'; error: string }
