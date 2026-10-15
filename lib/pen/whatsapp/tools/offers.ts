// Answering Juno's offers (lib/pen/suggestions.ts): "yes to 1", "no to 2", "sure", "no thanks".
//
// An offer is already a question, so the user's yes to it is the go-ahead: accepting runs at
// once, no askConfirm. The one exception is anything that would email someone else (an invite):
// that goes through save_draft, which shows the draft and waits for "send it".
//
//   meeting   → Google Calendar connected: the event is added there at once (the offer asked
//               "Add it to your calendar?"), then a Meet link and an invite are offered. Not
//               connected (or Google refuses): calendar links (.ics for Apple Calendar, Google
//               template), alarm inside; offer an invite. Without a known time zone it asks first.
//   followup  → a WhatsApp reminder (pen_reminders) when it is within maxAheadMs (a day, or 30
//               days with the user_reminder template); later than that, only the dated to-do,
//               and the model says so.
//   notion    → the page in Notion (+ dated to-dos), or, not connected, the Settings link and a
//               plain to-do plan on the next yes.
//   other     → accepted; the model helps with the other tools.
//
// The accept logic itself is lib/pen/offer-accept.ts, shared with the web ("Juno noticed").

import type Anthropic from '@anthropic-ai/sdk'
import { acceptFollowup, acceptMeeting, acceptNotion } from '../../offer-accept'
import { decideSuggestion, listSuggestions, resolveSuggestion, whenText } from '../../suggestions'
import type { Suggestion } from '../../suggestions-types'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_suggestions',
    description:
      'What Juno offered (or could offer) to help with from the user\'s recordings: meetings heard, reminders, Notion pages. ' +
      'Each with its number in the latest offer message, id, state and the words heard.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string', description: 'Only this recording, or "".' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'accept_suggestion',
    description:
      'The user said yes to an offer: "yes to 1", "sure", "add it". ref = the number in the latest offer message ("1") or an id. ' +
      'Runs it at once (the offer was the question). time_zone: an IANA zone only if the user just gave one, else "". ' +
      'start_local: "YYYY-MM-DDTHH:MM" only if the user corrected the time, else "". plain: true when the user wants the plan ' +
      'as Juno to-dos instead of Notion.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        time_zone: { type: 'string' },
        start_local: { type: 'string' },
        plain: { type: 'boolean' },
      },
      required: ['ref', 'time_zone', 'start_local', 'plain'],
      additionalProperties: false,
    },
  },
  {
    name: 'dismiss_suggestion',
    description: 'The user said no to an offer: "no to 2", "no thanks", "skip it". ref = its number in the latest offer message or an id.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
      additionalProperties: false,
    },
  },
]

function view(s: Suggestion, ctx: Ctx) {
  return {
    number: s.state === 'offered' ? (s.detail.offer_no ?? 1) : null,
    id: s.id,
    kind: s.kind,
    state: s.state,
    offer: s.detail.offer ?? s.title,
    when: whenText(s, ctx.lang) || null,
    person: s.person,
    heard: s.quote,
    recording: s.session_id,
  }
}

async function list(ctx: Ctx, sessionId: string): Promise<unknown> {
  const rows = await listSuggestions(ctx.email, sessionId ? { sessionId } : {})
  const latest = rows.filter((r) => r.state === 'offered').map((r) => r.offered_at ?? '').sort().pop()
  // The latest offer message first, in its own order; then anything not offered yet.
  const offered = rows.filter((r) => r.state === 'offered' && r.offered_at === latest).sort((a, b) => Number(a.detail.offer_no ?? 0) - Number(b.detail.offer_no ?? 0))
  const rest = rows.filter((r) => !offered.includes(r))
  return { suggestions: [...offered, ...rest].slice(0, 12).map((s) => view(s, ctx)) }
}

async function find(ctx: Ctx, ref: string): Promise<Suggestion | { error: string }> {
  const s = await resolveSuggestion(ctx.email, ref || '1')
  if (!s) return { error: 'no open offer with that number; call list_suggestions' }
  if (!['suggested', 'offered'].includes(s.state)) return { error: `already ${s.state}` }
  return s
}

async function dismiss(ctx: Ctx, ref: string): Promise<unknown> {
  const s = await find(ctx, ref)
  if ('error' in s) return s
  await decideSuggestion(ctx.email, s.id, 'dismissed')
  return { ok: true, dismissed: s.detail.offer ?? s.title, note: 'Confirm in a few words; no need to explain.' }
}

async function accept(ctx: Ctx, i: { ref: string; time_zone: string; start_local: string; plain: boolean }): Promise<unknown> {
  const s = await find(ctx, i.ref)
  if ('error' in s) return s
  switch (s.kind) {
    case 'meeting':
      return acceptMeeting(ctx, s, i.time_zone, i.start_local)
    case 'followup':
      return acceptFollowup(ctx, s, i.time_zone)
    case 'notion':
      return acceptNotion(ctx, s, i.plain)
    default:
      await decideSuggestion(ctx.email, s.id, 'accepted')
      return { ok: true, title: s.title, heard: s.quote, person: s.person, recording: s.session_id, note: 'Help with it now with the other tools (save_draft, add_todo…); ask one short question if it is unclear what they want.' }
  }
}

export const offersModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => {
    switch (name) {
      case 'list_suggestions':
        return list(ctx, str(input, 'session_id'))
      case 'accept_suggestion':
        return accept(ctx, { ref: str(input, 'ref'), time_zone: str(input, 'time_zone'), start_local: str(input, 'start_local'), plain: input.plain === true })
      case 'dismiss_suggestion':
        return dismiss(ctx, str(input, 'ref'))
      default:
        return undefined
    }
  },
  prompt:
    '- Juno sometimes messages first with offers from a recording ("1. … Add it to your calendar? 2. … Remind you Thursday?"). ' +
    'A reply to that ("yes to 1", "sure", "add it", "sí", "no thanks", "1 yes 2 no") is accept_suggestion / dismiss_suggestion ' +
    'for each number (a single unnumbered offer is 1), not confirm_pending and not set_reminder. Not sure which offer they mean: ' +
    'list_suggestions. The offer was the question, so act at once; only an email to someone else (an invite) still needs ' +
    'save_draft and their "send it". After accepting, confirm in one or two lines with the time and any link, exactly as the tool gives it.\n',
}
