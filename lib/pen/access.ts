// What a cancelled account can still do, and how long it has left (agreed 2 Oct).
//
//   · Cancelling never cuts anyone off early. The subscription runs to the end of the period
//     they already paid for (or the trial), and only then does the account turn read-only.
//   · Read-only means they can open every recording, note and transcript they made, and
//     nothing that costs us money runs: no uploads, no pen, no WhatsApp, no AI chat or search,
//     no briefings, no re-written notes, no translations.
//   · A read-only account is kept for KEEP_DAYS after it ended, then deleted.
//   · The break-glass list in lib/auth.ts is never read-only, whatever Stripe says.
//
// The countdown is one number with three meanings: days left in a trial, days of full
// access left after cancelling, and days until a read-only account is deleted.

import { ALLOWED_EMAILS } from '@/lib/auth'
import { getAccount, isTrialing, type PenAccount } from './accounts'

export const KEEP_DAYS = 365
const DAY = 86_400_000

/** When a cancelled account stopped being active. Rows from before ended_at use their last update. */
function endedAt(a: PenAccount): string {
  return a.ended_at ?? a.updated_at
}

export function isReadOnly(a: PenAccount | null, email: string, now = new Date()): boolean {
  if (ALLOWED_EMAILS.includes(email.toLowerCase())) return false
  if (!a) return false
  if (a.status === 'cancelled') return true
  // The end date passed and the webhook that closes the account hasn't landed yet.
  return a.status === 'active' && !!a.cancel_at && new Date(a.cancel_at) <= now
}

/** Who may sign in: an active account, or a cancelled one that hasn't been deleted yet. */
export function maySignIn(a: PenAccount | null, now = new Date()): boolean {
  if (!a) return false
  if (a.status === 'active') return true
  return a.status === 'cancelled' && deletesAt(a).getTime() > now.getTime()
}

/** maySignIn for an email, for the two sign-in doors (lib/auth.ts, lib/auth-link.ts). */
export async function mayEnterAccount(email: string): Promise<boolean> {
  return maySignIn(await getAccount(email))
}

export function deletesAt(a: PenAccount): Date {
  return new Date(new Date(endedAt(a)).getTime() + KEEP_DAYS * DAY)
}

export type Clock = {
  /** trial: free days left · ending: cancelled, full access until `until` · readonly: deleted at `until` */
  state: 'trial' | 'ending' | 'readonly'
  until: string
  days: number
}

const daysUntil = (iso: string | Date, now: Date) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY))

/** The countdown, or null for a running paid plan (nothing is ending). */
export function clockFor(a: PenAccount | null, email: string, now = new Date()): Clock | null {
  if (!a || ALLOWED_EMAILS.includes(email.toLowerCase())) return null
  if (isReadOnly(a, email, now)) {
    const until = a.status === 'cancelled' ? deletesAt(a) : new Date(new Date(a.cancel_at!).getTime() + KEEP_DAYS * DAY)
    return { state: 'readonly', until: until.toISOString(), days: daysUntil(until, now) }
  }
  if (a.status !== 'active') return null
  if (a.cancel_at) return { state: 'ending', until: a.cancel_at, days: daysUntil(a.cancel_at, now) }
  if (isTrialing(a)) return { state: 'trial', until: a.trial_ends_at!, days: daysUntil(a.trial_ends_at!, now) }
  return null
}

/** The last day of full access: the day before the next payment would have been taken. */
export function lastFullDay(until: string): Date {
  return new Date(new Date(until).getTime() - DAY)
}

const REFUSAL = {
  en: 'Your plan has ended, so your account is read-only. Reactivate it in Settings → Billing to use this again.',
  es: 'Tu plan terminó, así que tu cuenta es solo de lectura. Reactívala en Ajustes → Facturación para volver a usar esto.',
  pt: 'Seu plano terminou, então sua conta é somente leitura. Reative em Configurações → Cobrança para usar isso de novo.',
} as const

/** The refusal for anything that adds a recording or calls an AI model, or null. For API routes. */
export async function readOnlyRefusal(email: string): Promise<string | null> {
  const a = await getAccount(email).catch(() => null)
  if (!isReadOnly(a, email)) return null
  const { userLang } = await import('./user-lang')
  return REFUSAL[await userLang(email)]
}
