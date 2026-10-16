// Which calendar app someone uses, so "add to calendar" sends that one link instead of three.
//
// Said beats guessed: "I use Outlook" (agent tool set_calendar_app) is stored as 'said'. Until
// then the email domain's mail servers decide once and the guess is kept: Microsoft 365
// (*.protection.outlook.com) -> Outlook, Google Workspace / Gmail -> Google. Anything else stays
// unknown, and they get all three links.

import { promises as dns } from 'node:dns'
import { supabaseAdmin } from '@/lib/supabase'
import { cleanProfile, getProfileRaw } from './profile'
import type { CalEvent } from './calendar'
import { calendarLinks } from './calendar'

export type CalendarApp = 'apple' | 'google' | 'outlook'

/** Merge into the stored profile (same write as timezone.ts): the Profile form never sends these. */
async function saveProfileFields(email: string, fields: { calendarApp: CalendarApp; calendarAppSource: 'said' | 'guess' }): Promise<void> {
  const cur = (await getProfileRaw(email).catch(() => null)) ?? {}
  const { error } = await supabaseAdmin
    .from('pen_profiles')
    .upsert({ user_email: email.toLowerCase(), profile: cleanProfile({ ...cur, ...fields }), updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
  if (error) throw new Error(error.message)
}

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com'])
const MICROSOFT_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com'])

async function guessFromDomain(email: string): Promise<CalendarApp | null> {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return null
  if (GOOGLE_DOMAINS.has(domain)) return 'google'
  if (MICROSOFT_DOMAINS.has(domain)) return 'outlook'
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') return 'apple'
  try {
    const mx = (await dns.resolveMx(domain)).map((m) => m.exchange.toLowerCase())
    if (mx.some((h) => h.endsWith('.protection.outlook.com'))) return 'outlook'
    if (mx.some((h) => h.endsWith('google.com') || h.endsWith('googlemail.com'))) return 'google'
  } catch {}
  return null
}

export async function calendarPref(email: string): Promise<CalendarApp | null> {
  const p = (await getProfileRaw(email).catch(() => null)) ?? {}
  const app = p.calendarApp as CalendarApp | undefined
  if (app) return app
  const guess = await guessFromDomain(email)
  if (guess) await saveProfileFields(email, { calendarApp: guess, calendarAppSource: 'guess' }).catch(() => {})
  return guess
}

export async function setCalendarPref(email: string, app: CalendarApp): Promise<void> {
  await saveProfileFields(email, { calendarApp: app, calendarAppSource: 'said' })
}

/** The add-to-calendar message: their app's link first and alone, with one fallback for any
 *  other calendar (the .ics file opens in whatever calendar the device uses). */
export function linksMessage(ev: CalEvent, app: CalendarApp | null): { message: string; links: ReturnType<typeof calendarLinks> } {
  const links = calendarLinks(ev)
  const message =
    app === 'outlook' ? `Tap to add it in Outlook, then Save: ${links.outlook}  (other calendar: ${links.ics})`
      : app === 'google' ? `Tap to add it in Google Calendar, then Save: ${links.google}  (other calendar: ${links.ics})`
        : app === 'apple' ? `Tap to add it, then come back: ${links.ics}`
          : `Tap to add it, then come back: ${links.ics}  (Google Calendar: ${links.google} · Outlook: ${links.outlook})`
  return { message, links }
}
