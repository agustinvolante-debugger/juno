// The WhatsApp assistant: answers from the user's recordings, and acts on them.
//
//   search_recordings   a question for the archive (askArchive, on Sonnet here)
//   open_todos          open actions, optionally for one person
//   mark_todo           tick an action off, or put it back
//   get_recording       one recording's notes, to write an email from
//   find_person         a contact and their saved email
//   save_draft          writes the follow-up email; the code, not the model, shows it
//   send_draft          sends the draft shown in an EARLIER message (from their Gmail when one is
//                       connected, lib/pen/gmail.ts; else "Name via Juno", lib/pen/follow-up.ts)
//   set_draft_from      "send it from my work email": another connected Gmail; shown again first
//   set_mail_app        "I use Yahoo": which web mail the draft's "Open in …" link opens
//   set_reminder        "remind me in 15 min to ..." (within 24 h: Meta's free-form window)
//   list_reminders / cancel_reminder
//   list_recordings     recent recordings with ids, so "the call with Carlos" can be acted on
//   recording_people    who is on a recording: contacts, speaker labels (with sample lines), names heard
//   add_person / remove_person   the web's People section: link a contact to a recording
//   name_speaker        the web's "Who's who": Speaker B is Carlos (or me)
//   recording_conversations / name_conversation   an event split into conversations; who each was with
//   read_conversation   what was said in one conversation, word for word, with times
//   update_recording    rename it, change its category
//   redo_notes          rewrite the notes (after naming speakers); runs after the reply is sent
//   person_brief        "I'm meeting the Garcías": their card, last calls, open promises both ways
//   add_todo / update_todo   new to-dos, due dates, rewording, reassigning
//   add_note            the user's own note on a recording (voice notes: "they want a pool")
//   save_contact        a contact from a business card photo, or details the user gives
//   whatsapp_link       a wa.me link that opens the user's OWN WhatsApp with a message ready
//   search_email / read_thread / reply_in_thread   their Gmail, read-only, team test (tools/mailread.ts)
//
// Voice notes arrive here already transcribed (bot.ts onVoice), photos as an image block.
//
// Two guarantees are enforced here rather than asked of the model. What the user sees is what
// gets sent: the draft preview is appended by this file from the saved draft, not retyped by
// the model. And nothing is sent in the turn that wrote it: send_draft refuses a draft whose
// msgId is the current message, so "draft and send" in one breath always stops at the draft.
//
// Meta bars general-purpose AI chatbots on WhatsApp Business (§4.7), so the system prompt keeps
// it to the user's recordings, to-dos and follow-ups.

import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { penAnthropic } from '../anthropic'
import { supabaseAdmin } from '@/lib/supabase'
import { askArchive } from '../archive'
import { getSession, updateSession, type ArchiveTurn, type Citation, type PenNotes, type NoteBlock, type PenSession } from '../store'
import { cleanEmail, cleanName, upsertByName, linkPerson, unlinkPerson, peopleOnSession, enrichPerson, suggestionsFrom } from '../people'
import { mentionsFor } from '../names'
import { segmentsFor, confirmName } from '../conference'
import { clock, namesHeard, reasonEn, speakerSuggestions, stitch, eventName, type Segment } from '../name-hints'
import { groupSessions } from '../merge'
import { foldName, speakerName, resolve as resolveLabel, type SpeakerMap } from '../speakers'
import { COMMON_TYPES } from '../categories'
import { sendFollowUp } from '../follow-up'
import { gmailAvailable, gmailReadAllowed, lastFromFor, listAccounts, sendViaGmail, type GmailAccount } from '../gmail'
import { listOutlookAccounts, outlookAvailable, outlookReadAllowed, sendViaOutlook, type OutlookAccount } from '../outlook'
import { replyViaOutlook } from '../outlook-read'
import { chooseFrom, PROVIDER_NAME, type MailApp } from '../mail-compose'
import { mailProvider, setMailApp } from '../mail-pref'
import { getProfile } from '../profile'
import { addReminder, cancelReminder, pendingReminders, MAX_AHEAD_MS, maxAheadMs, reminderAhead, reminderPhone } from '../reminders'
import type { Lang } from '../currency'
import { isMine, type ActionMeta, type Mine } from '../todo-labels'
import { getLinkByEmail, setChat, type Draft } from './store'
import { phoneStore, stateOf, turnAddSetUndo, turnSetUndo, type AgentStore } from './state'
import { sendText } from './provider'
import type { AgentChannel, AgentDraft, AgentLink, AgentParts } from '../agent-io'
import { MODULES } from './tools'
import { driveUndoHook } from './tools/google'
import { localDate, localIso, markZoneChecked, userZone, zonePromptLine, type Zone } from '../timezone'
import { dropIfUnanswered, confirmPending, waitingLine, BARE_YES, BARE_NO, type Pending, type PendingItem } from './confirm'
import { finishZoneTurn, timeFields, zoneAskLine, type ZoneTurn } from './tools/timezone'
import { UNDO, runUndo } from './undo'
import { unseen } from './burst'

const anthropic = penAnthropic('whatsapp-agent')

// A Google Doc / Sheet edit (tools/google.ts) is this turn's undoable action: kept where the turn's
// undo lives (WhatsApp: on the inbound message; web: on the thread, keyed by the turn), and the
// turn is marked undoable (web: the Undo button). "undo" runs undoDriveEdit (undo.ts runUndo).
driveUndoHook.save = (ctx, rec, title) => turnSetUndo(ctx, { kind: 'drive', rec, title })
// Haiku 5.5 (14 Oct, was Sonnet 5.5): a twentieth of the price, and the search stage now reads
// far more transcript per question. Same test questions, same tool use, answers as grounded.
const MODEL = process.env.PEN_AGENT_MODEL || 'claude-haiku-5-5'
/** Tool rounds per message. A normal turn uses one to three. */
const MAX_ROUNDS = 8

/** `redo`: a recording whose notes the user asked to rewrite. Too slow for the reply, so the
 *  caller does it after sending the text, and sends the new briefing when it is done. */
export type AgentResult = { text: string; citations: Citation[]; redo?: { sessionId: string; type?: string }; split?: string; after?: () => Promise<void>; memo?: string; parts?: AgentParts }

export type Ctx = {
  email: string
  msgId: string
  question: string
  history: ArchiveTurn[]
  agentBrief?: string
  recent: string | null
  userName: string | null
  /** Where the turn runs (lib/pen/agent-io.ts): formatting, confirms and where state is kept. */
  channel: AgentChannel
  /** A turn that continues an earlier request after a file pick (lib/pen/drive-continue.ts): that request's words. */
  resumeRequest?: string
  /** The WhatsApp / iMessage sender. Web: the linked phone a reminder can go to, or none. */
  phone?: string
  /** Web: whether that phone can be reached later (reminders.ts reminderPhone). */
  reach?: { imessage: boolean; lastInbound: number | null } | null
  /** A message after the reply (a job finished or failed). Phone: sent and kept in the chat
   *  history (phoneNotify); web: a short assistant note added to the thread. */
  notify: (text: string) => Promise<void>
  /** Draft / pending question / undo storage (state.ts); absent = the phone's (by email). */
  store?: AgentStore
  /** Docs, sheets, events, connect links… this turn made or opened (web: cards). */
  links?: AgentLink[]
  /** The yes/no question asked this turn (askConfirm, or the zone check). */
  asked?: { kind: string; summary: string }
  /** This turn recorded something "undo" can reverse (state.ts turnSetUndo). */
  undoable?: boolean
  lang: Lang
  /** Set by search_recordings; the last search's citations become the sources footer. */
  citations: Citation[]
  /** Set by save_draft, so the preview is appended to the reply. */
  drafted: Draft | null
  /** Gmail addresses connected for sending (empty when none, or before the table exists). */
  gmail?: GmailAccount[]
  /** Outlook / Microsoft addresses connected for sending (lib/pen/outlook.ts; empty when off). */
  outlook?: OutlookAccount[]
  /** Addresses Juno may read this turn (allowlisted user, gmail.readonly granted): tools/mailread.ts. */
  gmailRead?: string[]
  /** On the reading allowlist (whether or not an address has reading yet). */
  gmailReadOk?: boolean
  /** Outlook addresses Juno may read this turn (same allowlist, Mail.Read granted): tools/mailread.ts. */
  outlookRead?: string[]
  /** On the reading allowlist with Outlook available (whether or not an Outlook address reads yet). */
  outlookReadOk?: boolean
  /** Threads looked at this turn: their ids go in the chat history (never shown), for "reply to that". */
  mailSeen?: { thread_id: string; account: string; from: string }[]
  /** Email content entered this turn: from then on only read-only tools and drafts run (MAIL_SAFE). */
  mailTainted?: boolean
  sent: boolean
  redo?: { sessionId: string; type?: string }
  /** A recording to split into conversations after the reply (split_conversations). */
  split?: string
  recentTitle?: string | null
  /** Contacts added this turn, whose cards are refreshed after the reply. */
  enrich: Set<string>
  /** Slow work queued by tool modules, run after the reply is sent (tools/types.ts). */
  later: (() => Promise<void>)[]
  /** The user's time zone, resolved once per turn (lib/pen/timezone.ts); set_timezone updates it. */
  zone?: Zone
  /** confirm_pending or a new ask ran this turn (confirm.ts); else an earlier ask is dropped. */
  pendingTouched?: boolean
  /** A new yes/no question was asked this turn (askConfirm): it is the latest question, so a
   *  zone check in the same reply doesn't become the one waiting for the yes. */
  askedNow?: boolean
  /** Everything asked this turn, as one question (confirm.ts askConfirm): one yes runs it all. */
  batch?: PendingItem[]
  /** When this turn's first ask was stored (the batch keeps it). */
  batchAt?: string
  /** Times set this turn and the "still in Santiago?" check, if one is due (tools/timezone.ts). */
  zoneTurn?: ZoneTurn
  /** When the user's latest message in this turn arrived (ms). A question or draft made after it
   *  (while this turn waited for the one before: burst.ts) hasn't been seen, so this turn can't
   *  confirm or send it. Unset = no check (proactive turns). */
  sentAt?: number
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_recordings',
    description:
      'Answer a question from the user\'s recorded meetings (what was said, decided, promised, by whom). ' +
      'Returns an answer with [n] citation markers. Use for any question about the content of their calls.',
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'The question, self-contained (resolve "he", "that house" from the chat).' } },
      required: ['question'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_todos',
    description:
      'List the user\'s open to-dos (not yet ticked off) across their recordings. By default only the ones that are ' +
      'the user\'s own (or shared); set include_others to see what other people on the calls owe. Pass a person or ' +
      'client name to narrow to recordings with them. Each item has a ref for mark_todo, due_date (resolved) and ' +
      'waiting (who is waiting on the user for it).',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Name to filter by, e.g. "Garcia". Omit for all.' },
        include_others: { type: 'boolean', description: 'Also list items other people owe. Default false.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mark_todo',
    description:
      'Tick a to-do off (done=true) or put it back (done=false). Use the ref from open_todos. If more than one item could ' +
      'match what the user said, ask which one instead of guessing.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string' }, done: { type: 'boolean' } },
      required: ['ref', 'done'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_recording',
    description: 'One recording\'s title, date, people and extracted notes. Use before drafting an email about it.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_person',
    description: 'Look up a contact by name: their saved email, role and company.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_draft',
    description:
      'Save a follow-up email draft. It is shown to the user automatically, word for word, below your reply: do not ' +
      'repeat the draft in your text. Replaces any earlier draft. If you do not know the recipient\'s email, leave ' +
      'to_email empty: the tool looks it up, and if none is saved you must ask the user for it. When the user gives an ' +
      'email address, call save_draft again with it (it is saved to their contact).',
    input_schema: {
      type: 'object',
      properties: {
        to_name: { type: 'string', description: 'Recipient name as the user knows them.' },
        to_email: { type: 'string', description: 'Recipient email, or "" if unknown.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text, blank lines between paragraphs, signed with the user\'s first name.' },
        session_id: { type: 'string', description: 'The recording it follows up on, or "".' },
        from: { type: 'string', description: 'Only when the user names which of their connected Gmail addresses to send from ("from my work email", "from ana@x.com"): that address or their words. Omit otherwise.' },
      },
      required: ['to_name', 'to_email', 'subject', 'body', 'session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_reminder',
    description:
      'Set a WhatsApp reminder for the user. Give either in_minutes (for "in 15 min", "in 2 hours") or at (an ISO 8601 ' +
      `time WITH offset, for clock times). Only up to ${maxAheadMs() > MAX_AHEAD_MS ? '30 days' : '23 hours'} ahead. Write the reminder text as the user will want to ` +
      'read it, in their language.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to remind them of, e.g. "Check your recordings".' },
        in_minutes: { type: 'number', description: 'Minutes from now, or 0 if using at.' },
        at: { type: 'string', description: 'ISO 8601 with offset, e.g. 2026-09-30T17:00:00-07:00, or "".' },
      },
      required: ['text', 'in_minutes', 'at'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_reminders',
    description: 'The user\'s reminders that have not fired yet, with ids for cancel_reminder.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by id (from list_reminders).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_draft',
    description:
      'Send the saved draft. Only when the user has seen the draft and clearly said to send it ("send it", "mándalo", ' +
      '"pode enviar"). Never in the same turn you saved or changed the draft.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_draft_from',
    description:
      'Change which connected address (Gmail or Outlook) the pending draft goes out from ("send it from my work email", "from ana@x.com", ' +
      '"use my personal one", "send it from my Outlook"). The draft is shown again with the new From; it is NOT sent: wait for their "send it".',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string', description: 'The address, or the user\'s words for it ("work").' } },
      required: ['from'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_mail_app',
    description:
      'Remember which email service the user uses ("I use Outlook", "uso Yahoo", "I use Apple Mail" = other), so each draft\'s ' +
      '"Open in …" link opens that one. A pending draft is shown again with the new link.',
    input_schema: { type: 'object', properties: { app: { type: 'string', enum: ['gmail', 'outlook', 'yahoo', 'other'] } }, required: ['app'], additionalProperties: false },
  },
  {
    name: 'list_recordings',
    description:
      'The user\'s recordings, newest first, with session_id, title, date, category and the contacts on each. ' +
      'Pass a word to narrow (a name, a title word, a date like 2026-10-09), or "" for the latest. Use it to find ' +
      'the session_id for any action on a recording.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'recording_people',
    description:
      'Who is on one recording: the contacts linked to it, each speaker label (A, B, C) with its current name and ' +
      'two sample lines, and names the notes heard that are not linked yet. Use before add_person or name_speaker.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_person',
    description:
      'Add a person to a recording, as on the website\'s People section: creates the contact if the name is new ' +
      '(an existing contact with that name is reused) and links it. Give their email if the user gave one, else "". ' +
      'Call once per person.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        name: { type: 'string', description: 'Full name as the user wrote it.' },
        email: { type: 'string', description: 'Email address, or "".' },
      },
      required: ['session_id', 'name', 'email'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_person',
    description: 'Take a contact off a recording (the contact itself is kept).',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' }, name: { type: 'string' } },
      required: ['session_id', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'name_speaker',
    description:
      'Say who a speaker label is, as on the website\'s "Who\'s who": "Speaker B is Carlos". Set is_me when it is ' +
      'the user. The person is also added to the recording as a contact. Only use labels recording_people returned; ' +
      'if the user did not say which label, use the sample lines to decide, and ask if it is not clear.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        label: { type: 'string', description: 'The speaker label, e.g. "B".' },
        name: { type: 'string', description: 'Their name, or "" when is_me.' },
        is_me: { type: 'boolean' },
      },
      required: ['session_id', 'label', 'name', 'is_me'],
      additionalProperties: false,
    },
  },
  {
    name: 'recording_conversations',
    description:
      'For a recording of an event (many people, one after another): each separate conversation with its number, ' +
      'time range, topic, a line on who it seemed to be with, and the name the user confirmed or the name options ' +
      'heard in it (with why). Use for "who did I talk to about X at the conference?" once you know the recording; ' +
      'otherwise search_recordings first. If the recording was never split, says so (the user can split it on the website).',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_conversation',
    description:
      'What was actually said in one conversation of an event recording, word for word, each line with its time from ' +
      'the start of the recording. Use the number recording_conversations gave it. For follow-ups like "what exactly ' +
      'did he say about pricing?" or before drafting something to that person.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        conversation: { type: 'integer', description: 'The number from recording_conversations.' },
      },
      required: ['session_id', 'conversation'],
      additionalProperties: false,
    },
  },
  {
    name: 'split_conversations',
    description:
      'The user says a recording was from an event (a conference, a fair, a party) with many people: split it into ' +
      'the separate conversations in it, with the names said in each. Takes about a minute: it runs after your reply ' +
      'and the list is sent here when ready, so tell the user that. Also use it when recording_conversations says the ' +
      'recording was never split and the user wants to know who they talked to.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'name_conversation',
    description:
      'Say who one conversation of an event recording was with, as the user decided: saves them as a contact, links ' +
      'them to the recording, and notes where they met and what about. Use the conversation number from ' +
      'recording_conversations. Never pick a name for the user; offer the options and let them choose or type one. ' +
      'A reply like "4 is Pedro" right after the list of conversations means conversation 4 of that recording.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        conversation: { type: 'integer', description: 'The conversation number from recording_conversations (1 = first).' },
        name: { type: 'string', description: 'The name the user chose.' },
      },
      required: ['session_id', 'conversation', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_recording',
    description:
      'Rename a recording and/or change its category. "" leaves a field as it is. Changing the category only ' +
      'relabels it; to rewrite the notes for the new category, also call redo_notes.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        title: { type: 'string' },
        category: { type: 'string', description: `Prefer one of: ${COMMON_TYPES.join(', ')}.` },
      },
      required: ['session_id', 'title', 'category'],
      additionalProperties: false,
    },
  },
  {
    name: 'redo_notes',
    description:
      'Rewrite a recording\'s notes from its transcript, using the speaker names and category as they are now. ' +
      'Takes a minute or two: it runs after your reply, and the new briefing is sent here when it is ready, so tell ' +
      'the user that. Only when the user asks for it or agrees to it.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'person_brief',
    description:
      'Everything about one person, for prep before a meeting or a call: their contact card, the last calls with ' +
      'them (date, title, summary), what the user still owes them and what they owe the user. Use for "I\'m meeting ' +
      'X", "what do I need to know about X", "remind me about X".',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_todo',
    description:
      'Add a to-do to a recording. Use the recording it belongs to; if it belongs to none, the most recent ' +
      'recording, and say which one you used. owner = whose it is: "me" (the user), "shared", or another person\'s name.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        action: { type: 'string', description: 'The to-do, starting with a verb, in the user\'s language.' },
        owner: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD, or "" if none.' },
        waiting: { type: 'string', description: 'Who is waiting on the user for it, or "".' },
      },
      required: ['session_id', 'action', 'owner', 'due_date', 'waiting'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_todo',
    description:
      'Change a to-do (ref from open_todos): reword it, set or clear its due date, or reassign it. "" leaves a field ' +
      'as it is; due_date "none" clears it; owner "me", "shared" or a person\'s name.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        action: { type: 'string' },
        due_date: { type: 'string' },
        owner: { type: 'string' },
      },
      required: ['ref', 'action', 'due_date', 'owner'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_note',
    description:
      'Add the user\'s own note to a recording, as if they typed it under "Your notes" on the website (e.g. "they ' +
      'want a pool", "budget is 900k"). Write it in their words, cleaned up, in their language.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' }, text: { type: 'string' } },
      required: ['session_id', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_contact',
    description:
      'Save or complete a contact: from a business card photo, or details the user gives. Fills blanks on an ' +
      'existing contact with the same name and never overwrites. Optionally links them to a recording. "" for unknown.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string', description: 'With country code if known, e.g. +1 407 555 0100.' },
        company: { type: 'string' },
        role: { type: 'string' },
        session_id: { type: 'string', description: 'A recording to add them to, or "".' },
      },
      required: ['name', 'email', 'phone', 'company', 'role', 'session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'whatsapp_link',
    description:
      'A link that opens the USER\'S OWN WhatsApp with a message to someone already typed, for them to send ' +
      'themselves. Juno never messages other people on WhatsApp. Use for "send the notes to Chris on WhatsApp", ' +
      '"text the Garcías that…". Uses the contact\'s saved phone, or the phone given.',
    input_schema: {
      type: 'object',
      properties: {
        to_name: { type: 'string' },
        phone: { type: 'string', description: 'If the user gave one, else "".' },
        text: { type: 'string', description: 'The message, written as the user, in the language they use with this person.' },
      },
      required: ['to_name', 'phone', 'text'],
      additionalProperties: false,
    },
  },
]

