import { getProfileRaw } from '@/lib/pen/profile'
import { abilities, gcalConfigured, getGcalConnection } from '@/lib/pen/google-calendar'
import { defaultCalendar, listCalendars } from '@/lib/pen/calendars'
import { gmailAvailable, gmailReadAllowed, listGoogleAccounts } from '@/lib/pen/gmail'
import { getConnection as getNotion, notionConfigured, type NotionConnection } from '@/lib/pen/notion'
import { getConnection as getGranola, granolaAvailable, type GranolaConnection } from '@/lib/pen/granola'
import { getLinkByEmail } from '@/lib/pen/whatsapp/store'
import { botNumber, configured as whatsappReady } from '@/lib/pen/whatsapp/provider'
import { imessageFor } from '@/lib/pen/imessage/sendblue'
import { getPrefs } from '@/lib/pen/proactive'
import { listOutlookAccounts, outlookAvailable } from '@/lib/pen/outlook'
import { PERSONAL_TID } from '@/lib/pen/outlook-graph'
import type { GAccount } from './GoogleAccounts'
import type { OAccount } from './OutlookAccounts'
import type { CalChoice, MailChoice } from './LinkPrefs'

// Everything Settings → Connections shows, read once per request. Plain data, so the page itself
// only lays it out.

export type ConnData = {
  google: {
    configured: boolean
    gmailOn: boolean
    readAllowed: boolean
    accounts: GAccount[]
    calCount: number
    docs: { on: boolean; calendarToo: boolean; address: string | null; broken: boolean }
  }
  /** Outlook / Microsoft 365 (lib/pen/outlook.ts): `available` = switched on and the table exists; otherwise the links row. */
  outlook: { available: boolean; accounts: OAccount[]; senders: number }
  links: { mail: MailChoice | null; mailGuessed: boolean; cal: CalChoice | null; calGuessed: boolean }
  chat: { ready: boolean; imessage: string | null; number: string; phone: string | null; loadError: string | null }
  notion: { configured: boolean; conn: NotionConnection | null }
  granola: { available: boolean; conn: GranolaConnection | null }
}

export async function loadConnections(email: string): Promise<ConnData> {
  const lower = email.toLowerCase()
  const [gmailOn, readAllowed, gconn, cals, profile, notion, granolaOn, granola, link] = await Promise.all([
    gmailAvailable().catch(() => false),
    gmailReadAllowed(lower).catch(() => false),
    getGcalConnection(lower).catch(() => null),
    listCalendars(lower).catch(() => []),
    getProfileRaw(lower).catch(() => null),
    getNotion(lower).catch(() => null),
    granolaAvailable().catch(() => false),
    getGranola(lower).catch(() => null),
    whatsappReady() || imessageFor(lower) ? getLinkByEmail(lower).then((l) => ({ l, e: null as string | null }), (e: Error) => ({ l: null, e: e.message })) : Promise.resolve({ l: null, e: null }),
  ])
  const gmail = gmailOn ? await listGoogleAccounts(lower).catch(() => []) : []
  const msOn = await outlookAvailable().catch(() => false)
  const ms = msOn ? await listOutlookAccounts(lower).catch(() => []) : []
  const def = cals.length ? (await defaultCalendar(lower, cals).catch(() => null))?.key ?? null : null
  // One default From across Gmail and Outlook: a default marker shows once there is a choice.
  const msSenders = ms.filter((a) => a.can_send).length
  const senders = gmail.filter((a) => a.can_send).length + msSenders

  // One row per address: pen_gmail rows first (oldest first), then the pen_gcal connection,
  // merged into the matching address when it is the same Google account.
  const accounts: GAccount[] = gmail.map((a) => ({
    address: a.address,
    send: a.can_send,
    read: readAllowed && a.can_read,
    cal: a.can_cal,
    docs: false,
    defaultEmail: a.can_send && a.is_default && senders > 1,
    defaultCal: a.can_cal && def === a.address && cals.length > 1,
    broken: Boolean(a.last_error),
    inGmail: true,
    inGcal: false,
    gcalCal: false,
    gmailCal: a.can_cal,
  }))
  const on = abilities(gconn)
  if (gconn && (on.calendar || on.drive)) {
    const addr = gconn.calendar_email?.toLowerCase() ?? null
    const key = addr ?? 'gcal'
    const same = addr ? accounts.find((a) => a.address === addr) : undefined
    const g = same ?? { address: addr, send: false, read: false, cal: false, docs: false, defaultEmail: false, defaultCal: false, broken: false, inGmail: false, inGcal: true, gcalCal: false, gmailCal: false }
    g.inGcal = true
    g.docs = on.drive
    g.gcalCal = on.calendar
    g.cal = g.cal || on.calendar
    g.broken = g.broken || Boolean(gconn.last_error)
    g.defaultCal = g.cal && def === key && cals.length > 1
    if (!same) accounts.push(g)
  }

  const p = (profile ?? {}) as Record<string, unknown>
  const saidMail = p.mailAppSource === 'said'
  const rawMail = typeof p.mailApp === 'string' && p.mailApp !== 'none' ? (p.mailApp as MailChoice) : null
  // The same order as lib/pen/mail-pref.ts: said, then the connected Gmail, then the guess.
  const gmailSenders = senders - msSenders
  const mail: MailChoice | null = saidMail ? rawMail : gmailSenders > 0 ? 'gmail' : msSenders > 0 ? 'outlook' : rawMail
  const cal = typeof p.calendarApp === 'string' ? (p.calendarApp as CalChoice) : null

  return {
    google: {
      configured: gcalConfigured(),
      gmailOn,
      readAllowed,
      accounts,
      calCount: cals.length,
      docs: { on: on.drive, calendarToo: on.calendar, address: gconn?.calendar_email ?? null, broken: Boolean(gconn?.last_error) },
    },
    outlook: {
      available: msOn,
      senders,
      accounts: ms.map((a) => ({
        address: a.address,
        send: a.can_send,
        cal: a.can_cal,
        defaultEmail: a.can_send && a.is_default && senders > 1,
        defaultCal: a.can_cal && def === a.address && cals.length > 1,
        broken: Boolean(a.last_error),
        personal: a.tenant_id === PERSONAL_TID,
      })),
    },
    links: { mail, mailGuessed: Boolean(mail) && !saidMail, cal, calGuessed: Boolean(cal) && p.calendarAppSource !== 'said' },
    chat: {
      ready: whatsappReady(),
      imessage: imessageFor(lower) ? process.env.SENDBLUE_NUMBER ?? null : null,
      number: botNumber(),
      phone: link.l?.linked_at ? link.l.phone : null,
      loadError: link.e,
    },
    notion: { configured: notionConfigured(), conn: notion },
    granola: { available: granolaOn, conn: granola },
  }
}

/** For Settings → Messages from Juno. */
export async function loadMessages(email: string) {
  const [link, prefs] = await Promise.all([getLinkByEmail(email).catch(() => null), getPrefs(email).catch(() => null)])
  return { linked: Boolean(link?.linked_at), prefs: { off: !!prefs?.off, offKinds: prefs?.offKinds ?? [] } }
}
