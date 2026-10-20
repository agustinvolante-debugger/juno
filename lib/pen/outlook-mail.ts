// Reading Outlook / Microsoft 365 mail for the chat (21 Oct, team-only test, the Outlook twin of
// lib/pen/mail-thread.ts): the pure half, for tests (.pentest/outlookread-unit.mts). No database, no
// network. lib/pen/outlook-read.ts makes the Graph calls.
//
//   · Search: Microsoft Graph /me/messages. Anything with a person, subject or words → $search (KQL,
//     built in code from the tool's fields: no quotes, parentheses or operators smuggled in; Graph
//     returns $search results newest first). Only dates / unread → $filter on receivedDateTime with
//     $orderby receivedDateTime desc (Graph wants the ordered property first in the filter). Never
//     the whole mailbox: with nothing asked, the inbox's last 2 days. Exact time bounds and "unread"
//     are applied to the results here (KQL dates are whole days; $search can't say unread).
//   · Messages come back one by one; grouped by conversationId they are threads, like Gmail's.
//   · A conversation read: plain text bodies (Prefer outlook.body-content-type="text"), drafts left
//     out, quoted history and signatures cut with the same cleanBody as Gmail.
//   · Reply in thread: POST /me/messages/{id}/reply on the message being answered, with the body
//     and the recipient the user saw in the draft. Microsoft keeps it in the same conversation and
//     in Sent Items. (createReply + PATCH + send would need Mail.ReadWrite; reply needs only Mail.Send.)
//
// Everything that comes out of an inbox is UNTRUSTED (mail-thread.ts untrusted).

import { cleanBody, htmlToText, replyHeaders, replyTarget, type MailHit, type SearchAsk, type ThreadMsg } from './mail-thread'
import { graphTime } from './outlook-graph'
import type { Invite } from './invite-parse'

type DT = { dateTime?: string; timeZone?: string }
export type GraphRecipient = { emailAddress?: { name?: string | null; address?: string | null } | null }
export type GraphMessage = {
  id: string
  conversationId?: string | null
  subject?: string | null
  from?: GraphRecipient | null
  toRecipients?: GraphRecipient[] | null
  ccRecipients?: GraphRecipient[] | null
  replyTo?: GraphRecipient[] | null
  receivedDateTime?: string | null
  bodyPreview?: string | null
  body?: { contentType?: string | null; content?: string | null } | null
  isRead?: boolean | null
  isDraft?: boolean | null
  parentFolderId?: string | null
  /** eventMessage (meeting request / cancellation) */
  '@odata.type'?: string
  meetingMessageType?: string | null
  startDateTime?: DT | null
  endDateTime?: DT | null
  isAllDay?: boolean | null
}

export const MSG_SELECT = 'id,conversationId,subject,from,toRecipients,ccRecipients,replyTo,receivedDateTime,bodyPreview,isRead,isDraft,parentFolderId'
/** Messages fetched per search: grouped into ≤ 10 conversations after the exact filters. */
export const OUTLOOK_FETCH = 25
const DAY = 86_400_000

