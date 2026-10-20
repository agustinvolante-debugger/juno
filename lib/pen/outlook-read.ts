// Reading the user's Outlook / Microsoft 365 inbox for the chat (21 Oct 2026, team-only test: the
// same switch and team list as Gmail reading, lib/pen/outlook.ts outlookReadAllowed). Mail.Read:
// search, open a conversation. The one write is replying in a conversation, with Mail.Send, only
// after the user said "send it" to the draft they saw (whatsapp/agent.ts sendDraft).
//
// What is kept: nothing. Results go to the model for this turn only and are not written to our
// database; the chat history keeps Juno's own reply and a line with the conversation ids it looked at
// (whatsapp/agent.ts), so "reply to that" works next message. A reply draft lives in
// pen_whatsapp_links.draft like any draft, ≤ 24 h.
//
// Graph: /me/messages ($search or $filter: outlook-mail.ts outlookQuery), the conversation by
// conversationId (text bodies), POST /me/messages/{id}/reply. Deleted Items and Junk are skipped.

import { supabaseAdmin } from '@/lib/supabase'
import { RECONNECT, graph, listOutlookAccounts, type GraphError, type OutlookAccount } from './outlook'
import { DAILY_SEND_CAP, sentToday } from './follow-up'
import { ReadError } from './gmail-read'
import { parseInviteText, type Invite } from './invite-parse'
import { htmlToText, type MailHit, type SearchAsk } from './mail-thread'
import {
  cleanConversation, conversationPath, hitsFromMessages, inviteFromEventMessage, isGraphId, outlookQuery, outlookReplyPlan, replyPath, replyPayload, fmtRecipient,
  type GraphMessage, type OutlookReplyPlan, type ReadMsg,
} from './outlook-mail'

const TEXT = 'outlook.body-content-type="text"'

/** The Microsoft addresses this user can read (allowlist checked by the caller: outlookReadAllowed). */
export async function readableOutlook(userEmail: string): Promise<OutlookAccount[]> {
  return (await listOutlookAccounts(userEmail)).filter((a) => a.can_read && !a.last_error)
}

function asRead(e: unknown): ReadError {
  if (e instanceof ReadError) return e
  const err = e as GraphError & { revoked?: boolean }
  if (err.revoked || err.status === 401 || err.status === 403) return new ReadError('no_access', err.message)
  if (err.status === 404 || /ErrorItemNotFound|ResourceNotFound/i.test(err.code ?? '')) return new ReadError('not_found', 'no such conversation')
  return new ReadError('failed', err.message ?? 'Microsoft Graph error')
}

async function call<T>(userEmail: string, address: string, path: string, init: { method?: string; body?: unknown; prefer?: string[] } = {}): Promise<T> {
  try {
    return await graph<T>(userEmail, address, path, init)
  } catch (e) {
    throw asRead(e)
  }
}

/* ---------------------------------------------------------------- folders */

const skipCache = new Map<string, { ids: Set<string>; at: number }>()

/** Deleted Items and Junk Email of this mailbox (their ids), cached an hour. Best effort. */
async function skipFolders(userEmail: string, address: string): Promise<Set<string>> {
  const k = `${userEmail.toLowerCase()}|${address}`
  const hit = skipCache.get(k)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.ids
  const ids = new Set<string>()
  for (const f of ['deleteditems', 'junkemail']) {
    const r = await graph<{ id?: string }>(userEmail, address, `me/mailFolders/${f}?$select=id`).catch(() => null)
    if (r?.id) ids.add(r.id)
  }
  skipCache.set(k, { ids, at: Date.now() })
  return ids
}

/* ---------------------------------------------------------------- search */

/** Conversations matching a search, newest first, across the given Microsoft addresses (≤ max in all). */
export async function searchOutlook(userEmail: string, accounts: string[], ask: SearchAsk, max = 10): Promise<MailHit[]> {
  const q = outlookQuery(ask)
  const all: MailHit[] = []
  for (const address of accounts) {
    const [r, skip] = await Promise.all([call<{ value?: GraphMessage[] }>(userEmail, address, q.path), skipFolders(userEmail, address)])
    all.push(...hitsFromMessages(r?.value ?? [], address, q, skip, max))
  }
  return all.sort((a, b) => b.at - a.at).slice(0, max)
}

/* ------------------------------------------------------------------ read */

async function conversation(userEmail: string, address: string, id: string, withBody: boolean): Promise<GraphMessage[]> {
  if (!isGraphId(id)) throw new ReadError('not_found', 'bad conversation id')
  const r = await call<{ value?: GraphMessage[] }>(userEmail, address, conversationPath(id, withBody), withBody ? { prefer: [TEXT] } : {})
  const msgs = r?.value ?? []
  if (!msgs.length) throw new ReadError('not_found', 'no such conversation')
  return msgs
}

/** One conversation, oldest first, each message cleaned (no quoted history, no signature) and capped. */
export async function readConversation(userEmail: string, address: string, conversationId: string): Promise<{ subject: string; messages: ReadMsg[]; cut: boolean }> {
  return cleanConversation(await conversation(userEmail, address, conversationId, true))
}

