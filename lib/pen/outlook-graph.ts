// Outlook / Microsoft 365 (21 Oct): the pure half of the Microsoft connection, for tests
// (.pentest/outlook-unit.mts). No database, no network: Microsoft's sign-in URLs and scopes, what a
// sign-in error means, Graph events ↔ Juno's event shape (time zones, all-day days, Teams links),
// and the sendMail body. lib/pen/outlook.ts (tokens, accounts, sending) and
// lib/pen/outlook-calendar.ts (the calendar calls) use it.

import type { UpcomingEvent } from './google-calendar'
import type { CalEvent } from './calendar'

export const MS_LOGIN = 'https://login.microsoftonline.com'
export const GRAPH = 'https://graph.microsoft.com/v1.0'
/** The tenant id Microsoft gives every personal account (outlook.com, hotmail, live). */
export const PERSONAL_TID = '9188040d-6c67-4c5b-b112-36a304b66dad'

/** The two abilities, as Microsoft names the delegated permissions. Reading mail (Mail.Read) is not asked yet. */
export const MS_CAL = 'Calendars.ReadWrite'
export const MS_SEND = 'Mail.Send'
const BASE = ['offline_access', 'openid', 'email', 'profile', 'User.Read']

/** The scopes one consent asks for: always sign-in + refresh, plus the abilities chosen. */
export function msScopes(o: { cal: boolean; send: boolean }): string[] {
  return [...BASE, ...(o.send ? [MS_SEND] : []), ...(o.cal ? [MS_CAL] : [])]
}

/**
 * The abilities a token came back with. Microsoft returns the granted scopes space-separated,
 * work accounts with the resource prefix ("https://graph.microsoft.com/Mail.Send"), personal
 * accounts often without it, in any case.
 */
export function grantedAbilities(scope: string | null | undefined): string[] {
  const names = (scope ?? '').split(/\s+/).map((s) => s.replace(/^https:\/\/graph\.microsoft\.com\//i, '').toLowerCase())
  return [...(names.includes(MS_SEND.toLowerCase()) ? [MS_SEND] : []), ...(names.includes(MS_CAL.toLowerCase()) ? [MS_CAL] : [])]
}

export function msCaps(scopes: string[] | null | undefined): { can_send: boolean; can_cal: boolean } {
  const s = Array.isArray(scopes) ? scopes : []
  return { can_send: s.includes(MS_SEND), can_cal: s.includes(MS_CAL) }
}

/**
 * Microsoft's sign-in for one account. /common: work, school and personal accounts.
 * prompt=select_account so they can pick any account, not the one the browser is signed in to.
 */
export function msAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string; cal: boolean; send: boolean; hint?: string | null }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    response_type: 'code',
    redirect_uri: o.redirectUri,
    response_mode: 'query',
    scope: msScopes(o).join(' '),
    state: o.state,
    prompt: 'select_account',
    ...(o.hint ? { login_hint: o.hint } : {}),
  })
  return `${MS_LOGIN}/common/oauth2/v2.0/authorize?${q}`
}

const CONSUMER = /@(outlook|hotmail|live|msn|passport)\.[a-z.]+$/i

/**
 * Where an admin approves Juno Pen for a whole organisation. The tenant: its id when Microsoft told
 * us (not the personal-accounts one), else the work address's domain (Microsoft accepts a verified
 * domain there), else "organizations" (the admin's own sign-in picks it).
 */
export function adminConsentUrl(clientId: string, o: { tenant?: string | null; address?: string | null; redirectUri?: string | null } = {}): string {
  const t = o.tenant && o.tenant !== PERSONAL_TID && /^[0-9a-f-]{36}$/i.test(o.tenant) ? o.tenant
    : o.address && !CONSUMER.test(o.address) && /@[a-z0-9.-]+\.[a-z]{2,}$/i.test(o.address) ? o.address.split('@')[1].toLowerCase()
      : 'organizations'
  const q = new URLSearchParams({ client_id: clientId, ...(o.redirectUri ? { redirect_uri: o.redirectUri, state: 'admin' } : {}) })
  return `${MS_LOGIN}/${t}/adminconsent?${q}`
}

/**
 * What a Microsoft sign-in or token error means for the user.
 *   admin_consent: their organisation only lets an IT admin approve apps (AADSTS65001 consent
 *     missing, 90094/90095 admin approval required, 65004 can also follow "Need admin approval").
 *   cancelled: they closed or declined the screen.
 *   reconnect: the refresh token is dead (expired, revoked, password changed): connect again.
 */