/** "Carlos Ruiz <carlos@x.com>", or the address alone. */
export function fmtRecipient(r: GraphRecipient | null | undefined): string {
  const name = (r?.emailAddress?.name ?? '').replace(/[\r\n<>"]/g, ' ').trim()
  const addr = (r?.emailAddress?.address ?? '').trim().toLowerCase()
  if (!addr) return name
  return name && name.toLowerCase() !== addr ? `${name} <${addr}>` : addr
}

/* --------------------------------------------------------------- query */

/** The words of a value, safe for KQL: letters, digits and the characters of an address only. */
function words(v: string | undefined, max = 6): string[] {
  return (v ?? '')
    .replace(/[^\p{L}\p{N}@._+'-]+/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter((w) => w && !/^(or|and|not|near)$/i.test(w))
    .slice(0, max)
    .map((w) => w.slice(0, 60))
}

/** op:value; several words → (op:a AND op:b). '' when nothing survives. */
function prop(op: string, v: string | undefined): string {
  const w = words(v)
  if (!w.length) return ''
  return w.length === 1 ? `${op}:${w[0]}` : `(${w.map((x) => `${op}:${x}`).join(' AND ')})`
}

/** (from:a OR from:b …): at most 12 values, deduplicated without case. */
function anyOf(op: string, values: string[] | undefined): string {
  const seen = new Set<string>()
  const parts = (values ?? [])
    .filter((v) => {
      const k = v.trim().toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 12)
    .map((v) => prop(op, v))
    .filter(Boolean)
  return parts.length ? (parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`) : ''
}

/** Meeting requests (Exchange's own kind), an .ics, or an invitation subject (EN/ES/PT). Built in code. */
export const OUTLOOK_INVITE_KQL = '(kind:meetings OR attachment:ics OR subject:invitation OR subject:invite OR subject:invitación OR subject:convite)'

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The KQL for a search with a person, subject, words or invitations in it; '' when it has none of those. */
export function outlookKql(a: SearchAsk, nowMs = Date.now()): string {
  const parts = [
    prop('from', a.from),
    prop('to', a.to),
    anyOf('from', a.fromAny),
    anyOf('to', a.toAny),
    // participants = from, to, cc or bcc: "emails with Chris", either way.
    anyOf('participants', a.personAny),
    a.invites ? OUTLOOK_INVITE_KQL : '',
    prop('subject', a.subject),
    a.attachment ? 'hasattachment:true' : '',
    ...words(a.words, 8),
  ].filter(Boolean)
  if (!parts.length) return ''
  // Whole days in KQL (the exact bounds are applied to the results): never narrower than asked.
  if (a.afterEpoch && Number.isFinite(a.afterEpoch)) parts.push(`received>=${ymd(a.afterEpoch * 1000)}`)
  else if (a.newerThanDays && a.newerThanDays > 0) parts.push(`received>=${ymd(nowMs - Math.min(365, Math.ceil(a.newerThanDays)) * DAY)}`)
  if (a.beforeEpoch && Number.isFinite(a.beforeEpoch)) parts.push(`received<=${ymd(a.beforeEpoch * 1000)}`)
  return parts.join(' AND ')
}

export type OutlookQuery = { path: string; mode: 'search' | 'filter'; afterMs?: number; beforeMs?: number; unread: boolean }

/** The Graph request for a search (path relative to graph.microsoft.com/v1.0) and the exact filters to apply after. */
export function outlookQuery(a: SearchAsk, nowMs = Date.now(), top = OUTLOOK_FETCH): OutlookQuery {
  const after = a.afterEpoch && Number.isFinite(a.afterEpoch) ? a.afterEpoch * 1000 : a.newerThanDays && a.newerThanDays > 0 ? nowMs - Math.min(365, Math.ceil(a.newerThanDays)) * DAY : undefined
  const before = a.beforeEpoch && Number.isFinite(a.beforeEpoch) ? a.beforeEpoch * 1000 : undefined
  const unread = Boolean(a.unread)
  const kql = outlookKql(a, nowMs)
  const folder = a.inbox ? 'me/mailFolders/inbox/messages' : 'me/messages'
  if (kql) {
    return { path: `${folder}?$search=${encodeURIComponent(`"${kql}"`)}&$top=${top}&$select=${MSG_SELECT}`, mode: 'search', afterMs: after, beforeMs: before, unread }
  }
  // Dates / unread only. Never the whole mailbox: nothing asked = the inbox's last 2 days; unread with no date = the last 30 days.
  const nothing = !after && !before && !unread
  const floor = after ?? (before ? before - 30 * DAY : nowMs - (unread ? 30 : 2) * DAY)
  const filter = [`receivedDateTime ge ${new Date(floor).toISOString()}`, ...(before ? [`receivedDateTime lt ${new Date(before).toISOString()}`] : []), ...(unread ? ['isRead eq false'] : [])].join(' and ')
  const base = nothing ? 'me/mailFolders/inbox/messages' : folder
  return {
    path: `${base}?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('receivedDateTime desc')}&$top=${top}&$select=${MSG_SELECT}`,
    mode: 'filter',
    afterMs: floor,
    beforeMs: before,
    unread,
  }
}

/* -------------------------------------------------------------- threads */

const atOf = (m: GraphMessage) => Date.parse(m.receivedDateTime ?? '') || 0

/**
 * Messages → threads (one per conversationId, newest first, ≤ max), after the exact filters: time
 * bounds, unread, no drafts, nothing in `skipFolders` (Deleted Items, Junk).
 */
export function hitsFromMessages(msgs: GraphMessage[], account: string, q: Pick<OutlookQuery, 'afterMs' | 'beforeMs' | 'unread'>, skipFolders: Set<string> = new Set(), max = 10): MailHit[] {
  const groups = new Map<string, GraphMessage[]>()
  for (const m of msgs) {
    if (m.isDraft) continue
    if (m.parentFolderId && skipFolders.has(m.parentFolderId)) continue
    const at = atOf(m)
    if (q.afterMs && at < q.afterMs) continue
    if (q.beforeMs && at >= q.beforeMs) continue
    if (q.unread && m.isRead !== false) continue
    const k = m.conversationId || m.id
    groups.set(k, [...(groups.get(k) ?? []), m])
  }
  const hits: MailHit[] = []
  for (const [k, g] of groups) {
    const last = g.reduce((a, b) => (atOf(b) > atOf(a) ? b : a))
    hits.push({
      thread_id: k,
      account,
      from: fmtRecipient(last.from),
      to: (last.toRecipients ?? []).map(fmtRecipient).filter(Boolean).join(', '),
      subject: (last.subject ?? '').trim(),
      at: atOf(last),
      snippet: (last.bodyPreview ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
      messages: g.length,
      unread: g.some((m) => m.isRead === false),
    })
  }
  return hits.sort((a, b) => b.at - a.at).slice(0, max)
}

/** Graph conversation ids (and message ids): base64-ish. Anything else is refused before a call. */
export const isGraphId = (id: string) => /^[A-Za-z0-9+/=_-]{8,512}$/.test(id)

/** One conversation's messages (sorted here: Graph refuses $orderby with this filter). */
export function conversationPath(conversationId: string, withBody = true): string {
  if (!isGraphId(conversationId)) throw new Error('bad conversation id')
  return `me/messages?$filter=${encodeURIComponent(`conversationId eq '${conversationId}'`)}&$top=50&$select=${MSG_SELECT}${withBody ? ',body' : ''}`
}

export type ReadMsg = { from: string; to: string; at: number; text: string }

/** A conversation as plain text, oldest first: drafts out, each message cleaned and capped, newest kept first when over budget. */
export function cleanConversation(msgs: GraphMessage[], budget = 6000): { subject: string; messages: ReadMsg[]; cut: boolean } {
  const list = msgs.filter((m) => !m.isDraft).sort((a, b) => atOf(a) - atOf(b))
  const out: ReadMsg[] = []
  let left = budget
  for (let i = list.length - 1; i >= 0 && left > 200; i--) {
    const m = list[i]
    const raw = m.body?.content ? (/html/i.test(m.body.contentType ?? '') ? htmlToText(m.body.content) : m.body.content) : m.bodyPreview ?? ''
    const text = cleanBody(raw, Math.min(1500, left))
    left -= text.length
    out.unshift({ from: fmtRecipient(m.from), to: (m.toRecipients ?? []).map(fmtRecipient).filter(Boolean).join(', '), at: atOf(m), text })
  }
  return { subject: (list[0]?.subject ?? '').trim(), messages: out, cut: out.length < list.length }
}

/* ---------------------------------------------------------------- reply */

export type OutlookReplyPlan = { messageId: string; name: string | null; address: string; subject: string }

/**
 * Who a reply in this conversation goes to and which message it answers: the newest message not
 * from one of the user's own addresses (its Reply-To, else its From), as for Gmail (replyTarget).
 * If every message is the user's own, the newest one, to its first recipient.
 */
export function outlookReplyPlan(msgs: GraphMessage[], mine: string[]): OutlookReplyPlan | null {
  const list = msgs.filter((m) => !m.isDraft).sort((a, b) => atOf(a) - atOf(b))
  const tm: ThreadMsg[] = list.map((m) => ({ from: fmtRecipient(m.from), to: (m.toRecipients ?? []).map(fmtRecipient).join(', '), replyTo: fmtRecipient(m.replyTo?.[0]), subject: m.subject ?? '', messageId: '', references: '' }))
  const t = replyTarget(tm, mine)
  if (!t) return null
  const i = tm.indexOf(t.to)
  if (i < 0 || !isGraphId(list[i].id)) return null
  return { messageId: list[i].id, name: t.name, address: t.address, subject: replyHeaders({ subject: list[i].subject ?? '', messageId: '', references: '' }).subject }
}

export const replyPath = (messageId: string) => {
  if (!isGraphId(messageId)) throw new Error('bad message id')
  return `me/messages/${encodeURIComponent(messageId)}/reply`
}

/** The body of POST /me/messages/{id}/reply: exactly what the user saw (plain text), to the person shown. */
export function replyPayload(body: string, to: { address: string; name?: string | null }): Record<string, unknown> {
  const address = to.address.trim()
  if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(address)) throw new Error('bad recipient address')
  const name = (to.name ?? '').replace(/[\r\n<>"]/g, ' ').trim()
  return {
    message: {
      toRecipients: [{ emailAddress: { address, ...(name && name.toLowerCase() !== address.toLowerCase() ? { name } : {}) } }],
      body: { contentType: 'Text', content: body },
    },
  }
}

/* ---------------------------------------------------------- invitations */

/** A meeting request in an Outlook inbox (Graph eventMessage): its time and people, structured. Null when not one. */
export function inviteFromEventMessage(m: GraphMessage): Invite | null {
  if (!/eventMessage/i.test(m['@odata.type'] ?? '') || !m.startDateTime?.dateTime) return null
  const start = graphTime(m.startDateTime)
  if (!start) return null
  const tz = (m.startDateTime.timeZone ?? '').trim()
  const person = (r: GraphRecipient) => ({ email: (r.emailAddress?.address ?? '').toLowerCase(), name: r.emailAddress?.name?.trim() || null })
  const cancelled = /cancel/i.test(m.meetingMessageType ?? '')
  return {
    title: (m.subject ?? '').replace(/^(canceled|cancelled|cancelado|invitation|invitación|convite)\s*:\s*/i, '').trim() || '(no title)',
    start,
    end: m.endDateTime?.dateTime ? graphTime(m.endDateTime) || null : null,
    allDay: Boolean(m.isAllDay),
    zone: tz && tz.includes('/') ? tz : null,
    organizer: m.from?.emailAddress?.address ? person(m.from) : null,
    attendees: [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].filter((r) => r.emailAddress?.address).map(person),
    uid: null,
    method: cancelled ? 'CANCEL' : 'REQUEST',
    cancelled,
    from: 'ics',
  }
}