/** Who a reply in this conversation goes to, and the message it answers. */
export async function replyPlan(userEmail: string, address: string, conversationId: string, mine: string[]): Promise<OutlookReplyPlan | null> {
  return outlookReplyPlan(await conversation(userEmail, address, conversationId, false), mine)
}

/* ----------------------------------------------------------------- reply */

export type OutlookReply = { ok: true } | { ok: false; reason: 'cap' | 'not_connected' | 'revoked' | 'failed'; error: string }

/**
 * Sends the reply the user approved, in its conversation (POST /me/messages/{id}/reply: Microsoft
 * threads it and keeps it in Sent Items). Same daily cap and log as every send (who, when; never
 * subject or body), and the From remembered for that person.
 */
export async function replyViaOutlook(o: { userEmail: string; from: string; messageId: string; to: string; toName?: string | null; body: string; sessionId: string | null }): Promise<OutlookReply> {
  const lower = o.userEmail.toLowerCase()
  if ((await sentToday(lower)) >= DAILY_SEND_CAP) return { ok: false, reason: 'cap', error: `daily limit of ${DAILY_SEND_CAP} emails reached` }
  const acc = (await listOutlookAccounts(lower).catch(() => [])).find((a) => a.address === o.from.toLowerCase())
  if (!acc || !acc.can_send) return { ok: false, reason: 'not_connected', error: `${o.from} is not connected for sending` }
  let path: string
  let payload: Record<string, unknown>
  try {
    path = replyPath(o.messageId)
    payload = replyPayload(o.body, { address: o.to, name: o.toName })
  } catch (e) {
    return { ok: false, reason: 'failed', error: (e as Error).message }
  }
  try {
    await graph(lower, acc.address, path, { method: 'POST', body: payload })
  } catch (e) {
    const err = e as GraphError & { revoked?: boolean }
    const revoked = Boolean(err.revoked) || err.status === 401 || (err.status === 403 && /accessdenied|insufficient|authorization/i.test(`${err.code ?? ''} ${err.message}`))
    if (revoked) await supabaseAdmin.from('pen_outlook').update({ last_error: RECONNECT }).eq('user_email', lower).eq('address', acc.address).then(() => {}, () => {})
    console.warn(`pen outlook: reply failed (${err.status ?? '?'} ${err.code ?? ''})`)
    return { ok: false, reason: revoked ? 'revoked' : 'failed', error: err.status === 404 ? 'that email is no longer in the mailbox' : err.message }
  }
  await supabaseAdmin.from('pen_sent_emails').insert({ user_email: lower, to_email: o.to, session_id: o.sessionId, channel: 'outlook', ok: true, error: null }).then(() => {}, () => {})
  await supabaseAdmin.from('pen_outlook').update({ last_used_at: new Date().toISOString(), last_error: null }).eq('user_email', lower).eq('address', acc.address).then(() => {}, () => {})
  await supabaseAdmin
    .from('pen_mail_from')
    .upsert({ user_email: lower, to_email: o.to.toLowerCase(), from_address: acc.address, updated_at: new Date().toISOString() }, { onConflict: 'user_email,to_email' })
    .then(() => {}, () => {})
  return { ok: true }
}

/* ------------------------------------------------------------ invitations */

export type FoundOutlookInvite = Invite & { account: string; thread_id: string; sender: string; to: string; subject: string; received: number }

/**
 * The meetings in a conversation's invitation emails, newest first: a meeting request's own time
 * (Graph eventMessage), else the subject and text read as an invitation. Read-only, never stored.
 */
export async function conversationInvites(userEmail: string, address: string, conversationId: string, o: { fallbackTz?: string | null; now?: Date } = {}): Promise<FoundOutlookInvite[]> {
  const msgs = (await conversation(userEmail, address, conversationId, true)).filter((m) => !m.isDraft)
  const out: FoundOutlookInvite[] = []
  for (const m of msgs.sort((a, b) => (Date.parse(b.receivedDateTime ?? '') || 0) - (Date.parse(a.receivedDateTime ?? '') || 0))) {
    let inv: Invite | null = null
    if (/eventMessage/i.test(m['@odata.type'] ?? '')) {
      // The list call returns base message fields only; the meeting's own time needs the item itself.
      const full = await call<GraphMessage>(userEmail, address, `me/messages/${encodeURIComponent(m.id)}`).catch(() => null)
      inv = full ? inviteFromEventMessage(full) : null
    }
    const text = m.body?.content ? (/html/i.test(m.body.contentType ?? '') ? htmlToText(m.body.content) : m.body.content) : m.bodyPreview ?? ''
    inv ??= parseInviteText(m.subject ?? '', text.slice(0, 20_000), { now: o.now, fallbackTz: o.fallbackTz })
    if (inv) {
      out.push({ ...inv, account: address, thread_id: conversationId, sender: fmtRecipient(m.from), to: (m.toRecipients ?? []).map(fmtRecipient).join(', '), subject: m.subject ?? '', received: Date.parse(m.receivedDateTime ?? '') || 0 })
    }
  }
  return out
}