export function classifyMsError(code: string | null | undefined, desc: string | null | undefined): 'admin_consent' | 'cancelled' | 'reconnect' | 'failed' {
  const d = `${code ?? ''} ${desc ?? ''}`
  if (/AADSTS(65001|90094|90095|90099|900941)\b|admin(istrator)?\s+(approval|consent)|need admin|consent_required/i.test(d)) return 'admin_consent'
  if (/AADSTS65004\b|access_denied|user (declined|cancel)/i.test(d)) return 'cancelled'
  if (code === 'invalid_grant' || /AADSTS(700082|70008|70000|50173|50076|50078|54005|500014)\b|interaction_required|login_required/i.test(d)) return 'reconnect'
  return 'failed'
}

/** The claims Juno uses from Microsoft's id_token (it came straight from Microsoft's token endpoint over TLS). */
export function idClaims(idToken: string | undefined): { email: string | null; tid: string | null; name: string | null } {
  if (!idToken) return { email: null, tid: null, name: null }
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string; preferred_username?: string; upn?: string; tid?: string; name?: string }
    const email = [p.email, p.preferred_username, p.upn].find((x) => typeof x === 'string' && x.includes('@'))
    return { email: email?.toLowerCase() ?? null, tid: p.tid ?? null, name: p.name?.trim() || null }
  } catch {
    return { email: null, tid: null, name: null }
  }
}

/* -------------------------------------------------------------- events */

type DT = { dateTime?: string; timeZone?: string }
export type GraphEvent = {
  id: string
  subject?: string | null
  isCancelled?: boolean
  isAllDay?: boolean
  start?: DT
  end?: DT
  location?: { displayName?: string | null } | null
  webLink?: string | null
  isOnlineMeeting?: boolean
  onlineMeetingProvider?: string | null
  onlineMeeting?: { joinUrl?: string | null } | null
  onlineMeetingUrl?: string | null
  attendees?: { type?: string; status?: { response?: string }; emailAddress?: { name?: string | null; address?: string | null } }[]
  organizer?: { emailAddress?: { name?: string | null; address?: string | null } } | null
  isOrganizer?: boolean
  iCalUId?: string | null
  responseStatus?: { response?: string } | null
  singleValueExtendedProperties?: { id: string; value: string }[]
}

/**
 * Marks Juno's own events (like Google's extendedProperties.private.juno): a named property in
 * Outlook's public-strings set, value = the pen_suggestions id it came from, or "1".
 */
export const JUNO_PROP = 'String {00020329-0000-0000-C000-000000000046} Name junoRef'
export const EVENT_SELECT = 'id,subject,isCancelled,isAllDay,start,end,location,webLink,isOnlineMeeting,onlineMeetingProvider,onlineMeeting,onlineMeetingUrl,attendees,organizer,isOrganizer,iCalUId,responseStatus'
export const EVENT_EXPAND = `singleValueExtendedProperties($filter=id eq '${JUNO_PROP}')`

/** Minutes east of UTC for a zone at an instant. */
function offsetMin(tz: string, at: number): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]))
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(at / 1000) * 1000) / 60000
}

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * A Graph date-time → ISO in UTC. Juno asks Graph for UTC (Prefer: outlook.timezone="UTC"), so
 * the zone is "UTC" and only the "Z" is missing; an IANA zone is converted; anything else (a
 * Windows zone name, which only shows up if the header was dropped) is read as UTC.
 */
export function graphTime(dt: DT | undefined): string {
  const raw = (dt?.dateTime ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw)
  if (!m) return ''
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0))
  const wall = Date.UTC(y, mo - 1, d, h, mi, s || 0)
  const tz = (dt?.timeZone ?? 'UTC').trim()
  if (!tz || /^(utc|gmt|z|etc\/utc|coordinated universal time)$/i.test(tz) || !tz.includes('/') || !validTz(tz)) return new Date(wall).toISOString()
  // Wall clock in an IANA zone: subtract its offset (twice, for the hour around a DST change).
  let t = wall - offsetMin(tz, wall) * 60000
  t = wall - offsetMin(tz, t) * 60000
  return new Date(t).toISOString()
}