function system(ctx: Ctx, pending: Draft | null, asked: Pending | null, askedUnseen = false): string {
  const wa = waSystem(ctx, pending, asked, askedUnseen)
  return ctx.channel === 'web' ? webSystem(wa) : wa
}

/** The WhatsApp / iMessage prompt, unchanged (snapshot-tested: .pentest/web-agent-unit.mts). */
function waSystem(ctx: Ctx, pending: Draft | null, asked: Pending | null, askedUnseen = false): string {
  const today = localDate(ctx.zone?.tz)
  return (
    `You are Juno Pen on WhatsApp: the user's assistant for their own recorded meetings. Today is ${today}` +
    `${ctx.zone?.tz ? ` where the user is (${ctx.zone.tz})` : ''}; "tomorrow" and other relative days count from that date.\n\n` +
    'What you do: answer questions from their recordings, list and tick off their to-dos, draft and send ' +
    'follow-up emails about their meetings, set reminders, and organise their recordings the way the website does: ' +
    'add or remove the people on a call, say which speaker is who, rename a recording or change its category, and ' +
    'rewrite its notes; prep them for a meeting with someone; add and change to-dos; add their own notes to a ' +
    'recording; save contacts (from business card photos too); and prepare messages they send from their own ' +
    'WhatsApp. Nothing else: you are not a general chatbot. If asked for something outside that, say ' +
    'briefly that you only help with their calls.\n\n' +
    (ctx.recent
      ? `"This call", "the recording", "it" with no other recording named means the one they sent here last: session_id ${ctx.recent}${ctx.recentTitle ? `, "${ctx.recentTitle}"` : ''}.\n\n`
      : '') +
    `Now: ${zonePromptLine(ctx.zone)}\n` +
    (maxAheadMs(ctx.lang) > MAX_AHEAD_MS
      ? '- Reminders can be up to 30 days ahead. For later ones, add it as a to-do with that due date instead (add_todo, on ' +
        'the recording it relates to) and say so in one line; don\'t ask first. For a clock time with no timezone given, '
      : '- Reminders can be at most 23 hours ahead (WhatsApp only lets Juno message within a day of their last message). ' +
        'For later ones, add it as a to-do with that due date instead (add_todo, on the recording it relates to) and say ' +
        'so in one line; don\'t ask first. For a clock time with no timezone given, ') +
    'use the one above; if it says unknown, ask.\n\n' +
    'Rules:\n' +
    '- Earlier assistant turns in this chat were made with these same tools; their tool calls just are not shown. ' +
    'Treat them as reliable unless the user corrects them.\n' +
    '- Facts come only from the tools. Never invent a name, number, date, price, address or commitment.\n' +
    '- Reply in the language of the user\'s LATEST message, even when the recordings, tool results or earlier ' +
    'turns are in another language.\n' +
    '- WhatsApp formatting: short paragraphs, *bold* sparingly, "• " for lists. No headings, no markdown links.\n' +
    '- When you answer from search_recordings, keep its [n] markers exactly as they are.\n' +
    '- After marking a to-do, confirm in one line which one.\n' +
    '- After changing a recording (people, speakers, title, category), confirm exactly what changed and on which ' +
    'recording, in one or two lines, so a misheard name is caught at once. Never claim a change a tool did not confirm.\n' +
    '- Messages marked [voice note] were spoken and transcribed: names and numbers may be misheard. If one looks ' +
    'off, say what you understood. A voice note that is a fact about a call ("they want a pool") is add_note; one ' +
    'that is a task is add_todo.\n' +
    '- Before add_todo, check open_todos (include_others) for the same task, even worded differently or under ' +
    'another name for the same person; if it is there, update_todo it (e.g. its due date) instead of adding a second one.\n' +
    '- A photo of a business card: read it and save_contact without a session_id, then offer to add them to the ' +
    'recording they sent last (a card is often from someone met elsewhere). Another ' +
    'photo: say briefly what you see and offer to add it as a note to a recording. Never invent what you cannot read.\n' +
    '- Meeting prep ("I\'m meeting X"): person_brief, then at most 8 short lines: who they are, last time you ' +
    'spoke, what you owe them, what they owe you, anything open. Dates as "Oct 3", not ISO.\n' +
    '- Sharing notes: by email with save_draft (as usual); on WhatsApp with whatsapp_link, which the user sends ' +
    'themselves. Never say Juno sent a WhatsApp to someone else.\n' +
    '- When you mention a conversation or a moment, say the event or recording name and the time from the start of ' +
    'the recording ("at Payments conference networking, 6:28–6:41"). Never mention parts or files (to the user a long ' +
    'event is one recording), and never say "conversation 41" in a sentence; when ' +
    'you list many conversations, put the number at the END of each line ("· 41") so the user can reply "41 is Pedro". ' +
    'A reply in their own words ("the chargebacks guy was Pedro") works too: match it to the conversation you just discussed. ' +
    'Use each conversation\'s topic as the tools give it; don\'t rename it.\n' +
    '- Not sure who a speaker or a person was? recording_people lists the names said on the call and likely ' +
    'names per voice; for an event, recording_conversations lists each conversation with name options. Offer the ' +
    'options with why ("Pedro: called Pedro twice") and let the user pick or type one; never choose for them.\n' +
    '- When the user lists who was on a call ("Carlos and Titi"), add each with add_person. If it is clear from ' +
    'recording_people which speaker each one is, name the speakers too; then offer to rewrite the notes with the names.\n' +
    '- Emails: write like a busy professional to someone they know. Four to eight sentences, a concrete next step. ' +
    'Leave a visible gap like [date] rather than guessing a missing detail. Sign with the user\'s first name.\n' +
    (ctx.userName
      ? ''
      : '- You do NOT know the user\'s name. Never sign with a name taken from recordings, contacts or emails (that is someone else). ' +
        'Sign drafts "[Your name]" and, once, ask what name to sign with; when they tell you, save it with notes_settings (your_name) and redo the draft with it.\n') +
    '- After save_draft, write at most one short intro line (or ask for the missing email), and do not tell them how to send it. The draft and a ' +
    '"reply send it" hint are shown below your reply automatically.\n' +
    '- send_draft only on a clear go-ahead for a draft the user has already seen.\n' +
    '- Reminders, to-dos and events on their own calendar are done at once, also when the time comes from something you looked up (a meeting found in a ' +
    'calendar or an invitation email): never "reply yes to confirm". Say what was set in one line; "undo" cancels it.\n' +
    gmailLine(ctx) +
    outlookLine(ctx) +
    (ctx.userName ? `\nThe user is ${ctx.userName}. In to-dos, an owner with their name (or "me", "I") is them.\n` : '') +
    (ctx.agentBrief ? `\nAbout the user:\n${ctx.agentBrief}\n` : '') +
    (pending
      ? `\nPending draft (shown to the user earlier): to ${pending.toName}${pending.toEmail ? ` <${pending.toEmail}>` : ' (no email yet)'}, subject "${pending.subject}".\n`
      : '\nNo draft is pending.\n') +
    MODULES.map((m) => (m.prompt && (!m.when || m.when(ctx)) ? `${m.prompt}\n` : '')).join('') +
    (askedUnseen && asked
      ? `\nJust asked the user (they have NOT seen it yet; nothing in their message answers it, so never call confirm_pending this turn): ${asked.summary}\n`
      : asked?.kind === 'zone_check' ? zoneAskLine(asked) : asked ? waitingLine(asked) : '')
  )
}

