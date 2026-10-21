// Shared shapes for the proactive assistant (plan 15 Oct). Table pen_suggestions: things Juno
// heard that it can offer to help with. Nothing is ever done with one until the user says yes.
//
//   meeting   "let's meet next Tuesday at 2 PT"  → add to calendar (+ reminder, + invite)
//   followup  a dated promise                     → reminder / nudge when due
//   notion    an exam, a plan, a memo to write    → a Notion page (+ dated to-dos)
//   other     anything else helpable ("send me the deck")
//
// state: suggested (found) → offered (sent to the user) → accepted | dismissed → done; expired
// once its date has passed unanswered.

export type SuggestionKind = 'meeting' | 'followup' | 'notion' | 'other'
export type SuggestionState = 'suggested' | 'offered' | 'accepted' | 'dismissed' | 'done' | 'expired'

export type Suggestion = {
  id: string
  user_email: string
  session_id: string | null
  kind: SuggestionKind
  /** One line, the user's language: "Meet Chris about the billbacks". */
  title: string
  /** Kind-specific: meeting {with, when_said, duration_min, tz, confidence}; notion {doc: 'study_plan'|'memo'|'prep', subject} … */
  detail: Record<string, unknown>
  /** The words heard, so the offer can say why. */
  quote: string | null
  person: string | null
  starts_at: string | null
  due_at: string | null
  state: SuggestionState
  /** Stable per user: the same promise heard twice (joined parts, redo notes) is one row. */
  dedupe: string | null
  offered_at: string | null
  decided_at: string | null
  created_at: string
}

/** Proactive message types, each can be turned off on its own (profile.proactive.off). */
export type ProactiveKind = 'offers' | 'meeting_brief' | 'nudges' | 'morning_brief' | 'notion'
/** Every kind Juno can send, including ones Settings doesn't list yet ('pen_upload', behind
 *  PEN_PEN_NUDGE; STOP works for it in the chat). */
export type ProactiveSendKind = ProactiveKind | 'pen_upload'