/**
 * An all-day event's day, "YYYY-MM-DD". Outlook stores all-day events as midnight in the
 * calendar's zone; asked for in UTC, midnight in Santiago comes back as 03:00 the same day and
 * midnight in Tokyo as 15:00 the day before. So: the date, plus one when the hour is past noon.
 */
export function allDayDate(dt: DT | undefined): string {
  const raw = (dt?.dateTime ?? '').trim()
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}))?/.exec(raw)
  if (!m) return ''
  const utc = /^(utc|gmt|z|etc\/utc)?$/i.test((dt?.timeZone ?? 'UTC').trim())
  if (!utc || !m[2] || Number(m[2]) < 12) return m[1]
  const d = new Date(`${m[1]}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Exchange's iCalUId for an invite that came from elsewhere (Google, an .ics) is a hex
 * GlobalObjectId with the original UID inside, after "vCal-Uid" + 01 00 00 00. Pulled out, the same
 * meeting on a Google and an Outlook calendar shares one UID and is shown once.
 */
export function outlookUid(iCalUId: string | null | undefined): string | null {
  if (!iCalUId) return null
  if (!/^[0-9a-f]+$/i.test(iCalUId) || iCalUId.length < 80) return iCalUId
  const b = Buffer.from(iCalUId, 'hex')
  const at = b.indexOf(Buffer.from('vCal-Uid\x01\x00\x00\x00', 'latin1'))
  if (at < 0) return iCalUId
  const start = at + 12
  const end = b.indexOf(0, start)
  const uid = b.subarray(start, end < 0 ? b.length : end).toString('utf8').trim()
  return uid || iCalUId
}

const joinOf = (e: GraphEvent) => e.onlineMeeting?.joinUrl ?? e.onlineMeetingUrl ?? null

/** A Graph event → the shape every calendar reader in Juno uses (same as Google's toUpcoming). */
export function fromGraph(e: GraphEvent, self?: string | null): UpcomingEvent {
  const me = self?.toLowerCase() ?? null
  const allDay = e.isAllDay === true
  const org = e.organizer?.emailAddress?.address?.toLowerCase() ?? null
  const prop = e.singleValueExtendedProperties?.find((p) => p.id.toLowerCase() === JUNO_PROP.toLowerCase())?.value ?? null
  return {
    id: e.id,
    title: (e.subject ?? '').trim() || '(no title)',
    start: allDay ? allDayDate(e.start) : graphTime(e.start),
    end: e.end ? (allDay ? allDayDate(e.end) : graphTime(e.end)) : null,
    allDay,
    others: (e.attendees ?? [])
      .filter((a) => a.type !== 'resource' && a.emailAddress?.address && a.emailAddress.address.toLowerCase() !== me)
      .map((a) => ({ email: a.emailAddress!.address!.toLowerCase(), name: a.emailAddress?.name?.trim() || null })),
    declined: e.responseStatus?.response === 'declined',
    location: e.location?.displayName?.trim() || null,
    meet: joinOf(e),
    link: e.webLink ?? null,
    junoRef: prop && prop !== '1' ? prop : null,
    juno: prop != null,
    uid: outlookUid(e.iCalUId),
    organizerSelf: e.isOrganizer === true,
    organizer: org ? { email: org, name: e.organizer?.emailAddress?.name?.trim() || null } : null,
  }
}

/** Graph's form of an instant: wall clock in UTC, no offset, with timeZone "UTC". */
export const graphDT = (ms: number) => ({ dateTime: new Date(ms).toISOString().slice(0, 19), timeZone: 'UTC' })

export type MeetingProvider = 'teamsForBusiness' | 'skypeForConsumer' | 'skypeForBusiness'

/**
 * Which video link an Outlook calendar can put on an event. Work/school (Microsoft 365) calendars
 * allow Teams; personal Outlook.com calendars may allow only Skype, or nothing. null = none.
 * Unknown (the calendar didn't say): try Teams; a missing joinUrl afterwards means it didn't work.
 */
export function pickMeetingProvider(allowed: string[] | null | undefined): MeetingProvider | null {
  if (!allowed) return 'teamsForBusiness'
  if (allowed.includes('teamsForBusiness')) return 'teamsForBusiness'
  if (allowed.includes('skypeForBusiness')) return 'skypeForBusiness'
  if (allowed.includes('skypeForConsumer')) return 'skypeForConsumer'
  return null
}

export const providerLabel = (p: string | null | undefined) => (p === 'teamsForBusiness' ? 'Teams' : p?.startsWith('skype') ? 'Skype' : null)

export type MsAttendee = { email: string; name?: string | null }

const cleanAttendees = (list: MsAttendee[] = []) =>
  list
    .map((a) => ({ address: a.email.trim().toLowerCase(), name: a.name?.trim().slice(0, 100) || undefined }))
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.address))
    .map((a) => ({ emailAddress: { address: a.address, ...(a.name ? { name: a.name } : {}) }, type: 'required' }))

/**
 * The body of POST /me/events (exported for tests). Times in UTC (Outlook shows them in each
 * person's own zone). With attendees, Outlook emails the invitations from the user's mailbox.
 */
export function graphEventBody(ev: CalEvent, o: { attendees?: MsAttendee[]; video?: MeetingProvider | null; ref?: string } = {}): Record<string, unknown> {
  const startMs = Date.parse(ev.start)
  if (Number.isNaN(startMs)) throw new Error('calendar event needs a valid start')
  const dur = Math.min(24 * 60, Math.max(5, Math.round(ev.durationMin ?? 30)))
  const alarm = ev.alarmMin ?? 30
  const attendees = cleanAttendees(o.attendees)
  return {
    subject: (ev.title ?? '').trim().slice(0, 200) || 'Meeting',
    ...(ev.description?.trim() ? { body: { contentType: 'text', content: ev.description.trim().slice(0, 1000) } } : {}),
    ...(ev.location?.trim() ? { location: { displayName: ev.location.trim().slice(0, 200) } } : {}),
    start: graphDT(startMs),
    end: graphDT(startMs + dur * 60000),
    ...(attendees.length ? { attendees } : {}),
    isReminderOn: alarm > 0,
    ...(alarm > 0 ? { reminderMinutesBeforeStart: Math.min(40320, Math.round(alarm)) } : {}),
    ...(o.video ? { isOnlineMeeting: true, onlineMeetingProvider: o.video } : {}),
    singleValueExtendedProperties: [{ id: JUNO_PROP, value: o.ref || '1' }],
  }
}

/** A new start for PATCH /me/events/{id}, keeping the length. */
export function graphMoveBody(startIso: string, lenMs: number): Record<string, unknown> {
  const start = Date.parse(startIso)
  if (Number.isNaN(start)) throw new Error('needs a valid start')
  return { start: graphDT(start), end: graphDT(start + Math.max(5 * 60000, lenMs)) }
}

/** The attendee list for PATCH with one more guest (no duplicate). */
export function withAttendee(cur: GraphEvent['attendees'], who: MsAttendee): Record<string, unknown>[] {
  const have = (cur ?? []).filter((a) => a.emailAddress?.address).map((a) => ({ emailAddress: { address: a.emailAddress!.address!, ...(a.emailAddress?.name ? { name: a.emailAddress.name } : {}) }, type: a.type ?? 'required' }))
  const add = cleanAttendees([who])
  if (!add.length) throw new Error('that email address does not look right')
  return have.some((a) => a.emailAddress.address.toLowerCase() === add[0].emailAddress.address) ? have : [...have, ...add]
}

/** Graph's free-text match isn't offered on calendarView, so "find X" filters the window here. */
export function textHit(e: UpcomingEvent, q: string | null | undefined): boolean {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${e.title} ${e.location ?? ''} ${e.others.map((o) => `${o.name ?? ''} ${o.email}`).join(' ')} ${e.organizer?.name ?? ''} ${e.organizer?.email ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/* ---------------------------------------------------------------- mail */

/**
 * The body of POST /me/sendMail: plain text, one recipient, a copy in the user's Sent Items.
 * The From is the signed-in mailbox (Graph sends as the account whose token it is).
 */
export function sendMailPayload(m: { to: string; toName?: string | null; subject: string; body: string }): Record<string, unknown> {
  const to = m.to.trim()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) throw new Error('recipient address does not look right')
  const name = (m.toName ?? '').replace(/[\r\n<>"]/g, '').trim().slice(0, 100)
  return {
    message: {
      subject: m.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 250),
      body: { contentType: 'Text', content: m.body.replace(/\r\n/g, '\n') },
      toRecipients: [{ emailAddress: { address: to, ...(name ? { name } : {}) } }],
    },
    saveToSentItems: true,
  }
}