/**
 * The web chat's prompt: the same rules with the WhatsApp-only parts swapped (formatting, the
 * "reply send it" hints, Meta's §4.7 limit, the 24-hour reminder window), plus the buttons.
 */
export function webSystem(wa: string): string {
  return (
    wa
      .replace('You are Juno Pen on WhatsApp: ', 'You are Juno Pen in the chat of the Juno Pen web app: ')
      .replace('with no other recording named means the one they sent here last:', 'with no other recording named means the one they tagged:')
      .replace(
        'WhatsApp. Nothing else: you are not a general chatbot. If asked for something outside that, say briefly that you only help with their calls.',
        'WhatsApp. Keep to that work (their meetings, contacts, to-dos, email, calendar and documents); for anything unrelated, say in one line what you can help with.',
      )
      .replace(
        /- Reminders can be [^\n]*?For a clock time with no timezone given, /,
        '- Reminders can be up to 30 days ahead: they arrive on WhatsApp / iMessage when it is linked and can reach them, otherwise by email ' +
          '(set_reminder says which in delivered_by; say it in a few words). For later ones, add it as a to-do with that due date instead ' +
          '(add_todo, on the recording it relates to) and say so in one line; don\'t ask first. For a clock time with no timezone given, ',
      )
      .replace(
        '- WhatsApp formatting: short paragraphs, *bold* sparingly, "• " for lists. No headings, no markdown links.\n',
        '- Formatting: short paragraphs, **bold** sparingly, "- " for lists, links as plain URLs on their own line. No headings, no tables.\n',
      )
      .replace('The draft and a "reply send it" hint are shown below your reply automatically.', 'The draft and a Send button are shown below your reply automatically.')
      .replace('never "reply yes to confirm". Say what was set in one line; "undo" cancels it.', 'never "reply yes to confirm". Say what was set in one line; an Undo button is shown under your reply.') +
    '\nWeb chat: under your reply the user sees Yes / No buttons for a question a tool asked (one Yes runs every action listed in it), a Send button under a draft, an Undo ' +
    'button when what you did can be undone, and cards for the docs, sheets, events and connect links you made. Never write "reply yes", ' +
    '"reply send it" or "say undo": ask the question, or say what was done, in one line. Still put any link in the text as a plain URL.\n'
  )
}

/** The tools as the web chat sees them: set_reminder isn't WhatsApp-only there. */
function toolsFor(ctx: Ctx, tools: Anthropic.Tool[]): Anthropic.Tool[] {
  if (ctx.channel !== 'web') return tools
  return tools.map((t) =>
    t.name === 'set_reminder'
      ? {
          ...t,
          description:
            'Set a reminder for the user (on WhatsApp / iMessage when linked and reachable, else by email). Give either in_minutes (for "in 15 min", ' +
            '"in 2 hours") or at (an ISO 8601 time WITH offset, for clock times). Only up to 30 days ahead. Write the reminder text as the user will want ' +
            'to read it, in their language.',
        }
      : t,
  )
}

/* ------------------------------------------------------------------ tools */

type SessionRow = {
  id: string
  title: string | null
  client_name: string | null
  notes: PenNotes | null
  action_done: number[] | null
  action_meta?: ActionMeta[] | null
  recorded_at: string | null
  created_at: string
}

async function openTodos(ctx: Ctx, person?: string, includeOthers = false): Promise<unknown> {
  const query = (cols: string) =>
    supabaseAdmin.from('pen_sessions').select(cols).eq('user_email', ctx.email).order('created_at', { ascending: false }).limit(400)
  let res = await query('id,title,client_name,notes,action_done,action_meta,recorded_at,created_at')
  // Before the action_meta ALTER runs: no labels, so everything counts as the user's.
  if (res.error && /action_meta/.test(res.error.message)) res = await query('id,title,client_name,notes,action_done,recorded_at,created_at')
  if (res.error) throw new Error(res.error.message)
  const rows = (res.data ?? []) as unknown as SessionRow[]

  // A person matches a recording by client, by a name the notes heard, by a linked contact, or
  // by a mention in the action itself. Folded, so "Garcia" finds "García".
  const want = person ? foldName(person) : ''
  let linked = new Set<string>()
  if (want) {
    const { data: links } = await supabaseAdmin
      .from('pen_session_people')
      .select('session_id,pen_people(name)')
      .eq('user_email', ctx.email)
    linked = new Set(
      ((links ?? []) as unknown as { session_id: string; pen_people: { name: string } | null }[])
        .filter((l) => l.pen_people && foldName(l.pen_people.name).includes(want))
        .map((l) => l.session_id),
    )
  }
  const has = (s: string | null | undefined) => !!s && foldName(s).includes(want)

  const items: Record<string, unknown>[] = []
  let othersSkipped = 0
  for (const r of rows) {
    const n = r.notes ?? {}
    const done = new Set(Array.isArray(r.action_done) ? r.action_done : [])
    const acts = n.actions ?? []
    const meta = Array.isArray(r.action_meta) && r.action_meta.length === acts.length ? r.action_meta : null
    const onRecording =
      !want || linked.has(r.id) || has(r.client_name) || has(r.title) || (n.people ?? []).some((p) => has(p.name))
    acts.forEach((a, i) => {
      if (done.has(i)) return
      if (!onRecording && !has(a.action) && !has(a.owner) && !has(meta?.[i]?.waiting)) return
      const m = meta?.[i] ?? null
      if (!includeOthers && !isMine(m)) {
        othersSkipped++
        return
      }
      items.push({
        ref: `${r.id}#${i}`,
        action: a.action,
        whose: m?.mine ?? 'unlabelled',
        owner: a.owner || '',
        due_date: m?.due_date ?? null,
        due_said: a.due || '',
        waiting: m?.waiting ?? null,
        priority: a.priority ?? 'normal',
        recording: r.title ?? 'Untitled',
        date: (r.recorded_at ?? r.created_at).slice(0, 10),
      })
    })
  }
  return {
    count: items.length,
    todos: items.slice(0, 40),
    ...(items.length > 40 ? { note: `showing 40 of ${items.length}` } : {}),
    ...(othersSkipped ? { others_not_shown: othersSkipped } : {}),
  }
}

async function markTodo(ctx: Ctx, ref: string, done: boolean): Promise<unknown> {
  const m = /^([0-9a-f-]{36})#(\d+)$/i.exec(ref.trim())
  if (!m) return { error: 'bad ref: use one from open_todos' }
  const session = await getSession(ctx.email, m[1])
  const index = Number(m[2])
  const action = session?.notes?.actions?.[index]
  if (!session || !action) return { error: 'no such to-do' }
  const set = new Set(Array.isArray(session.action_done) ? session.action_done : [])
  if (done) set.add(index)
  else set.delete(index)
  await updateSession(session.id, { action_done: Array.from(set).sort((a, b) => a - b) })
  return { ok: true, done, action: action.action, recording: session.title ?? 'Untitled' }
}

async function getRecording(ctx: Ctx, id: string): Promise<unknown> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'bad session_id' }
  const s = await getSession(ctx.email, id)
  if (!s) return { error: 'no such recording' }
  const { data: people } = await supabaseAdmin
    .from('pen_session_people')
    .select('pen_people(name,email,role,company)')
    .eq('user_email', ctx.email)
    .eq('session_id', id)
  return {
    session_id: s.id,
    title: s.title ?? s.source_name,
    date: (s.recorded_at ?? s.created_at).slice(0, 10),
    client: s.client_name,
    contacts: ((people ?? []) as unknown as { pen_people: unknown }[]).map((p) => p.pen_people).filter(Boolean),
    their_own_notes: s.user_notes?.slice(0, 3000) ?? null,
    notes: s.notes,
  }
}

async function findPerson(ctx: Ctx, name: string): Promise<unknown> {
  const want = foldName(name)
  if (!want) return { people: [] }
  const { data, error } = await supabaseAdmin.from('pen_people').select('name,email,role,company').eq('user_email', ctx.email)
  if (error) throw new Error(error.message)
  const hits = ((data ?? []) as { name: string; email: string | null; role: string | null; company: string | null }[])
    .filter((p) => foldName(p.name).includes(want) || want.includes(foldName(p.name)))
    .slice(0, 5)
  return { people: hits }
}

async function saveDraft(
  ctx: Ctx,
  i: { to_name: string; to_email: string; subject: string; body: string; session_id: string; from?: string },
): Promise<unknown> {
  const toName = i.to_name.trim().slice(0, 120)
  if (!toName || !i.subject.trim() || !i.body.trim()) return { error: 'to_name, subject and body are required' }
  let toEmail = i.to_email.trim() ? cleanEmail(i.to_email) : null
  if (i.to_email.trim() && !toEmail) return { error: `"${i.to_email}" is not a valid email address; ask the user` }

  if (toEmail) {
    // Given by the user in the chat: remember it on their contact (fills a blank, never overwrites).
    await upsertByName(ctx.email, toName, toEmail).catch(() => {})
  } else {
    const found = (await findPerson(ctx, toName)) as { people: { name: string; email: string | null }[] }
    const withEmail = found.people.filter((p) => p.email)
    if (withEmail.length === 1) toEmail = withEmail[0].email
    else if (withEmail.length > 1) {
      return { error: 'several contacts match', matches: withEmail.map((p) => `${p.name} <${p.email}>`), next: 'ask the user which one' }
    }
  }

  const sessionId = /^[0-9a-f-]{36}$/i.test(i.session_id) && (await getSession(ctx.email, i.session_id)) ? i.session_id : null
  const picked = await pickFrom(ctx, toEmail, i.from)
  if ('error' in picked) return picked
  const draft: Draft = {
    id: crypto.randomBytes(12).toString('base64url'),
    msgId: ctx.msgId,
    toName,
    toEmail,
    subject: i.subject.trim().slice(0, 200),
    body: i.body.trim().slice(0, 8000),
    sessionId,
    createdAt: new Date().toISOString(),
    from: picked.from,
    provider: await mailProvider(ctx.email, picked.from).catch(() => null),
    lang: ctx.lang,
  }
  await stateOf(ctx).setDraft(draft)
  ctx.drafted = draft
  const from = draft.from
    ? { will_send_from: draft.from, from_why: picked.why, from_note: 'Not sent: it goes from this address only when they say send.' }
    : { will_send_from: 'Juno (no Gmail connected): as "Name via Juno", replies go to the user' }
  return toEmail
    ? { ok: true, shown_to_user: true, to: `${toName} <${toEmail}>`, ...from }
    : { ok: true, shown_to_user: true, to: toName, ...from, missing: `No email saved for ${toName}. Ask the user for it.` }
}

/** Which connected address (Gmail or Outlook) a draft goes out from: named > last used for this recipient > default (one across both). */
async function pickFrom(ctx: Ctx, toEmail: string | null, said?: string): Promise<{ from: string | null; why: string } | { error: string; connected?: string[]; next: string }> {
  const gmail = ctx.gmail ?? []
  const outlook = ctx.outlook ?? []
  const accounts = [...gmail, ...outlook]
  if (!accounts.length) {
    return said?.trim()
      ? { error: 'no email address is connected for sending', next: 'say so in one line and offer to connect one (connect_app app gmail, or app outlook for Outlook/Microsoft 365 when connection_status says it is available); the draft can still go "via Juno"' }
      : { from: null, why: 'none' }
  }
  // "from my Outlook" / "from my Gmail": the only connected address of that kind.
  const q = (said ?? '').toLowerCase()
  if (/\b(outlook|microsoft|hotmail|office ?365|m365)\b/.test(q)) {
    if (outlook.length === 1) return { from: outlook[0].address, why: 'override' }
    if (!outlook.length) return { error: 'no Outlook address is connected for sending', connected: accounts.map((a) => a.address), next: 'say so in one line; offer to connect it (connect_app app outlook) or to send from a connected address' }
  } else if (/\b(gmail|google)\b/.test(q)) {
    if (gmail.length === 1) return { from: gmail[0].address, why: 'override' }
  }
  const pool = /\b(outlook|microsoft|hotmail|office ?365|m365)\b/.test(q) ? outlook : accounts
  const c = chooseFrom(pool, { override: said, lastForRecipient: await lastFromFor(ctx.email, toEmail) })
  if (c.why === 'no_match') return { error: `no connected address matches "${c.asked}"`, connected: accounts.map((a) => a.address), next: 'ask which of these, or offer to connect another (connect_app app gmail / outlook)' }
  return { from: c.address, why: c.why }
}

async function setDraftFrom(ctx: Ctx, said: string): Promise<unknown> {
  const d = await stateOf(ctx).getDraft()
  if (!d) return { error: 'no draft is pending' }
  // A reply in a thread lives in one mailbox: it goes from the address that received it.
  if (d.thread && d.from) return { error: `this is a reply in a thread, so it goes from ${d.from}, the address that received it`, next: 'say so in one line; to write from another address, they can ask for a new email instead of a reply' }
  const picked = await pickFrom(ctx, d.toEmail, said || ' ')
  if ('error' in picked) return picked
  const draft: Draft = { ...d, id: crypto.randomBytes(12).toString('base64url'), msgId: ctx.msgId, createdAt: new Date().toISOString(), from: picked.from, provider: await mailProvider(ctx.email, picked.from).catch(() => null), lang: ctx.lang }
  await stateOf(ctx).setDraft(draft)
  ctx.drafted = draft
  return { ok: true, shown_to_user: true, from: picked.from, note: 'Say in one line that it will go from this address; the draft is shown below. Not sent: wait for "send it".' }
}

