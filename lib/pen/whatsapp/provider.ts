// Which WhatsApp provider is live. Meta's Cloud API when its env is set (Vonage suspended the
// account on 25 Sep), Vonage otherwise. Everything outside lib/pen/whatsapp imports from here,
// never from a provider file, so switching is an env change.

import * as vonage from './vonage'
import * as meta from './meta'
import * as imessage from '../imessage/sendblue'

export type { Inbound, Button } from './vonage'
export { splitText } from './vonage'

export function provider(): 'meta' | 'vonage' {
  return meta.configured() ? 'meta' : 'vonage'
}

export function configured(): boolean {
  return meta.configured() || vonage.configured()
}

export function botNumber(): string {
  return provider() === 'meta' ? meta.botNumber() : vonage.botNumber()
}

// `im:` phones are iMessage senders (lib/pen/imessage/sendblue.ts). Where Sendblue isn't set
// up (production, during the test), a reply to one falls back to WhatsApp on the same number.
function viaImessage(to: string): boolean {
  return imessage.isImessage(to) && imessage.configured()
}
const plain = (to: string) => to.replace(/\D/g, '')

export async function sendText(to: string, text: string): Promise<void> {
  if (viaImessage(to)) return imessage.sendText(to, text, vonage.splitText)
  to = plain(to)
  return provider() === 'meta' ? meta.sendText(to, text, vonage.splitText) : vonage.sendText(to, text)
}

/** iMessage has no buttons: the body goes as text and the bot accepts a typed reply instead. */
export async function sendButtons(to: string, body: string, buttons: vonage.Button[]): Promise<void> {
  if (viaImessage(to)) return imessage.sendText(to, body, vonage.splitText)
  to = plain(to)
  return provider() === 'meta' ? meta.sendButtons(to, body, buttons) : vonage.sendButtons(to, body, buttons)
}

export async function markRead(messageId: string, typing = false, from?: string): Promise<boolean> {
  if (messageId.startsWith('im-')) {
    if (from && imessage.configured()) {
      await imessage.markRead(from)
      if (typing) await imessage.typing(from)
    }
    return true
  }
  return provider() === 'meta' ? meta.markRead(messageId, typing) : vonage.markRead(messageId, typing)
}

/** Media refs say where they came from: `meta:<id>` is Meta's, anything else a Vonage URL. */
export async function openMedia(ref: string): Promise<Response> {
  return ref.startsWith('meta:') ? meta.openMedia(ref) : vonage.openMedia(ref)
}
