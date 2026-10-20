// Reading the user's Gmail for the chat (19 Oct 2026, team-only test; lib/pen/gmail.ts says who).
// gmail.readonly: search, open a thread. Nothing here can change, label, archive or delete mail.
//
// What is kept: nothing. Results go to the model for this turn only and are not written to our
// database; the chat history keeps Juno's own reply (its summary) and a line with the thread ids
// it looked at (whatsapp/agent.ts), so "reply to that" works in the next message. A reply draft
// (subject "Re: …", the user's words) lives in pen_whatsapp_links.draft like any draft, ≤ 24 h.
//
// Gmail API: users.threads.list (q = lib/pen/mail-thread.ts buildQuery), users.threads.get
// (format=metadata for lists and replies, format=full to read).

import { accessToken, listAccounts, type GmailAccount } from './gmail'
import { cleanBody, extractText, header, type GmailPart, type ThreadMsg } from './mail-thread'
import { parseIcs, parseInviteText, type Invite } from './invite-parse'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
export const MAX_THREADS = 10
const MAX_THREAD_CHARS = 6000
const META = ['From', 'To', 'Reply-To', 'Subject', 'Date', 'Message-ID', 'References']

type ApiMsg = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart }
type ApiThread = { id: string; messages?: ApiMsg[] }

export class ReadError extends Error {
  constructor(public reason: 'not_allowed' | 'no_access' | 'not_found' | 'failed', message: string) {
    super(message)
  }
}

/** The addresses this user can read (allowlist checked by the caller: gmailReadAllowed). */
export async function readableAccounts(userEmail: string): Promise<GmailAccount[]> {
  return (await listAccounts(userEmail)).filter((a) => a.can_read && !a.last_error)
}

async function api<T>(userEmail: string, address: string, path: string): Promise<T> {
  const token = await accessToken(userEmail, address).catch((e) => {
    throw new ReadError('no_access', (e as Error).message)
  })
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (res.status === 404) throw new ReadError('not_found', 'no such thread')
  if (res.status === 401 || res.status === 403) throw new ReadError('no_access', j.error?.message ?? `Gmail refused (${res.status})`)
  if (!res.ok) throw new ReadError('failed', j.error?.message ?? `Gmail error ${res.status}`)
  return j
}

const metaQs = () => `format=metadata&${META.map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join('&')}`

/** `at`: when the newest message arrived (ms), for the caller to say in the user's zone. */
export type ThreadHit = { thread_id: string; account: string; from: string; to: string; subject: string; at: number; snippet: string; messages: number; unread: boolean }

/** Threads matching a Gmail query, newest first, across the given addresses (≤ MAX_THREADS in all). */
export async function searchThreads(userEmail: string, accounts: string[], q: string, max = MAX_THREADS): Promise<ThreadHit[]> {
  const hits: ThreadHit[] = []
  for (const address of accounts) {
    const list = await api<{ threads?: { id: string; snippet?: string }[] }>(userEmail, address, `/threads?maxResults=${max}&q=${encodeURIComponent(q)}`)
    const threads = await Promise.all((list.threads ?? []).slice(0, max).map((t) => api<ApiThread>(userEmail, address, `/threads/${encodeURIComponent(t.id)}?${metaQs()}`)))
    for (const t of threads) {
      const msgs = t.messages ?? []
      const last = msgs[msgs.length - 1]
      if (!last) continue
      const h = last.payload?.headers
      hits.push({
        thread_id: t.id,
        account: address,
        from: header(h, 'From'),
        to: header(h, 'To'),
        subject: header(h, 'Subject'),
        snippet: (last.snippet ?? '').slice(0, 240),
        messages: msgs.length,
        unread: msgs.some((m) => m.labelIds?.includes('UNREAD')),
        at: Number(last.internalDate) || 0,
      })
    }
  }
  return hits.sort((a, b) => b.at - a.at).slice(0, max)
}

export type ReadMsg = { from: string; to: string; at: number; text: string }