async function setMailAppTool(ctx: Ctx, app: string): Promise<unknown> {
  if (!['gmail', 'outlook', 'yahoo', 'other'].includes(app)) return { error: 'app must be gmail, outlook, yahoo or other' }
  await setMailApp(ctx.email, app as MailApp)
  const d = ctx.drafted ?? (await stateOf(ctx).getDraft().catch(() => null))
  if (!d) return { ok: true, note: 'Confirm in one line; their next drafts will open in it.' }
  const draft: Draft = { ...d, id: crypto.randomBytes(12).toString('base64url'), msgId: ctx.msgId, createdAt: new Date().toISOString(), provider: await mailProvider(ctx.email, d.from).catch(() => null) }
  await stateOf(ctx).setDraft(draft)
  ctx.drafted = draft
  return { ok: true, shown_to_user: true, note: 'Confirm in one line; the draft is shown again below with the new link.' }
}

/** The Outlook addresses Juno can send from, for the system prompt (empty when none). */
function outlookLine(ctx: Ctx): string {
  const o = ctx.outlook ?? []
  if (!o.length) return ''
  const reads = ctx.outlookRead ?? []
  // Reading (team test only): what Juno can read, or how to turn it on. Everyone else: it can't.
  const read = reads.length
    ? `Juno can also READ the Outlook inbox of ${reads.join(', ')} (read-only, when they ask; search_email covers it with Gmail). `
    : ctx.outlookReadOk
      ? 'This account can also let Juno READ an Outlook inbox (testing): "read my Outlook" / "let Juno read my Outlook inbox" → connect_app app outlook with account and reconnect true; Microsoft asks to read. Until then you cannot see that inbox: say so, never guess. '
      : 'Juno cannot read Outlook mail. '
  return `- Outlook connected for sending: ${o.map((a) => `${a.address}${a.is_default ? ' (default From)' : ''}${a.last_error ? ' (needs reconnecting)' : ''}`).join(', ')}. ` +
    `A draft from one of these goes out through Outlook (their Sent Items). ${read}"Send it from my Outlook" → set_draft_from. ` +
    (o.some((a) => a.last_error) ? 'One needs reconnecting: connect_app app outlook with account. ' : '') + '\n'
}

function gmailLine(ctx: Ctx): string {
  if (!(ctx.gmail ?? []).length && (ctx.outlook ?? []).length) {
    return '- Email sending: no Gmail; drafts go from their connected Outlook address shown on the draft (above). "Connect my Gmail" → connect_app app gmail.\n'
  }
  const g = ctx.gmail ?? []
  const reads = ctx.gmailRead ?? []
  if (!reads.length && ctx.gmailReadOk) {
    // On the team test, nothing readable yet: connecting asks for reading too.
    return '- Email: ' + (g.length ? `Gmail connected for sending: ${g.map((a) => a.address).join(', ')}. ` : 'no Gmail connected yet. ') +
      'This account can also let Juno READ Gmail (testing): "connect my Gmail" / "read my email" / "let Juno read my inbox" → connect_app app gmail ' +
      '(reconnect true when that address is already connected); Google asks to send and read. Until then you cannot see their inbox: say so, never guess.\n'
  }
  if (reads.length) {
    return `- Email: Gmail connected: ${g.map((a) => `${a.address}${a.is_default ? ' (default)' : ''}${a.last_error ? ' (needs reconnecting)' : ''}`).join(', ')}. ` +
      `Juno can also READ ${reads.join(', ')} (read-only, when they ask). A draft goes out from the From address shown on it, into their Sent folder. ` +
      '"Send it from my work email / from x@y" → set_draft_from. "Connect another Gmail" → connect_app app gmail.\n'
  }
  if (!g.length) {
    return '- Email sending: no Gmail is connected, so "send it" sends from Juno\'s address as "<their name> via Juno", replies to them, ' +
      'a copy to them. If they want it from their own address, offer to connect Gmail (connect_app, app gmail; send-only, Juno never reads mail), ' +
      'or they can use the "Open in …" link under the draft.\n'
  }
  return `- Email sending: Gmail connected for sending: ${g.map((a) => `${a.address}${a.is_default ? ' (default)' : ''}${a.last_error ? ' (needs reconnecting)' : ''}`).join(', ')}. ` +
    'A draft goes out from the From address shown on it, into their Sent folder. "Send it from my work email / from x@y" → set_draft_from ' +
    '(it shows the draft again; it is not sent until they say send). "Connect another Gmail" → connect_app app gmail.\n'
}

async function sendDraft(ctx: Ctx): Promise<unknown> {
  const d = await stateOf(ctx).getDraft()
  if (!d) return { error: 'no draft to send (none saved, or it is over a day old)' }
  if (d.msgId === ctx.msgId || ctx.drafted || unseen(d.createdAt, ctx.sentAt)) {
    return { error: 'the user has not seen this version yet; show it and wait for them to say send' }
  }
  if (!d.toEmail) return { error: `no email address for ${d.toName}; ask the user for it` }
  if (ctx.sent) return { error: 'already sent in this turn' }
  const viaOutlook = Boolean(d.from && (ctx.outlook ?? []).some((a) => a.address === d.from!.toLowerCase()) && !(ctx.gmail ?? []).some((a) => a.address === d.from!.toLowerCase()))
  if (d.from && viaOutlook) {
    // Their Outlook (lib/pen/outlook.ts). Same rule: a failure is never retried through Juno's sender.
    if (d.thread && d.thread.provider !== 'outlook') return { error: 'a reply in a Gmail thread cannot go from an Outlook address; set_draft_from the Gmail address it came to' }
    if (d.thread?.provider === 'outlook') {
      // A reply in its Outlook conversation (outlook-read.ts): POST /reply on the message answered.
      if (!d.thread.messageId) return { error: 'that reply lost its thread; write it again with reply_in_thread' }
      const r = await replyViaOutlook({ userEmail: ctx.email, from: d.from, messageId: d.thread.messageId, to: d.toEmail, toName: d.toName, body: d.body, sessionId: d.sessionId })
      if (!r.ok) {
        return {
          error: `not sent from ${d.from}: ${r.error}`,
          plain: gmailFailed(ctx.lang, d, r.reason, 'outlook'),
          note: 'Reply with `plain` word for word (translate the words only if the chat is in another language; never change the links).',
        }
      }
      ctx.sent = true
      await stateOf(ctx).setDraft(null)
      return { ok: true, sent_from: d.from, via: 'Outlook', in_thread: true, sent_to: `${d.toName} <${d.toEmail}>`, subject: d.subject, note: 'It is in their Outlook Sent Items, in the same conversation.' }
    }
    const o = await sendViaOutlook({ userEmail: ctx.email, from: d.from, to: d.toEmail, toName: d.toName, subject: d.subject, body: d.body, sessionId: d.sessionId })
    if (!o.ok) {
      return {
        error: `not sent from ${d.from}: ${o.error}`,
        plain: gmailFailed(ctx.lang, d, o.reason, 'outlook'),
        note: 'Reply with `plain` word for word (translate the words only if the chat is in another language; never change the links).',
      }
    }
    ctx.sent = true
    await stateOf(ctx).setDraft(null)
    return { ok: true, sent_from: d.from, via: 'Outlook', sent_to: `${d.toName} <${d.toEmail}>`, subject: d.subject, note: 'It is in their Outlook Sent Items; replies come to that address.' }
  }
  if (d.from && d.thread?.provider === 'outlook') return { error: 'a reply in an Outlook conversation can only go from the Outlook address it came to' }
  if (d.from) {
    // Their Gmail. A failure is never retried through Juno's sender: they chose this address.
    const g = await sendViaGmail({ userEmail: ctx.email, from: d.from, fromName: ctx.userName, to: d.toEmail, toName: d.toName, subject: d.subject, body: d.body, sessionId: d.sessionId, thread: d.thread ?? null })
    if (!g.ok) {
      return {
        error: `not sent from ${d.from}: ${g.error}`,
        plain: gmailFailed(ctx.lang, d, g.reason),
        note: 'Reply with `plain` word for word (translate the words only if the chat is in another language; never change the links).',
      }
    }
    ctx.sent = true
    await stateOf(ctx).setDraft(null)
    return { ok: true, sent_from: d.from, sent_to: `${d.toName} <${d.toEmail}>`, subject: d.subject, ...(d.thread ? { in_thread: true } : {}), note: 'It is in their Gmail Sent folder; replies come to that address.' }
  }
  const r = await sendFollowUp({ userEmail: ctx.email, toEmail: d.toEmail, subject: d.subject, body: d.body, sessionId: d.sessionId })
  if (!r.ok) return { error: `not sent: ${r.error}` }
  ctx.sent = true
  await stateOf(ctx).setDraft(null)
  return { ok: true, sent_to: `${d.toName} <${d.toEmail}>`, subject: d.subject, note: 'A copy went to the user by BCC; replies go to their inbox.' }
}

async function setReminder(ctx: Ctx, i: { text: string; in_minutes: number; at: string }): Promise<unknown> {
  const text = i.text.trim()
  if (!text) return { error: 'text is required' }
  let due: Date
  if (i.at.trim()) {
    if (!/[+-]\d\d:?\d\d$|Z$/.test(i.at.trim())) return { error: 'at needs a timezone offset' }
    due = new Date(i.at)
  } else {
    due = new Date(Date.now() + Math.round(i.in_minutes) * 60 * 1000)
  }
  if (Number.isNaN(due.getTime())) return { error: 'could not read that time' }
  if (due.getTime() < Date.now() + 30 * 1000) return { error: 'that time has already passed' }
  if (due.getTime() - Date.now() > reminderAhead(ctx)) {
    return { error: reminderAhead(ctx) > MAX_AHEAD_MS ? 'more than 30 days ahead; reminders go up to 30 days' : 'more than 23 hours ahead; WhatsApp only allows reminders within a day' }
  }
  // Phone turns: their phone, as always. Web: the linked phone if it can reach them then, else email.
  const phone = reminderPhone(ctx, due)
  const r = await addReminder({ email: ctx.email, phone, text, dueAt: due, lang: ctx.lang })
  // Set at once (never "reply yes"): "undo" cancels it (undo.ts), with anything else this message set.
  await turnAddSetUndo(ctx, { reminder: r.id, title: text }).catch(() => {})
  const zone = ctx.zone?.tz
  // A clock time is kept for a "no, I'm in SF" (same local time there); "in 20 minutes" is not.
  const item = zone && i.at.trim() ? { kind: 'reminder' as const, id: r.id, local: localIso(r.due_at, zone), text } : undefined
  return {
    ok: true,
    id: r.id,
    due_utc: r.due_at,
    ...(zone ? await timeFields(ctx, zone, r.due_at, item, { check: Boolean(item) }) : {}),
    undo: 'the user can say "undo" to cancel it',
    ...(ctx.channel === 'web' ? { delivered_by: phone ? (phone.startsWith('im:') ? 'iMessage' : 'WhatsApp') : 'email' } : {}),
  }
}

async function searchRecordings(ctx: Ctx, question: string): Promise<unknown> {
  const { answer, citations } = await askArchive({
    userEmail: ctx.email,
    question: question.slice(0, 2000),
    history: ctx.history,
    agent: ctx.agentBrief,
    model: MODEL,
    // Low: this stage reports what the transcripts say. At the default it took 50s on a real
    // archive, twice as long as WhatsApp shows "typing…".
    effort: 'low',
    ...(ctx.recent ? { mentions: [ctx.recent] } : {}),
    tz: ctx.zone?.tz ?? null,
  })
  ctx.citations = citations
  return { answer, sources: citations.map((c) => ({ marker: c.marker, recording: c.title, session_id: c.session_id })) }
}

/* ------------------------------------------------- organising recordings */

const UUID = /^[0-9a-f-]{36}$/i

async function ownSession(ctx: Ctx, id: string) {
  return UUID.test(id.trim()) ? getSession(ctx.email, id.trim()) : null
}

async function listRecordings(ctx: Ctx, query: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,source_name,meeting_type,client_name,recorded_at,created_at,source_channel')
    .eq('user_email', ctx.email)
    .neq('source_channel', 'sample')
    .or('merge_index.is.null,merge_index.eq.0')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  type Row = { id: string; title: string | null; source_name: string | null; meeting_type: string | null; client_name: string | null; recorded_at: string | null; created_at: string }
  const rows = (data ?? []) as Row[]
  const { data: links } = await supabaseAdmin.from('pen_session_people').select('session_id,pen_people(name)').eq('user_email', ctx.email)
  const people = new Map<string, string[]>()
  for (const l of (links ?? []) as unknown as { session_id: string; pen_people: { name: string } | null }[]) {
    if (l.pen_people) people.set(l.session_id, [...(people.get(l.session_id) ?? []), l.pen_people.name])
  }
  const want = foldName(query)
  const hits = rows.filter((r) => {
    if (!want) return true
    const date = (r.recorded_at ?? r.created_at).slice(0, 10)
    return [r.title, r.source_name, r.client_name, r.meeting_type, date, ...(people.get(r.id) ?? [])].some((v) => !!v && foldName(v).includes(want))
  })
  return {
    recordings: hits.slice(0, 12).map((r) => ({
      session_id: r.id,
      title: r.title ?? r.source_name ?? 'Untitled',
      date: (r.recorded_at ?? r.created_at).slice(0, 10),
      category: r.meeting_type,
      people: people.get(r.id) ?? [],
    })),
    ...(hits.length > 12 ? { note: `12 of ${hits.length}; narrow the query` } : {}),
  }
}

