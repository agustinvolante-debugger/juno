// Who is on the other end of a WhatsApp number, and what they have sent.
//
// pen_whatsapp_links     one row per account: the linked phone, a pending link code, and the
//                        WhatsApp chat history (kept apart from the web chat, which has threads
//                        and @-tags the phone doesn't).
// pen_whatsapp_messages  one row per inbound message, keyed by Vonage's message_uuid. The
//                        primary key is the dedupe: Vonage retries a webhook it thinks failed,
//                        and a retried audio file must not be transcribed (and billed) twice.
//                        A file waiting for its consent tap sits here with state 'consent'.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import type { ArchiveTurn } from '../store'

export type Link = {
  email: string
  phone: string | null
  code: string | null
  code_expires_at: string | null
  linked_at: string | null
  chat: ArchiveTurn[]
}

/** A code lives long enough to switch to the phone and back, not long enough to leak. */
const CODE_TTL_MS = 30 * 60 * 1000

export async function getLinkByEmail(email: string): Promise<Link | null> {
  const { data, error } = await supabaseAdmin.from('pen_whatsapp_links').select('*').eq('email', email.toLowerCase()).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Link) ?? null
}

export async function getLinkByPhone(phone: string): Promise<Link | null> {
  const { data, error } = await supabaseAdmin.from('pen_whatsapp_links').select('*').eq('phone', phone).not('linked_at', 'is', null).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Link) ?? null
}

/** A fresh six-digit code for the Settings page. Replaces any earlier one. */
export async function newCode(email: string): Promise<{ code: string; expiresAt: string }> {
  const code = String(crypto.randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()
  const { error } = await supabaseAdmin
    .from('pen_whatsapp_links')
    .upsert({ email: email.toLowerCase(), code, code_expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: 'email' })
  if (error) throw new Error(error.message)
  return { code, expiresAt }
}

/**
 * Claims a code from a phone. The message arriving from that number is the proof of owning
 * it, so no SMS round-trip is needed. A phone linked to another account moves to this one:
 * whoever holds the phone and a signed-in code is the person it belongs to now.
 */
export async function claimCode(code: string, phone: string): Promise<Link | null> {
  const { data } = await supabaseAdmin
    .from('pen_whatsapp_links')
    .select('*')
    .eq('code', code)
    .gt('code_expires_at', new Date().toISOString())
    .maybeSingle()
  if (!data) return null
  const now = new Date().toISOString()
  await supabaseAdmin.from('pen_whatsapp_links').update({ phone: null, linked_at: null, updated_at: now }).eq('phone', phone).neq('email', data.email)
  const { data: linked, error } = await supabaseAdmin
    .from('pen_whatsapp_links')
    .update({ phone, linked_at: now, code: null, code_expires_at: null, updated_at: now })
    .eq('email', data.email)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return linked as Link
}

export async function unlink(email: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('pen_whatsapp_links')
    .update({ phone: null, linked_at: null, code: null, code_expires_at: null, chat: [], updated_at: new Date().toISOString() })
    .eq('email', email.toLowerCase())
  if (error) throw new Error(error.message)
}

export async function setChat(email: string, chat: ArchiveTurn[]): Promise<void> {
  await supabaseAdmin
    .from('pen_whatsapp_links')
    .update({ chat: chat.slice(-20), updated_at: new Date().toISOString() })
    .eq('email', email.toLowerCase())
}

/* --------------------------------------------------------------- messages */

export type MessageState = 'received' | 'consent' | 'accepted' | 'cancelled' | 'done' | 'failed'

export type MessageRow = {
  id: string
  phone: string
  email: string | null
  kind: string
  state: MessageState
  payload: { mediaUrl?: string | null; fileName?: string | null; raw?: unknown }
  session_id: string | null
  created_at: string
}

/** Records an inbound message. False means it was seen before: a Vonage retry, do nothing. */
export async function recordInbound(row: { id: string; phone: string; email: string | null; kind: string; state: MessageState; payload: MessageRow['payload'] }): Promise<boolean> {
  const { error } = await supabaseAdmin.from('pen_whatsapp_messages').insert(row)
  if (!error) return true
  if (error.code === '23505') return false
  throw new Error(error.message)
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('*').eq('id', id).maybeSingle()
  return (data as MessageRow) ?? null
}

/** Compare-and-set, so a double tap on "Everyone agreed" starts one transcription, not two. */
export async function moveMessage(id: string, from: MessageState, to: MessageState, patch: Record<string, unknown> = {}): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('pen_whatsapp_messages').update({ state: to, ...patch }).eq('id', id).eq('state', from).select('id')
  if (error) throw new Error(error.message)
  return Boolean(data?.length)
}
