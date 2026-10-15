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

/**
 * PEN_PROACTIVE_DRY=1 is for tests, never production (ignored there, with an error in the log).
 *
 *   in the app (Next sets NEXT_RUNTIME): only the proactive scheduler is dry (lib/pen/proactive.ts
 *     logs what it would send). The bot's replies and due reminders go out as usual.
 *   in a script (.pentest/*.mts, no NEXT_RUNTIME), or with PEN_PROACTIVE_DRY=all: nothing at all
 *     leaves the server. Every send below is logged instead, so the scheduler and the bot can be
 *     tested against the real database without texting anyone.
 */
export function proactiveDry(): boolean {
  const v = process.env.PEN_PROACTIVE_DRY
  if (v !== '1' && v !== 'all') return false
  if (process.env.VERCEL_ENV === 'production') {
    console.error('pen: PEN_PROACTIVE_DRY is set in production; ignored')
    return false
  }
  return true
}
/** Every provider send is refused (logged): a test script, or PEN_PROACTIVE_DRY=all. */
export function dryRun(): boolean {
  return proactiveDry() && (process.env.PEN_PROACTIVE_DRY === 'all' || !process.env.NEXT_RUNTIME)
}
function dry(what: string, to: string, body: string): true {
  console.log(`[pen dry-run] ${what} to …${to.replace(/\D/g, '').slice(-4)}:\n${body}\n`)
  return true
}

export async function sendText(to: string, text: string): Promise<void> {
  if (dryRun() && dry('text', to, text)) return
  if (viaImessage(to)) return imessage.sendText(to, text, vonage.splitText)
  to = plain(to)
  return provider() === 'meta' ? meta.sendText(to, text, vonage.splitText) : vonage.sendText(to, text)
}

/** iMessage has no buttons: the body goes as text and the bot accepts a typed reply instead. */
export async function sendButtons(to: string, body: string, buttons: vonage.Button[]): Promise<void> {
  if (dryRun() && dry('buttons', to, `${body}\n[${buttons.map((b) => b.title).join('] [')}]`)) return
  if (viaImessage(to)) return imessage.sendText(to, body, vonage.splitText)
  to = plain(to)
  return provider() === 'meta' ? meta.sendButtons(to, body, buttons) : vonage.sendButtons(to, body, buttons)
}

/**
 * A Meta-approved template (WhatsApp only; outside the 24-hour window). `lang` is the app
 * language; `buttons` the quick-reply payloads by position. iMessage never needs one.
 */
export async function sendTemplate(to: string, name: string, lang: 'en' | 'es' | 'pt', vars: string[], buttons: string[] = []): Promise<void> {
  if (dryRun() && dry(`template ${name}/${meta.TEMPLATE_LANG[lang]}`, to, `vars: ${JSON.stringify(vars.map(meta.templateVar))} buttons: ${JSON.stringify(buttons)}`)) return
  if (provider() !== 'meta') throw new Error('templates need the Meta Cloud API')
  return meta.sendTemplate(plain(to), name, meta.TEMPLATE_LANG[lang], vars, buttons)
}

export async function markRead(messageId: string, typing = false, from?: string): Promise<boolean> {
  if (dryRun()) return true
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