async function recordingPeople(ctx: Ctx, id: string): Promise<unknown> {
  const s = await ownSession(ctx, id)
  if (!s) return { error: 'no such recording' }
  const linked = await peopleOnSession(ctx.email, s.id)
  const map = (s.speaker_map ?? null) as SpeakerMap | null
  const utts = s.transcript?.utterances ?? []
  const byLabel = new Map<string, string[]>()
  utts.forEach((u, i) => {
    const text = (s.transcript_edits?.[String(i)] ?? u.text).trim()
    const list = byLabel.get(u.speaker) ?? []
    list.push(text)
    byLabel.set(u.speaker, list)
  })
  return {
    session_id: s.id,
    title: s.title ?? s.source_name,
    contacts: linked.map((p) => ({ name: p.name, email: p.email })),
    speakers: [...byLabel.entries()].map(([label, lines]) => ({
      label,
      now_called: speakerName(map, label),
      is_me: map?.[label]?.me === true,
      lines: lines.length,
      // The longest two say the most about who is talking.
      samples: [...lines].sort((a, b) => b.length - a.length).slice(0, 2).map((t) => t.slice(0, 200)),
    })),
    heard_not_linked: suggestionsFrom(s.notes, linked, ctx.userName).map((x) => (x.role ? `${x.name} (${x.role})` : x.name)),
    ...(await heardFor(ctx, s)),
  }
}

/** Names said on the recording and the likely name per voice, for recording_people. Empty when never scanned. */
async function heardFor(ctx: Ctx, s: PenSession): Promise<Record<string, unknown>> {
  const ms = (await mentionsFor(ctx.email, [s.id]))[s.id] ?? []
  if (!ms.length) return {}
  const labels = (s.transcript?.utterances ?? []).map((u) => u.speaker)
  const map = (s.speaker_map ?? null) as SpeakerMap | null
  const sug = speakerSuggestions(ms, labels, { me: ctx.userName, resolve: (l) => resolveLabel(map, l).label })
  return {
    names_heard: namesHeard(ms, ctx.userName, labels).filter((n) => !n.me).slice(0, 25).map((n) => ({
      name: n.name, times: n.count, first_at: clock(n.moments[0].at_sec), spoken_to: n.present, context: n.moments.find((m) => m.context)?.context ?? null,
    })),
    likely_names_by_speaker: Object.fromEntries(Object.entries(sug).map(([l, o]) => [l, o.map((x) => `${x.me ? `${x.name} (the user)` : x.name}: ${reasonEn(x)}`)])),
    note_on_names: 'likely names are suggestions from names said on the call; offer them, the user decides.',
  }
}

/** Every conversation across a joined meeting's parts, numbered straight through, a chat the pen cut at the hour shown once. */
async function eventConversations(ctx: Ctx, s: PenSession) {
  const parts = s.merge_group ? await groupSessions(ctx.email, s.merge_group) : [s]
  const ids = parts.map((p) => p.id)
  const [segs, ms] = await Promise.all([segmentsFor(ctx.email, ids), mentionsFor(ctx.email, ids)])
  let offset = 0
  const input = parts.map((p) => {
    const x = { id: p.id, offset, segments: segs[p.id] ?? [], mentions: ms[p.id] ?? [] }
    offset += p.duration_sec ?? 0
    return x
  })
  return { parts, list: stitch(input, { me: ctx.userName }) }
}

async function recordingConversations(ctx: Ctx, id: string): Promise<unknown> {
  const s = await ownSession(ctx, id)
  if (!s) return { error: 'no such recording' }
  const { list } = await eventConversations(ctx, s)
  if (!list.length) return { recording: s.title ?? s.source_name, conversations: [], note: 'This recording has not been split into conversations. The user can do it on the website: open the recording, "Split into conversations".' }
  return {
    recording: s.title ?? s.source_name,
    event: eventName(s.title ?? s.source_name),
    how_to_refer: 'Say the event name and the time range (e.g. "at Payments conference networking, 6:28–6:41"), not the number. The number is only for tools, and for the end of each line when you list them all.',
    conversations: list.map((c, i) => ({
      number: i + 1,
      time: `${clock(c.start_sec)}–${clock(c.end_sec)}`,
      kind: c.kind,
      topic: c.topic,
      gist: c.gist,
      ...(c.confirmed_name ? { with: c.confirmed_name } : { name_options: c.likely.map((x) => `${x.name}: ${reasonEn(x)}`), also_mentioned: c.mentioned.map((x) => x.name) }),
    })),
  }
}

async function readConversation(ctx: Ctx, id: string, n: number): Promise<unknown> {
  const s = await ownSession(ctx, id)
  if (!s) return { error: 'no such recording' }
  const { parts, list } = await eventConversations(ctx, s)
  const c = list[n - 1]
  if (!c) return { error: `no conversation ${n}; there are ${list.length}` }
  let offset = 0
  const offsets = new Map(parts.map((p) => { const o = offset; offset += p.duration_sec ?? 0; return [p.id, o] as const }))
  const lines: string[] = []
  for (const piece of c.pieces) {
    const part = parts.find((p) => p.id === piece.partId)
    const u = part?.transcript?.utterances ?? []
    const map = (part?.speaker_map ?? null) as SpeakerMap | null
    for (let i = piece.seg.first_utt; i <= piece.seg.last_utt && i < u.length; i++) {
      const text = (part?.transcript_edits?.[String(i)] ?? u[i].text).trim()
      lines.push(`[${clock((offsets.get(piece.partId) ?? 0) + u[i].start / 1000)}] ${speakerName(map, u[i].speaker)}: ${text}`)
    }
  }
  return {
    event: eventName(s.title ?? s.source_name),
    time: `${clock(c.start_sec)}–${clock(c.end_sec)}`,
    topic: c.topic,
    ...(c.confirmed_name ? { with: c.confirmed_name } : { name_options: c.likely.map((x) => `${x.name}: ${reasonEn(x)}`) }),
    transcript: lines.join('\n').slice(0, 24000),
    note: 'Speaker labels are voices, not names; in a crowd one label can be several people.',
  }
}

async function queueSplit(ctx: Ctx, id: string): Promise<unknown> {
  const s = await ownSession(ctx, id)
  if (!s) return { error: 'no such recording; find it with list_recordings' }
  if (!s.transcript?.utterances?.length) return { error: 'this recording has no transcript yet' }
  if (ctx.split) return { error: 'one split per message' }
  ctx.split = s.id
  return { ok: true, queued: true, recording: s.title ?? s.source_name, note: 'Starts after your reply; the list of conversations is sent here in about a minute.' }
}

