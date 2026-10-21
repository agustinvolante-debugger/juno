// One assistant, every channel (22 Oct): what the WhatsApp/iMessage agent (lib/pen/whatsapp/agent.ts)
// needs from where it runs, and what it hands back, so the web chat (app/api/pen/chats) can run the
// same tools. Pure types, no server imports: app/pen/* imports the result shapes.
//
// Channels: 'whatsapp' | 'imessage' (phone known; replies are WhatsApp-formatted text, confirms are
// "reply yes", state lives on pen_whatsapp_links / pen_whatsapp_messages as today) and 'web' (no
// phone; markdown-light text; confirms, drafts and undo are buttons; state lives on the chat thread:
// pen_chats.agent_state jsonb = WebAgentState).
//
// Web route: POST /api/pen/chats { id?, question, mentions?, action? } streams Server-Sent Events:
//   event: progress  data: { label: string }            a tool started ("Adding to your calendar…")
//   event: done      data: { chat: <pen_chats row as GET returns it> }
//   event: error     data: { error: string }
// `action` replaces `question` for a button press: { kind: 'confirm', yes: boolean } |
// { kind: 'send_draft' } | { kind: 'undo', turn: number }. Gated by PEN_WEB_AGENT=1 and, while it is
// being tried, PEN_WEB_AGENT_USERS (comma-separated emails; empty = everyone). Off → today's askArchive.

export type AgentChannel = 'whatsapp' | 'imessage' | 'web'

/** A pending yes/no the user must answer (a send, an invite, a permanent delete). */
export type AgentAsk = { kind: string; summary: string }

/** An email draft waiting for "send it" (web: the Send button). */
export type AgentDraft = {
  from: string | null
  to: string[]
  cc?: string[]
  subject: string
  body: string
  /** Provider web-compose link (Gmail / Outlook) and the mailto fallback. */
  composeUrl?: string | null
  mailtoUrl?: string | null
}

/** Something the turn made or opened, shown as a card / button on the web. */
export type AgentLink = {
  kind: 'doc' | 'sheet' | 'notion' | 'event' | 'connect' | 'recording' | 'other'
  title: string
  url: string
}

/** The structured half of a reply (the text half is AgentResult.text). Stored on the web turn. */
export type AgentParts = {
  ask?: AgentAsk | null
  draft?: AgentDraft | null
  links?: AgentLink[]
  /** This turn can be undone (web: an Undo button on it). */
  undoable?: boolean
}

/** pen_chats.agent_state: the web thread's pending confirm, draft and undo records. */
export type WebAgentState = {
  pending?: unknown
  draft?: unknown
  /** Undo info per assistant turn (keyed by the turn's ts). */
  undo?: Record<string, unknown>
}

export type WebAction = { kind: 'confirm'; yes: boolean } | { kind: 'send_draft' } | { kind: 'undo'; turn: number }