/** One thread, oldest first, each message cleaned (no quoted history, no signature) and capped. */
export async function readThread(userEmail: string, address: string, threadId: string): Promise<{ subject: string; messages: ReadMsg[]; cut: boolean }> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(threadId)) throw new ReadError('not_found', 'bad thread id')
  const t = await api<ApiThread>(userEmail, address, `/threads/${encodeURIComponent(threadId)}?format=full`)
  const msgs = t.messages ?? []
  let budget = MAX_THREAD_CHARS
  const out: ReadMsg[] = []
  // Newest first while there is budget, then put back in order: the latest messages matter most.
  for (let i = msgs.length - 1; i >= 0 && budget > 200; i--) {
    const h = msgs[i].payload?.headers
    const text = cleanBody(extractText(msgs[i].payload) || msgs[i].snippet || '', Math.min(1500, budget))
    budget -= text.length
    out.unshift({ from: header(h, 'From'), to: header(h, 'To'), at: Number(msgs[i].internalDate) || Date.parse(header(h, 'Date')) || 0, text })
  }
  return { subject: header(msgs[0]?.payload?.headers, 'Subject'), messages: out, cut: out.length < msgs.length }
}

/** The headers a reply needs (From, Reply-To, To, Subject, Message-ID, References), per message. */
export async function threadHeaders(userEmail: string, address: string, threadId: string): Promise<ThreadMsg[]> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(threadId)) throw new ReadError('not_found', 'bad thread id')
  const t = await api<ApiThread>(userEmail, address, `/threads/${encodeURIComponent(threadId)}?${metaQs()}`)
  return (t.messages ?? []).map((m) => {
    const h = m.payload?.headers
    return { from: header(h, 'From'), to: header(h, 'To'), replyTo: header(h, 'Reply-To'), subject: header(h, 'Subject'), messageId: header(h, 'Message-ID'), references: header(h, 'References') }
  })
}

/* ------------------------------------------------------------ invitations */

export type FoundInvite = Invite & { account: string; thread_id: string; sender: string; to: string; subject: string; received: number }

const b64 = (data: string) => Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

/** Calendar parts of a message: inline text/calendar bodies, and .ics attachments (by id, fetched). */
function calendarParts(p: GmailPart | undefined, out: { data?: string; attachmentId?: string }[] = []): { data?: string; attachmentId?: string }[] {
  if (!p) return out
  const t = (p.mimeType ?? '').toLowerCase()
  const ics = t === 'text/calendar' || t === 'application/ics' || /\.ics$/i.test(p.filename ?? '')
  if (ics && (p.body?.data || p.body?.attachmentId)) out.push({ data: p.body?.data, attachmentId: p.body?.attachmentId })
  for (const c of p.parts ?? []) calendarParts(c, out)
  return out
}

/**
 * The meetings in a thread's invitation emails: each message's .ics (inline or attached), else its
 * subject and text read as an invitation (parseInviteText). Newest message first. Read-only, never stored.
 */
export async function threadInvites(userEmail: string, address: string, threadId: string, o: { fallbackTz?: string | null; now?: Date } = {}): Promise<FoundInvite[]> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(threadId)) throw new ReadError('not_found', 'bad thread id')
  const t = await api<ApiThread>(userEmail, address, `/threads/${encodeURIComponent(threadId)}?format=full`)
  const out: FoundInvite[] = []
  for (const m of [...(t.messages ?? [])].reverse()) {
    const h = m.payload?.headers
    const meta = { account: address, thread_id: threadId, sender: header(h, 'From'), to: header(h, 'To'), subject: header(h, 'Subject'), received: Number(m.internalDate) || 0 }
    let inv: Invite | null = null
    for (const part of calendarParts(m.payload).slice(0, 2)) {
      try {
        const data = part.data ?? (part.attachmentId ? (await api<{ data?: string }>(userEmail, address, `/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent(part.attachmentId)}`)).data : undefined)
        if (data) inv = parseIcs(b64(data).slice(0, 200_000), o.fallbackTz ?? null)
      } catch {
        inv = null
      }
      if (inv) break
    }
    inv ??= parseInviteText(meta.subject, extractText(m.payload).slice(0, 20_000), { now: o.now, fallbackTz: o.fallbackTz })
    if (inv) out.push({ ...inv, ...meta })
  }
  return out
}
