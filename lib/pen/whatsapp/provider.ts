// Which WhatsApp provider is live. Meta's Cloud API when its env is set (Vonage suspended the
// account on 25 Sep), Vonage otherwise. Everything outside lib/pen/whatsapp imports from here,
// never from a provider file, so switching is an env change.

import * as vonage from './vonage'
import * as meta from './meta'

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

export async function sendText(to: string, text: string): Promise<void> {
  return provider() === 'meta' ? meta.sendText(to, text, vonage.splitText) : vonage.sendText(to, text)
}

export async function sendButtons(to: string, body: string, buttons: vonage.Button[]): Promise<void> {
  return provider() === 'meta' ? meta.sendButtons(to, body, buttons) : vonage.sendButtons(to, body, buttons)
}

export async function markRead(messageId: string, typing = false): Promise<boolean> {
  return provider() === 'meta' ? meta.markRead(messageId, typing) : vonage.markRead(messageId, typing)
}

/** Media refs say where they came from: `meta:<id>` is Meta's, anything else a Vonage URL. */
export async function openMedia(ref: string): Promise<Response> {
  return ref.startsWith('meta:') ? meta.openMedia(ref) : vonage.openMedia(ref)
}