async function nameConversation(ctx: Ctx, i: { session_id: string; conversation: number; name: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording' }
  const { parts, list } = await eventConversations(ctx, s)
  const hit = list[i.conversation - 1]
  if (!hit) return { error: `no conversation ${i.conversation}; there are ${list.length}` }
  const name = cleanName(i.name)
  if (!name) return { error: 'a name is required' }
  let done: Segment | null = null
  for (const piece of hit.pieces) {
    const part = parts.find((p) => p.id === piece.partId)
    if (part) done = await confirmName(ctx.email, part, piece.seg.id, name)
  }
  if (!done?.person_id) return { error: 'could not save it' }
  ctx.enrich.add(done.person_id)
  return { ok: true, conversation: i.conversation, topic: hit.topic, with: done.confirmed_name, recording: s.title ?? s.source_name, note: 'Saved as a contact, linked to the recording, with where they met.' }
}

async function addPerson(ctx: Ctx, i: { session_id: string; name: string; email: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording; find it with list_recordings' }
  const name = cleanName(i.name)
  if (!name) return { error: 'a name is required' }
  const email = i.email.trim() ? cleanEmail(i.email) : null
  if (i.email.trim() && !email) return { error: `"${i.email}" is not a valid email address; ask the user` }
  const person = await upsertByName(ctx.email, name, email)
  await linkPerson(ctx.email, s.id, person.id, 'user')
  // The contact card fills in from the notes after the reply, as on the website.
  ctx.enrich.add(person.id)
  return {
    ok: true,
    added: person.name,
    email: person.email,
    ...(email && person.email && person.email !== email ? { note: `kept the email already saved (${person.email}); the website can change it` } : {}),
    recording: s.title ?? s.source_name,
  }
}

async function removePerson(ctx: Ctx, i: { session_id: string; name: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording' }
  const want = foldName(i.name)
  const linked = await peopleOnSession(ctx.email, s.id)
  const hits = linked.filter((p) => foldName(p.name).includes(want) || want.includes(foldName(p.name)))
  if (!hits.length) return { error: 'nobody by that name is on this recording', on_it: linked.map((p) => p.name) }
  if (hits.length > 1) return { error: 'several match', matches: hits.map((p) => p.name), next: 'ask the user which one' }
  await unlinkPerson(ctx.email, s.id, hits[0].id)
  return { ok: true, removed: hits[0].name, recording: s.title ?? s.source_name }
}

async function nameSpeaker(ctx: Ctx, i: { session_id: string; label: string; name: string; is_me: boolean }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording' }
  const label = i.label.trim().replace(/^speaker\s+/i, '').toUpperCase()
  const labels = new Set((s.transcript?.utterances ?? []).map((u) => u.speaker))
  if (!labels.has(label)) return { error: `no speaker ${label} in this recording`, labels: [...labels] }
  const name = i.is_me ? cleanName(i.name) || ctx.userName || '' : cleanName(i.name)
  if (!name) return { error: i.is_me ? 'the user\'s name is not known; ask for it' : 'a name is required' }

  const map: SpeakerMap = { ...((s.speaker_map ?? {}) as SpeakerMap) }
  // The diarizer sometimes splits one voice in two: a second label with a name another label
  // already has becomes that label, as the website's "same as" does.
  const twin = Object.entries(map).find(([l, e]) => l !== label && !e.same_as && e.name && foldName(e.name) === foldName(name))
  let personId: string | null = null
  if (!i.is_me) {
    const person = await upsertByName(ctx.email, name, null)
    await linkPerson(ctx.email, s.id, person.id, 'user')
    ctx.enrich.add(person.id)
    personId = person.id
  }
  map[label] = twin
    ? { name: '', person_id: null, me: false, same_as: twin[0], source: 'user' }
    : { name, person_id: personId, me: i.is_me, same_as: null, source: 'user' }
  await updateSession(s.id, { speaker_map: map })
  return {
    ok: true,
    speaker: label,
    now_called: name + (i.is_me ? ' (the user)' : ''),
    ...(twin ? { merged_with: `speaker ${twin[0]}, already ${name}` } : {}),
    recording: s.title ?? s.source_name,
    note: 'The transcript shows the name now; the notes still use the old labels until redo_notes.',
  }
}

async function updateRecording(ctx: Ctx, i: { session_id: string; title: string; category: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording' }
  const patch: Record<string, unknown> = {}
  const title = i.title.trim().slice(0, 200)
  if (title) patch.title = title
  const cat = i.category.trim()
  if (cat) patch.meeting_type = (COMMON_TYPES.find((t) => foldName(t) === foldName(cat)) ?? cat).slice(0, 40)
  if (!Object.keys(patch).length) return { error: 'nothing to change' }
  await updateSession(s.id, patch)
  return { ok: true, was: { title: s.title, category: s.meeting_type }, now: { title: patch.title ?? s.title, category: patch.meeting_type ?? s.meeting_type } }
}

async function redoNotes(ctx: Ctx, id: string): Promise<unknown> {
  const s = await ownSession(ctx, id)
  if (!s) return { error: 'no such recording' }
  if (!s.transcript?.utterances?.length && !s.transcript?.text) return { error: 'this recording has no transcript yet' }
  if (ctx.redo) return { error: 'one rewrite per message' }
  ctx.redo = { sessionId: s.id, ...(s.meeting_type ? { type: s.meeting_type } : {}) }
  return { ok: true, queued: true, recording: s.title ?? s.source_name, note: 'Starts after your reply; the new briefing is sent here in a minute or two.' }
}

/* ---------------------------------------------------- prep, to-dos, notes */

async function personBrief(ctx: Ctx, name: string): Promise<unknown> {
  const want = foldName(name)
  if (!want) return { error: 'a name is required' }
  const { data: all, error } = await supabaseAdmin.from('pen_people').select('*').eq('user_email', ctx.email)
  if (error) throw new Error(error.message)
  const people = ((all ?? []) as Record<string, unknown>[]).filter((p) => {
    const n = foldName(String(p.name ?? ''))
    return n.includes(want) || want.includes(n)
  })
  if (people.length > 1 && !people.some((p) => foldName(String(p.name)) === want)) {
    return { error: 'several contacts match', matches: people.map((p) => p.name), next: 'ask the user which one' }
  }
  const person = people.find((p) => foldName(String(p.name)) === want) ?? people[0] ?? null

  // Recordings with them: linked as a contact, or named in the notes or title.
  const linkedIds = new Set<string>()
  if (person) {
    const { data: links } = await supabaseAdmin.from('pen_session_people').select('session_id').eq('user_email', ctx.email).eq('person_id', person.id as string)
    for (const l of links ?? []) linkedIds.add(l.session_id as string)
  }
  const { data: rows } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,notes,recorded_at,created_at')
    .eq('user_email', ctx.email)
    .or('merge_index.is.null,merge_index.eq.0')
    .order('created_at', { ascending: false })
    .limit(300)
  const calls = ((rows ?? []) as unknown as SessionRow[]).filter((r) => {
    if (linkedIds.has(r.id)) return true
    const has = (v: string | null | undefined) => !!v && foldName(v).includes(want)
    return has(r.title) || has(r.client_name) || (r.notes?.people ?? []).some((p) => has(p.name))
  })
  const todos = (await openTodos(ctx, name, true)) as { todos: Record<string, unknown>[] }
  return {
    contact: person
      ? { name: person.name, email: person.email, phone: person.phone ?? null, role: person.role, company: person.company, about: person.about ?? null, summary: person.summary }
      : null,
    calls: calls.length,
    last_calls: calls.slice(0, 5).map((c) => ({
      session_id: c.id,
      date: (c.recorded_at ?? c.created_at).slice(0, 10),
      title: c.title,
      summary: c.notes?.summary?.slice(0, 600) ?? null,
    })),
    open_todos: todos.todos,
    ...(!person && !calls.length ? { note: 'no contact and no calls with that name' } : {}),
  }
}

export type PersonBrief = {
  contact: { name: unknown; email: unknown; role: unknown; company: unknown } | null
  calls: number
  last_calls: { session_id: string; date: string; title: string | null; summary: string | null }[]
  open_todos: Record<string, unknown>[]
  error?: string
}

/** person_brief outside a chat turn: the proactive meeting brief (lib/pen/proactive.ts). */
export async function personBriefFor(email: string, name: string): Promise<PersonBrief> {
  const ctx: Ctx = {
    email, msgId: 'proactive', question: '', history: [], recent: null, userName: null, channel: 'whatsapp', phone: '', lang: 'en',
    citations: [], drafted: null, sent: false, enrich: new Set(), later: [], notify: async () => {},
  }
  return (await personBrief(ctx, name)) as PersonBrief
}

/** Owner as the user said it → the action's owner text and the to-do's whose-is-it label. */
function ownerOf(ctx: Ctx, owner: string): { owner: string; mine: Mine } {
  const o = owner.trim()
  if (!o || /^(me|i|yo|eu|myself)$/i.test(o) || (ctx.userName && foldName(o) === foldName(ctx.userName))) return { owner: ctx.userName ?? '', mine: 'me' }
  if (/^(shared|both|ambos|nosotros|n[oó]s)$/i.test(o)) return { owner: '', mine: 'shared' }
  return { owner: o.slice(0, 80), mine: 'other' }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The labels array kept the same length as the actions, or open_todos stops trusting it. */
function metaFor(s: { notes: PenNotes | null; action_meta?: ActionMeta[] | null }): ActionMeta[] {
  const n = s.notes?.actions?.length ?? 0
  const m = Array.isArray(s.action_meta) ? s.action_meta : []
  return Array.from({ length: n }, (_, i) => m.length === n ? m[i] : { mine: 'unclear' as Mine, due_date: null, waiting: null })
}

async function addTodo(ctx: Ctx, i: { session_id: string; action: string; owner: string; due_date: string; waiting: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording; find it with list_recordings' }
  const action = i.action.trim().slice(0, 500)
  if (!action) return { error: 'the to-do is empty' }
  if (i.due_date.trim() && !DAY.test(i.due_date.trim())) return { error: 'due_date must be YYYY-MM-DD' }
  const who = ownerOf(ctx, i.owner)
  const notes: PenNotes = { ...(s.notes ?? {}) }
  const meta = metaFor(s)
  notes.actions = [...(notes.actions ?? []), { action, owner: who.owner, due: i.due_date.trim(), priority: 'normal' }]
  meta.push({ mine: who.mine, due_date: i.due_date.trim() || null, waiting: i.waiting.trim() || null })
  await updateSession(s.id, { notes, action_meta: meta })
  return { ok: true, added: action, owner: who.owner || who.mine, due_date: i.due_date.trim() || null, recording: s.title ?? s.source_name, ref: `${s.id}#${notes.actions.length - 1}` }
}

async function updateTodo(ctx: Ctx, i: { ref: string; action: string; due_date: string; owner: string }): Promise<unknown> {
  const m = /^([0-9a-f-]{36})#(\d+)$/i.exec(i.ref.trim())
  if (!m) return { error: 'bad ref: use one from open_todos' }
  const s = await getSession(ctx.email, m[1])
  const index = Number(m[2])
  const old = s?.notes?.actions?.[index]
  if (!s || !old) return { error: 'no such to-do' }
  const due = i.due_date.trim()
  if (due && due !== 'none' && !DAY.test(due)) return { error: 'due_date must be YYYY-MM-DD or "none"' }
  const notes: PenNotes = { ...(s.notes ?? {}), actions: [...(s.notes?.actions ?? [])] }
  const meta = metaFor(s)
  const next = { ...old }
  if (i.action.trim()) next.action = i.action.trim().slice(0, 500)
  if (due) {
    next.due = due === 'none' ? '' : due
    meta[index] = { ...meta[index], due_date: due === 'none' ? null : due }
  }
  if (i.owner.trim()) {
    const who = ownerOf(ctx, i.owner)
    next.owner = who.owner
    meta[index] = { ...meta[index], mine: who.mine }
  }
  notes.actions![index] = next
  await updateSession(s.id, { notes, action_meta: meta })
  return { ok: true, was: { action: old.action, owner: old.owner, due: old.due }, now: { action: next.action, owner: next.owner || meta[index].mine, due: next.due }, recording: s.title ?? s.source_name }
}

async function addNote(ctx: Ctx, i: { session_id: string; text: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording; find it with list_recordings' }
  const text = i.text.trim().slice(0, 4000)
  if (!text) return { error: 'the note is empty' }
  // Same shape the website's note editor saves, with the plain-text mirror the briefing reads.
  const blocks: NoteBlock[] = s.note_blocks?.length
    ? [...s.note_blocks]
    : (s.user_notes ?? '').split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean).map((t) => ({ id: crypto.randomBytes(6).toString('hex'), text: t, source: 'user' as const }))
  blocks.push({ id: crypto.randomBytes(6).toString('hex'), text, source: 'user' })
  await updateSession(s.id, { note_blocks: blocks, user_notes: blocks.map((b) => b.text).filter(Boolean).join('\n\n') })
  return { ok: true, added: text, recording: s.title ?? s.source_name }
}

const digits = (v: string) => v.replace(/[^\d+]/g, '')

export async function saveContact(ctx: Ctx, i: { name: string; email: string; phone: string; company: string; role: string; session_id: string }): Promise<unknown> {
  const name = cleanName(i.name)
  if (!name) return { error: 'a name is required' }
  const email = i.email.trim() ? cleanEmail(i.email) : null
  if (i.email.trim() && !email) return { error: `"${i.email}" is not a valid email address` }
  const person = await upsertByName(ctx.email, name, email)
  const blanks: Record<string, string> = {}
  const cur = person as unknown as Record<string, unknown>
  if (i.company.trim() && !cur.company) blanks.company = i.company.trim().slice(0, 120)
  if (i.role.trim() && !cur.role) blanks.role = i.role.trim().slice(0, 120)
  const phone = digits(i.phone)
  const notes: string[] = []
  if (Object.keys(blanks).length) await supabaseAdmin.from('pen_people').update({ ...blanks, updated_at: new Date().toISOString() }).eq('id', person.id)
  if (phone.replace(/\D/g, '').length >= 7 && !cur.phone) {
    const { error } = await supabaseAdmin.from('pen_people').update({ phone }).eq('id', person.id)
    if (error) notes.push('the phone could not be saved yet (no phone column); tell the user it is noted in this chat only')
  }
  let recording: string | null = null
  if (i.session_id.trim()) {
    const s = await ownSession(ctx, i.session_id)
    if (s) {
      await linkPerson(ctx.email, s.id, person.id, 'user')
      ctx.enrich.add(person.id)
      recording = s.title ?? s.source_name
    }
  }
  return {
    ok: true,
    saved: { name: person.name, email: person.email ?? email, phone: (cur.phone as string | null) ?? (phone || null), company: (cur.company as string | null) ?? blanks.company ?? null, role: (cur.role as string | null) ?? blanks.role ?? null },
    ...(recording ? { added_to: recording } : {}),
    ...(notes.length ? { note: notes.join('; ') } : {}),
  }
}

async function whatsappLink(ctx: Ctx, i: { to_name: string; phone: string; text: string }): Promise<unknown> {
  const text = i.text.trim().slice(0, 3000)
  if (!text) return { error: 'the message is empty' }
  let phone = digits(i.phone).replace(/^\+/, '')
  if (!phone) {
    const want = foldName(i.to_name)
    const { data } = await supabaseAdmin.from('pen_people').select('*').eq('user_email', ctx.email)
    const hits = ((data ?? []) as Record<string, unknown>[]).filter((p) => p.phone && foldName(String(p.name)).includes(want))
    if (hits.length > 1) return { error: 'several contacts match', matches: hits.map((p) => p.name) }
    phone = hits[0] ? digits(String(hits[0].phone)).replace(/^\+/, '') : ''
  }
  if (phone.length < 7) return { error: `no phone number saved for ${i.to_name}; ask the user for it (with country code)` }
  return { ok: true, link: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, note: 'Give the user this link exactly; tapping it opens their own WhatsApp with the message ready to send.' }
}

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<unknown> {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (name) {
    case 'search_recordings':
      return searchRecordings(ctx, str('question') || ctx.question)
    case 'open_todos':
      return openTodos(ctx, str('person') || undefined, input.include_others === true)
    case 'mark_todo':
      return markTodo(ctx, str('ref'), input.done !== false)
    case 'get_recording':
      return getRecording(ctx, str('session_id'))
    case 'find_person':
      return findPerson(ctx, str('name'))
    case 'save_draft':
      return saveDraft(ctx, {
        to_name: str('to_name'),
        to_email: str('to_email'),
        subject: str('subject'),
        body: str('body'),
        session_id: str('session_id'),
        from: str('from'),
      })
    case 'send_draft':
      return sendDraft(ctx)
    case 'set_draft_from':
      return setDraftFrom(ctx, str('from'))
    case 'set_mail_app':
      return setMailAppTool(ctx, str('app'))
    case 'set_reminder':
      return setReminder(ctx, { text: str('text'), in_minutes: Number(input.in_minutes) || 0, at: str('at') })
    case 'list_reminders':
      return { reminders: await pendingReminders(ctx.email) }
    case 'list_recordings':
      return listRecordings(ctx, str('query'))
    case 'recording_people':
      return recordingPeople(ctx, str('session_id'))
    case 'add_person':
      return addPerson(ctx, { session_id: str('session_id'), name: str('name'), email: str('email') })
    case 'remove_person':
      return removePerson(ctx, { session_id: str('session_id'), name: str('name') })
    case 'name_speaker':
      return nameSpeaker(ctx, { session_id: str('session_id'), label: str('label'), name: str('name'), is_me: input.is_me === true })
    case 'recording_conversations':
      return recordingConversations(ctx, str('session_id'))
    case 'read_conversation':
      return readConversation(ctx, str('session_id'), Number(input.conversation) || 0)
    case 'split_conversations':
      return queueSplit(ctx, str('session_id'))
    case 'name_conversation':
      return nameConversation(ctx, { session_id: str('session_id'), conversation: Number(input.conversation) || 0, name: str('name') })
    case 'update_recording':
      return updateRecording(ctx, { session_id: str('session_id'), title: str('title'), category: str('category') })
    case 'redo_notes':
      return redoNotes(ctx, str('session_id'))
    case 'person_brief':
      return personBrief(ctx, str('name'))
    case 'add_todo':
      return addTodo(ctx, { session_id: str('session_id'), action: str('action'), owner: str('owner'), due_date: str('due_date'), waiting: str('waiting') })
    case 'update_todo':
      return updateTodo(ctx, { ref: str('ref'), action: str('action'), due_date: str('due_date'), owner: str('owner') })
    case 'add_note':
      return addNote(ctx, { session_id: str('session_id'), text: str('text') })
    case 'save_contact':
      return saveContact(ctx, { name: str('name'), email: str('email'), phone: str('phone'), company: str('company'), role: str('role'), session_id: str('session_id') })
    case 'whatsapp_link':
      return whatsappLink(ctx, { to_name: str('to_name'), phone: str('phone'), text: str('text') })
    case 'cancel_reminder':
      return (await cancelReminder(ctx.email, str('id'))) ? { ok: true } : { error: 'no such pending reminder' }
    default: {
      for (const m of MODULES) {
        const out = m.run(ctx, name, input)
        if (out !== undefined) return out
      }
      return { error: `unknown tool ${name}` }
    }
  }
}

/* ------------------------------------------------------------------- loop */

const HINT: Record<Lang, { from: string; to: string; subject: string; send: string; noEmail: string; openIn: (p: string) => string; app: string; inThread: string }> = {
  en: { from: 'From', to: 'To', subject: 'Subject', send: 'Reply *send it* to send, or tell me what to change.', noEmail: 'Send me their email and I\'ll add it.', openIn: (p) => `Open in ${p}`, app: 'Open in your mail app', inThread: '↩️ Reply in the same thread' },
  es: { from: 'De', to: 'Para', subject: 'Asunto', send: 'Responde *envíalo* para mandarlo, o dime qué cambiar.', noEmail: 'Mándame su email y lo agrego.', openIn: (p) => `Abrir en ${p}`, app: 'Abrir en tu app de correo', inThread: '↩️ Respuesta en el mismo hilo' },
  pt: { from: 'De', to: 'Para', subject: 'Assunto', send: 'Responda *enviar* para mandar, ou me diga o que mudar.', noEmail: 'Me mande o email e eu adiciono.', openIn: (p) => `Abrir no ${p}`, app: 'Abrir no seu app de e-mail', inThread: '↩️ Resposta na mesma conversa' },
}

const publicBase = () => (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')

/** Short https links (app/m/[id]): WhatsApp doesn't linkify mailto:, and compose URLs are long.
 *  'w' + draft id = the web mail's compose, 'a' + draft id = the phone's mail app. They die with
 *  the draft (24 h, or when it is sent or replaced), so an edit always gets new links. */
export function mailLink(d: Pick<Draft, 'id'>, kind: 'w' | 'a'): string {
  return `${publicBase()}/m/${kind}${d.id}`
}

/** The web-compose link first (when the provider is known), the mail-app link second. */
export function draftLinks(d: Draft, lang: Lang = 'en'): string {
  const h = HINT[lang]
  return [d.provider ? `${h.openIn(PROVIDER_NAME[d.provider])}: ${mailLink(d, 'w')}` : null, `${h.app}: ${mailLink(d, 'a')}`].filter(Boolean).join('\n')
}

export function draftPreview(d: Draft, lang: Lang = 'en', channel: AgentChannel = 'whatsapp'): string {
  const h = HINT[lang]
  // Web: markdown-light, no "reply send it" and no links (the Send button and the draft card carry them).
  if (channel === 'web') {
    return `✉️ ${d.thread ? `${h.inThread}\n` : ''}${d.from ? `**${h.from}:** ${d.from}\n` : ''}**${h.to}:** ${d.toName}${d.toEmail ? ` <${d.toEmail}>` : ''}\n**${h.subject}:** ${d.subject}\n\n${d.body}`
  }
  return (
    `✉️ ${d.thread ? `${h.inThread}\n` : ''}${d.from ? `*${h.from}:* ${d.from}\n` : ''}*${h.to}:* ${d.toName}${d.toEmail ? ` <${d.toEmail}>` : ''}\n*${h.subject}:* ${d.subject}\n\n${d.body}\n\n` +
    `_${d.toEmail ? h.send : h.noEmail}_\n` +
    draftLinks(d, lang)
  )
}

/** Gmail or Outlook didn't send it: say so plainly, and hand them the draft to send themselves. */
function gmailFailed(lang: Lang, d: Draft, reason: 'cap' | 'not_connected' | 'revoked' | 'failed', provider: 'gmail' | 'outlook' = 'gmail'): string {
  const links = draftLinks(d, lang)
  const ms = provider === 'outlook'
  const L = {
    en: {
      revoked: `I couldn't send it from ${d.from}: ${ms ? 'Microsoft' : 'Google'} no longer lets Juno send from that address. Say "connect my ${ms ? 'Outlook' : 'Gmail'}" to connect it again, or send it yourself:`,
      not_connected: `I couldn't send it: ${d.from} isn't connected anymore. Say "connect my ${ms ? 'Outlook' : 'Gmail'}" to connect it again, or send it yourself:`,
      cap: 'I couldn\'t send it: that\'s the daily limit of emails from Juno. Send it yourself:',
      failed: `${ms ? 'Outlook' : 'Gmail'} didn't accept it, so nothing was sent from ${d.from}. Try "send it" again in a minute, or send it yourself:`,
    },
    es: {
      revoked: `No pude enviarlo desde ${d.from}: ${ms ? 'Microsoft' : 'Google'} ya no deja que Juno envíe desde esa dirección. Di "conecta mi ${ms ? 'Outlook' : 'Gmail'}" para conectarla de nuevo, o envíalo tú:`,
      not_connected: `No pude enviarlo: ${d.from} ya no está conectada. Di "conecta mi ${ms ? 'Outlook' : 'Gmail'}" para conectarla de nuevo, o envíalo tú:`,
      cap: 'No pude enviarlo: llegaste al límite diario de correos desde Juno. Envíalo tú:',
      failed: `${ms ? 'Outlook' : 'Gmail'} no lo aceptó, así que no salió nada desde ${d.from}. Intenta "envíalo" de nuevo en un minuto, o envíalo tú:`,
    },
    pt: {
      revoked: `Não consegui enviar de ${d.from}: ${ms ? 'a Microsoft' : 'o Google'} não deixa mais o Juno enviar desse endereço. Diga "conectar meu ${ms ? 'Outlook' : 'Gmail'}" para conectar de novo, ou envie você mesmo:`,
      not_connected: `Não consegui enviar: ${d.from} não está mais conectado. Diga "conectar meu ${ms ? 'Outlook' : 'Gmail'}" para conectar de novo, ou envie você mesmo:`,
      cap: 'Não consegui enviar: é o limite diário de e-mails pelo Juno. Envie você mesmo:',
      failed: `O ${ms ? 'Outlook' : 'Gmail'} não aceitou, então nada saiu de ${d.from}. Tente "enviar" de novo daqui a um minuto, ou envie você mesmo:`,
    },
  }[lang]
  return `${L[reason]}\n${links}`
}

/**
 * Tools that may still run after email content entered the turn (search_email / read_thread): reading,
 * and drafts (shown, never sent without the user's later "send it"). Everything else (sending,
 * confirming, deleting, connecting…) waits for the user's own next message. Prompt injection in an
 * email can then at worst produce a draft the user sees.
 */
export const MAIL_SAFE: ReadonlySet<string> = new Set([
  'search_email', 'read_thread', 'reply_in_thread', 'save_draft', 'set_draft_from', 'set_mail_app',
  'search_recordings', 'open_todos', 'get_recording', 'find_person', 'list_recordings', 'recording_people',
  'recording_conversations', 'read_conversation', 'person_brief', 'list_reminders', 'connection_status',
  'list_suggestions', 'missed_items', 'find_events', 'set_reminder', 'add_todo', 'add_to_calendar',
  'list_events', 'find_meeting',
  // Google Docs & Sheets, read-only (21 Oct). Editing them (edit_google_doc / edit_google_sheet) is not here.
  'find_google_file', 'read_google_file',
])

/**
 * The confirm slip (19 Oct, founder's chat): after finding the meeting, Juno wrote "Reply yes to
 * confirm" before setting two reminders. Reminders, to-dos and adding to the user's own calendar
 * run at once (confirm.ts). If a reply still asks for a yes while the user asked for one of those
 * and no tool asked (askConfirm), the turn gets one more round with the rule restated, so the
 * action is done in this reply instead of the next.
 */
export const ASKS_YES = /(\b(reply|answer|say|text)\s+\*?_?(yes|y|ok)\b)|(\b(responde|contesta|escribe|di)\s+\*?_?(s[ií]|ok)(?![a-z]))|(\b(responda|diga)\s+\*?_?(sim|ok)\b)|\bconfirm(ar|a|e|o)?\b[^.\n]{0,60}\?|¿\s*confirm|\b(shall|should) i (go ahead|set|add|create|schedule|put)\b|\b(do you )?want me to (go ahead|set (them|it|those|the|both|a|up)|add (them|it|those|both)|create (them|it))\b|¿\s*(quieres|deseas) que (los |las |lo |la |te )?(ponga|programe|configure|cree|agregue|active)|\b(quer|deseja) que eu (crie|coloque|programe|adicione|configure)|is that (right|correct|ok)\?\s*$|¿(est[aá] bien|correcto)\?\s*$/i
/** The user asked for something that runs at once: a reminder, a to-do, an event on their own calendar. */
export const WANTS_SELF = /\b(remind|reminder|alert me|ping me|recu[eé]rd(a|ame|enme)|recordatorio|av[ií]same|lembr(e|a|ete|ar)|lembrete|me avis(e|a)|to-?do|tarea|pendiente|tarefa|add (it |this |that )?to my calendar|agend(a|alo|ar)|a[nñ]ad(e|ir)|agreg(a|alo|ar)|adiciona(r)?|p[oó]n(lo|me)? en (mi )?calendario|coloca na (minha )?agenda)\b/i

/** A bare go-ahead. Handled in code, so a send never depends on the model choosing to call a tool. */
export const SEND_IT = /^\s*(send( it| the email)?|yes,? send( it)?|env[ií]a(lo)?|m[aá]nd(a|alo)|s[ií],? (env[ií]alo|m[aá]ndalo)|pode enviar|envia(r)?|manda(r)?)\s*[.!👍]*\s*$/i

const SENT_GMAIL: Record<Lang, (from: string, to: string, subject: string) => string> = {
  en: (f, to, s) => `Sent from ${f} to ${to}: "${s}". It's in your Sent folder, and replies will go to you.`,
  es: (f, to, s) => `Enviado desde ${f} a ${to}: "${s}". Está en tus Enviados y las respuestas te llegan a ti.`,
  pt: (f, to, s) => `Enviado de ${f} para ${to}: "${s}". Está nos seus Enviados e as respostas vão para você.`,
}

const SENT_REPLY: Record<Lang, (from: string, to: string, subject: string, outlook?: boolean) => string> = {
  en: (f, to, s, o) => `Replied from ${f} to ${to} in the same thread: "${s}". It's in your ${o ? 'Sent Items' : 'Sent folder'}.`,
  es: (f, to, s, o) => `Respondí desde ${f} a ${to} en el mismo hilo: "${s}". Está en tus ${o ? 'Elementos enviados' : 'Enviados'}.`,
  pt: (f, to, s, o) => `Respondi de ${f} para ${to} na mesma conversa: "${s}". Está nos seus ${o ? 'Itens enviados' : 'Enviados'}.`,
}

const SENT: Record<Lang, (to: string, subject: string) => string> = {
  en: (to, s) => `Sent to ${to}: "${s}". A copy is in your inbox, and replies will go to you.`,
  es: (to, s) => `Enviado a ${to}: "${s}". Tienes una copia en tu correo y las respuestas te llegan a ti.`,
  pt: (to, s) => `Enviado para ${to}: "${s}". Uma cópia está no seu email e as respostas vão para você.`,
}

/** The rule restated for the extra round (ASKS_YES), in the user's language: do it, don't ask. */
const NO_YES: Record<Lang, string> = {
  en: '(Juno rule: reminders, to-dos and events on my own calendar are done at once, never after a yes. Do it now with the tools (relative to a meeting: use the meeting time you found), then tell me in one line what was set and that "undo" cancels it. Don\'t ask me anything.)',
  es: '(Regla de Juno: los recordatorios, pendientes y eventos en mi propio calendario se hacen de inmediato, nunca después de un sí. Hazlo ahora con las herramientas (si es relativo a una reunión, usa la hora que encontraste) y dime en una línea qué quedó y que "deshacer" lo cancela. No me preguntes nada.)',
  pt: '(Regra do Juno: lembretes, tarefas e eventos na minha própria agenda são feitos na hora, nunca depois de um sim. Faça agora com as ferramentas (se for relativo a uma reunião, use o horário que encontrou) e me diga em uma linha o que ficou e que "desfazer" cancela. Não me pergunte nada.)',
}

export async function runAgent(opts: {
  email: string
  msgId: string
  question: string
  history: ArchiveTurn[]
  agentBrief?: string
  recent: string | null
  lang: Lang
  /** WhatsApp / iMessage: the sender. Web: the linked phone (reminders), or none. */
  phone?: string
  /** Default: 'imessage' for an `im:` sender, else 'whatsapp' (bot.ts passes neither). */
  channel?: AgentChannel
  /** Web: draft / question / undo kept on the thread (state.ts webStore). Default: the phone's. */
  store?: AgentStore
  /** Default (phone): send it and keep it in the WhatsApp chat history (phoneNotify). */
  notify?: (text: string) => Promise<void>
  reach?: Ctx['reach']
  /** Web Undo button: undo that turn's action (its ts) rather than the latest. */
  undoTurn?: string
  /** A tool is about to run (web: the progress event). */
  onTool?: (name: string) => void
  /** A photo the user sent (base64), read alongside the question. */
  image?: { data: string; mime: string }
  /** When the latest message of this turn arrived (Ctx.sentAt). */
  sentAt?: number
  /** Continuing an earlier request after a file pick (Ctx.resumeRequest). */
  resumeRequest?: string
}): Promise<AgentResult> {
  const channel: AgentChannel = opts.channel ?? (opts.phone?.startsWith('im:') ? 'imessage' : 'whatsapp')
  const store = opts.store ?? phoneStore(opts.email)
  const notify = opts.notify ?? phoneNotify(opts.email, opts.phone ?? '')
  const userName = (await getProfile(opts.email).catch(() => null))?.name?.trim() || null
  const recentTitle = opts.recent ? ((await getSession(opts.email, opts.recent).catch(() => null))?.title ?? null) : null
  const zone = await userZone(opts.email, opts.phone).catch((): Zone => ({ tz: null, source: 'none', sure: false }))
  const gmail = (await gmailAvailable().catch(() => false)) ? await listAccounts(opts.email).catch((): GmailAccount[] => []) : []
  const outlookAll = (await outlookAvailable().catch(() => false)) ? await listOutlookAccounts(opts.email).catch((): OutlookAccount[] => []) : []
  const outlook = outlookAll.filter((a) => a.can_send)
  // Reading (team test): the allowlist AND an address whose token carries gmail.readonly.
  const gmailReadOk = await gmailReadAllowed(opts.email).catch(() => false)
  const gmailRead = gmailReadOk ? gmail.filter((a) => a.can_read && !a.last_error).map((a) => a.address) : []
  // Outlook reading: the same allowlist, and an address whose token carries Mail.Read.
  const outlookReadOk = outlookAll.length ? await outlookReadAllowed(opts.email).catch(() => false) : false
  const outlookRead = outlookReadOk ? outlookAll.filter((a) => a.can_read && !a.last_error).map((a) => a.address) : []
  const { onTool, undoTurn, ...rest } = opts
  const ctx: Ctx = { ...rest, channel, store, notify, links: [], userName, recentTitle, citations: [], drafted: null, sent: false, enrich: new Set(), later: [], zone, gmail, outlook, gmailRead, gmailReadOk, outlookRead, outlookReadOk }
  const pending = await store.getDraft().catch(() => null)
  const asked = await store.getPending().catch(() => null)
  // Asked, or drafted, after this turn's last message arrived: the user hasn't seen it, so nothing
  // in this message answers it (burst.ts). It stays waiting, untouched.
  const askedUnseen = unseen(asked?.createdAt, opts.sentAt)
  const draftSeen = !unseen(pending?.createdAt, opts.sentAt)

  // A bare yes / no to the question Juno asked last: run it here, then let the model say what
  // happened. The question is then answered, so it leaves the system prompt.
  let answered: string | null = null
  let stillAsked = asked
  // "Undo": the last thing done without asking (combine / separate, undo.ts), run here in code.
  if (UNDO.test(opts.question)) {
    const result = await runUndo(opts.email, { store, ...(undoTurn ? { turn: undoTurn } : {}) }).catch((e) => ({ error: (e as Error).message }))
    answered =
      `(My "${opts.question.slice(0, 40)}" asks to undo your last change, and it has been handled: ${JSON.stringify(result).slice(0, 800)}. ` +
      'Tell me in one line what happened, following any note in it; don\'t ask anything.)'
  } else if (askedUnseen) {
    // Nothing: see above.
  } else if (asked?.kind === 'zone_check' && asked.msgId !== opts.msgId) {
    // "Still in Santiago?" Asking already counted as yes (tools/timezone.ts), so a yes only
    // closes it. The same reply may have offered something else too (a Meet link): a bare yes
    // or no goes to that as well, through the model, never to a stored action.
    if (BARE_YES.test(opts.question)) {
      await store.setPending(null).catch(() => {})
      ctx.pendingTouched = true
      stillAsked = null
      answered =
        `(My "${opts.question.slice(0, 40)}" answers your "${asked.summary}": the time zone is confirmed. Everything in your last ` +
        'message is already saved: set or change nothing again. Reply in a few words ("Great, thanks!"). Only if your last ' +
        'message also offered something new (a Meet link, a draft) is my reply about that too: then do it.)'
    } else if (BARE_NO.test(opts.question)) {
      await markZoneChecked(opts.email, null).catch(() => {})
      // Still open for the city they name next, which moves what was set (set_timezone).
      await store.setPending({ ...asked, msgId: opts.msgId, createdAt: new Date().toISOString() }).catch(() => {})
      ctx.pendingTouched = true
      answered =
        `(My "${opts.question.slice(0, 40)}" answers your "${asked.summary}": I'm not there now. Ask in one short line which city ` +
        `I'm in; nothing has moved yet. If your last message also offered something else, I'm saying no to that too.)`
    }
  } else if (asked && asked.msgId !== opts.msgId && !(pending?.toEmail && draftSeen && SEND_IT.test(opts.question))) {
    const decision = BARE_YES.test(opts.question) ? 'yes' : BARE_NO.test(opts.question) ? 'no' : null
    if (decision) {
      const result = await confirmPending(ctx, decision).catch((e) => ({ error: (e as Error).message }))
      ctx.links!.push(...confirmLinks(result))
      answered =
        `(My reply "${opts.question.slice(0, 40)}" answers your question "${asked.summary}" and it has been handled: ` +
        `${JSON.stringify(result).slice(0, 4000)}. Tell me in one or two lines what happened (several actions: one short line each, done or failed and why), following any note in it; don't ask it again.)`
      stillAsked = null
    }
  }

  if (pending?.toEmail && draftSeen && SEND_IT.test(opts.question)) {
    const r = (await sendDraft(ctx)) as { ok?: boolean; error?: string; plain?: string; sent_from?: string }
    if (r.ok) {
      await dropIfUnanswered(ctx, asked).catch(() => {})
      const to = `${pending.toName} <${pending.toEmail}>`
      const text = !r.sent_from ? SENT[opts.lang](to, pending.subject)
        : pending.thread ? SENT_REPLY[opts.lang](r.sent_from, to, pending.subject, pending.thread.provider === 'outlook')
          : SENT_GMAIL[opts.lang](r.sent_from, to, pending.subject)
      return { text, citations: [], ...(channel === 'web' ? { parts: {} } : {}) }
    }
    // Their Gmail refused it: the plain words and the links, from code, not the model.
    if (r.plain) {
      await dropIfUnanswered(ctx, asked).catch(() => {})
      return { text: channel === 'web' ? webText(r.plain) : r.plain, citations: [], ...(channel === 'web' ? { parts: {} } : {}) }
    }
    // Not sent (daily cap, provider error): let the model explain it in context.
  }

  // Briefings sent here are in the history as assistant turns with no user turn before them
  // (sendWhatsAppBriefing), and two can arrive in a row. Same-role turns are merged, and a
  // history that opens with Juno's message gets a stand-in for the recording the user sent, so
  // "Carlos and Titi" in reply to "Who was on this call?" keeps the question it answers.
  const messages: Anthropic.MessageParam[] = []
  for (const t of [...opts.history.slice(-12), { role: 'user' as const, content: answered ? `${opts.question}\n\n${answered}` : opts.question }]) {
    const last = messages[messages.length - 1]
    if (last && last.role === t.role) last.content = `${last.content as string}\n\n${t.content}`
    else messages.push({ role: t.role, content: t.content })
  }
  if (messages[0]?.role === 'assistant') messages.unshift({ role: 'user', content: '(I sent you a recording.)' })
  if (opts.image) {
    const last = messages[messages.length - 1]
    last.content = [
      { type: 'image', source: { type: 'base64', media_type: opts.image.mime as 'image/jpeg', data: opts.image.data } },
      { type: 'text', text: last.content as string },
    ]
  }

  let text = ''
  // The confirm slip guard (ASKS_YES): one extra round when a reply asks a yes it shouldn't.
  let nudged = false
  let ranSelf = false
  for (let round = 0; round < MAX_ROUNDS + 1; round++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Medium: a WhatsApp reply should arrive while "typing…" is still showing.
      output_config: { effort: 'medium' },
      system: system(ctx, pending, stillAsked, askedUnseen),
      tools: toolsFor(ctx, [...TOOLS, ...MODULES.flatMap((m) => (!m.when || m.when(ctx) ? m.tools : []))]),
      messages,
    })
    text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
    if (res.stop_reason !== 'tool_use') {
      // Also after reading email: set_reminder / add_todo / add_to_calendar / find_meeting are MAIL_SAFE.
      if (!nudged && !ctx.askedNow && !ranSelf && WANTS_SELF.test(opts.question) && ASKS_YES.test(text)) {
        nudged = true
        messages.push({ role: 'assistant', content: res.content })
        messages.push({ role: 'user', content: NO_YES[opts.lang] })
        continue
      }
      break
    }
    if (round >= MAX_ROUNDS) break

    messages.push({ role: 'assistant', content: res.content })
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const results: Anthropic.ToolResultBlockParam[] = []
    // One at a time: save_draft then send_draft in the same round must see each other.
    for (const c of calls) {
      try {
        // Email content came in this turn: nothing but reading and drafts until the user writes again.
        if (ctx.mailTainted && !MAIL_SAFE.has(c.name)) {
          results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify({ error: 'not done: email content was read in this turn, so this action has to be asked for by the user in a new message. Tell them what you would do and let them ask.' }), is_error: true })
          continue
        }
        onTool?.(c.name)
        const out = await runTool(ctx, c.name, (c.input ?? {}) as Record<string, unknown>)
        ctx.links!.push(...(c.name === 'confirm_pending' ? confirmLinks(out) : linksFrom(c.name, (c.input ?? {}) as Record<string, unknown>, out)))
        const isError = !!out && typeof out === 'object' && 'error' in out
        if (!isError && (['set_reminder', 'add_todo', 'add_to_calendar'].includes(c.name) || (c.name === 'find_meeting' && ((out as { reminders_set?: unknown[] }).reminders_set?.length ?? 0) > 0))) ranSelf = true
        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(isError ? { is_error: true } : {}) })
      } catch (e) {
        console.warn(`pen whatsapp agent: ${c.name} failed: ${(e as Error).message}`)
        results.push({ type: 'tool_result', tool_use_id: c.id, content: `failed: ${(e as Error).message}`, is_error: true })
      }
    }
    // Tool results are often in the recordings' language; the reply follows the question's.
    messages.push({
      role: 'user',
      content: [...results, { type: 'text', text: `(Reply in the language of my message: "${opts.question.slice(0, 120)}")` }],
    })
  }

  // A "still in Santiago?" added this turn waits for the answer (and is in the reply).
  text = await finishZoneTurn(ctx, text)
  // This message wasn't the yes to an earlier ask: that ask is over (confirm.ts).
  await dropIfUnanswered(ctx, asked).catch((e) => console.warn(`pen whatsapp: drop pending: ${(e as Error).message}`))
  // Web: the draft is a card (parts.draft), not text; the model sees it next turn through the memo.
  if (ctx.drafted && channel !== 'web') text = `${text ? `${text}\n\n` : ''}${draftPreview(ctx.drafted, opts.lang)}`
  // Sources only if the reply actually carries the markers.
  const citations = ctx.citations.filter((c) => text.includes(`[${c.marker}]`))
  const enrich = [...ctx.enrich]
  const later = ctx.later
  // Thread ids for the next message ("reply to that"), kept in the chat history only, never shown.
  const memo = ctx.mailSeen?.length
    ? `[Email threads (ids for read_thread / reply_in_thread; never shown to the user): ${ctx.mailSeen.slice(0, 10).map((t) => `${t.thread_id} in ${t.account}${t.from ? ` from ${t.from}` : ''}`).join('; ')}]`
    : undefined
  const parts: AgentParts | undefined = channel === 'web'
    ? {
        // The buttons say yes / no: a trailing "Reply yes." in the question is for the phone.
        ask: ctx.asked ? { ...ctx.asked, summary: ctx.asked.summary.replace(/\s*Reply yes\b[^.?!]*[.!]?\s*$/i, '').trim() } : null,
        draft: ctx.drafted ? agentDraft(ctx.drafted) : null,
        links: dedupeLinks(ctx.links ?? []),
        undoable: Boolean(ctx.undoable),
        // What the model reads back next turn (never shown): the draft as it was shown, and thread ids.
        ...(ctx.drafted || memo ? { memo: [ctx.drafted ? `[The draft shown under this reply]\n${draftPreview(ctx.drafted, opts.lang, 'web')}` : '', memo ?? ''].filter(Boolean).join('\n\n') } : {}),
      }
    : undefined
  return {
    text: text || '…',
    citations,
    ...(memo ? { memo } : {}),
    ...(parts ? { parts } : {}),
    ...(ctx.redo ? { redo: ctx.redo } : {}),
    ...(ctx.split ? { split: ctx.split } : {}),
    ...(enrich.length || later.length
      ? {
          after: async () => {
            await Promise.all(enrich.map((id) => enrichPerson(opts.email, id).catch((e) => console.warn(`pen whatsapp: enrich ${id}: ${(e as Error).message}`))))
            for (const job of later) await job().catch((e) => console.warn(`pen whatsapp: after-reply job failed: ${(e as Error).message}`))
          },
        }
      : {}),
  }
}

/* ------------------------------------------------------------- channels */

/** The phone's after-reply message (tools' tell): sent, and kept in the WhatsApp chat history. */
export function phoneNotify(email: string, phone: string): (text: string) => Promise<void> {
  return async (text) => {
    await sendText(phone, text)
    const link = await getLinkByEmail(email).catch(() => null)
    if (link) await setChat(email, [...(link.chat ?? []), { role: 'assistant', content: text, ts: Date.now() }]).catch(() => {})
  }
}

/** WhatsApp formatting → the web's markdown-light: *bold* → **bold**, "• " → "- ". Idempotent. */
export function webText(t: string): string {
  return t
    .replace(/(^|[^*\w])\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*(?![*\w])/g, '$1**$2**')
    .replace(/^(\s*)• /gm, '$1- ')
}

/** The draft as the web card shows it (lib/pen/agent-io.ts AgentDraft). `to` is "Name <email>", or the name alone while no email is known. */
export function agentDraft(d: Draft): AgentDraft {
  return {
    from: d.from ?? null,
    to: [d.toEmail ? `${d.toName} <${d.toEmail}>` : d.toName],
    subject: d.subject,
    body: d.body,
    composeUrl: d.provider ? mailLink(d, 'w') : null,
    mailtoUrl: mailLink(d, 'a'),
  }
}

const DOC_TOOLS: Record<string, { kind: AgentLink['kind']; title: string }> = {
  create_doc: { kind: 'doc', title: 'Google Doc' },
  send_to_google_docs: { kind: 'doc', title: 'Notes in Google Docs' },
  create_sheet: { kind: 'sheet', title: 'Google Sheet' },
  export_todos_sheet: { kind: 'sheet', title: 'To-dos sheet' },
  export_contacts_sheet: { kind: 'sheet', title: 'Contacts sheet' },
  send_to_notion: { kind: 'notion', title: 'Notes in Notion' },
}
const CONNECT_NAME: Record<string, string> = {
  google_calendar: 'Google Calendar', google_docs: 'Google Docs & Sheets', notion: 'Notion', granola: 'Granola', gmail: 'Gmail', outlook: 'Outlook',
}
const CONNECT_URL = /https?:\/\/\S+\/api\/pen\/connect\/[A-Za-z0-9._~-]+/

/** What a tool result made or opened, as web cards: files, calendar events, connect links, a recording. */
export function linksFrom(name: string, input: Record<string, unknown>, out: unknown): AgentLink[] {
  if (!out || typeof out !== 'object') return []
  const o = out as Record<string, unknown>
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '')
  const links: AgentLink[] = []
  const ok = !('error' in o)
  const doc = DOC_TOOLS[name]
  if (doc && ok && /^https?:\/\//.test(s('url'))) {
    links.push({ kind: doc.kind, title: (typeof input.title === 'string' && input.title.trim()) || s('title') || doc.title, url: s('url') })
  }
  if (/^https?:\/\//.test(s('calendar_link'))) {
    links.push({ kind: 'event', title: s('title') || (typeof input.title === 'string' ? input.title : '') || 'Calendar event', url: s('calendar_link') })
  }
  const connect = s('connect_link') || (CONNECT_URL.exec(s('message'))?.[0] ?? '')
  if (connect && CONNECT_URL.test(connect)) {
    const app = typeof input.app === 'string' ? input.app : ''
    const title = CONNECT_NAME[app] ?? (name === 'send_to_notion' ? 'Notion' : doc ? 'Google Docs & Sheets' : 'Connect')
    links.push({ kind: 'connect', title, url: connect })
  }
  if (name === 'get_recording' && ok && typeof o.session_id === 'string') {
    links.push({ kind: 'recording', title: s('title') || 'Recording', url: `${publicBase()}/pen?open=${encodeURIComponent(o.session_id)}` })
  }
  return links
}

/** Cards for what a yes ran: one result, or each result of a batch (confirm.ts confirmPending). */
function confirmLinks(out: unknown): AgentLink[] {
  const results = (out as { results?: unknown } | null)?.results
  return Array.isArray(results) ? results.flatMap((r) => linksFrom('confirm_pending', {}, r)) : linksFrom('confirm_pending', {}, out)
}

function dedupeLinks(links: AgentLink[]): AgentLink[] {
  const seen = new Set<string>()
  return links.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
}

/** For tests (.pentest/web-agent-unit.mts): the system prompt for a turn. */
export const systemPrompt = system
