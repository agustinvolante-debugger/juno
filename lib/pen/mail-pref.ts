// Which mail service a draft's "Open in …" link is for (19 Oct 2026, Notes/handoff-wa-assistant-oct15.md):
//
//   1. what they said: "I use Outlook / Yahoo / Gmail" (set_mail_app), kept in the profile as 'said'
//   2. the Gmail the draft goes out from, when one is connected (lib/pen/gmail.ts)
//   3. their address's domain: yahoo/ymail/rocketmail → Yahoo, outlook/hotmail/live/msn → Outlook.com,
//      gmail/googlemail → Gmail
//   4. a company domain's mail servers: Microsoft 365 → Outlook on the web, Google Workspace → Gmail
//      (looked up once and kept as a 'guess', like the calendar app in calendar-pref.ts)
//   5. none: only "Open in your mail app" (mailto)

import { promises as dns } from 'node:dns'
import { supabaseAdmin } from '@/lib/supabase'
import { cleanProfile, getProfileRaw } from './profile'
import { domainOf, providerFromApp, providerFromDomain, providerFromMx, type MailApp, type MailProvider } from './mail-compose'

async function saveFields(email: string, fields: { mailApp: MailApp | 'none'; mailAppSource: 'said' | 'guess' }): Promise<void> {
  const cur = (await getProfileRaw(email).catch(() => null)) ?? {}
  const { error } = await supabaseAdmin
    .from('pen_profiles')
    .upsert({ user_email: email.toLowerCase(), profile: cleanProfile({ ...cur, ...fields }), updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
  if (error) throw new Error(error.message)
}

export type MxLookup = (domain: string) => Promise<string[]>
const realMx: MxLookup = async (d) => (await dns.resolveMx(d)).map((m) => m.exchange)

/** Steps 3–4 for one address (pure apart from the injected MX lookup). */
export async function guessProvider(email: string, mx: MxLookup = realMx): Promise<MailProvider | null> {
  const byDomain = providerFromDomain(email)
  if (byDomain) return byDomain
  const d = domainOf(email)
  if (!d || d === 'icloud.com' || d === 'me.com' || d === 'mac.com') return null
  try {
    return providerFromMx(await mx(d))
  } catch {
    return null
  }
}

/**
 * The provider for this user's draft links. `from` = the connected Gmail or Outlook address the draft goes out from.
 * A guess from MX is stored so the lookup runs once ('none' when nothing matched).
 */
export async function mailProvider(email: string, from?: string | null, mx: MxLookup = realMx): Promise<MailProvider | null> {
  const p = (await getProfileRaw(email).catch(() => null)) ?? {}
  const app = p.mailApp as MailApp | 'none' | undefined
  if (p.mailAppSource === 'said' && app && app !== 'none') {
    const said = providerFromApp(app, email)
    if (said !== undefined) return said
  }
  if (from) {
    // The draft goes out from a connected address: its own web compose. Outlook (21 Oct): a
    // Microsoft address opens Outlook (outlook.com for personal ones, Microsoft 365 otherwise).
    const { isOutlookSender } = await import('./outlook')
    if (await isOutlookSender(email, from).catch(() => false)) return providerFromDomain(from) === 'outlook_live' ? 'outlook_live' : 'outlook'
    return 'gmail'
  }
  if (p.mailAppSource === 'guess' && app) return app === 'none' ? null : (providerFromApp(app, email) ?? null)
  const guess = await guessProvider(email, mx)
  const asApp: MailApp | 'none' = guess === 'outlook_live' ? 'outlook' : guess ?? 'none'
  await saveFields(email, { mailApp: asApp, mailAppSource: 'guess' }).catch(() => {})
  return guess
}

export async function setMailApp(email: string, app: MailApp): Promise<void> {
  await saveFields(email, { mailApp: app, mailAppSource: 'said' })
}
