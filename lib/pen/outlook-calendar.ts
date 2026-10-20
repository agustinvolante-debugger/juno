// Outlook calendars through Microsoft Graph (21 Oct): the same calls lib/pen/google-calendar.ts
// makes, with the same shapes, so lib/pen/calendars.ts can read and write either. Always the
// account's default calendar (/me/calendar, /me/events, /me/calendarView). Reads are fetched when
// needed and never stored, like Google's.
//
//   · Times: Graph is asked for UTC and Juno sends UTC; Outlook shows them in each person's zone.
//   · Video link: "with a video link" on an Outlook calendar = Teams (isOnlineMeeting +
//     teamsForBusiness) where the calendar allows it, Skype on personal calendars that only allow
//     that, none otherwise: the result says so (videoUnavailable) instead of failing.
//   · Guests: Outlook emails invitations, updates and cancellations from the user's own mailbox
//     whenever an event with attendees is created, moved or deleted. Juno's confirm policy (ask first
//     when guests would be emailed) is in the chat tools, the same as Google.

import type { EventPatch, NewEvent } from './calendar-edit'
import type { Attendee, CreatedEvent, UpcomingEvent } from './google-calendar'
import { graph, type GraphError } from './outlook'
import { EVENT_EXPAND, EVENT_SELECT, fromGraph, graphEventBody, graphMoveBody, graphPatchBody, pickMeetingProvider, providerLabel, textHit, withAttendee, type GraphEvent, type MeetingProvider } from './outlook-graph'

const READ_DAYS = 7
const enc = encodeURIComponent

export type OutlookCreated = CreatedEvent & { video?: string | null; videoUnavailable?: boolean }

const created = (e: GraphEvent, asked: boolean): OutlookCreated => {
  const join = e.onlineMeeting?.joinUrl ?? e.onlineMeetingUrl ?? null
  return { id: e.id, link: e.webLink ?? null, meet: join, ...(join ? { video: providerLabel(e.onlineMeetingProvider) ?? 'Teams' } : {}), ...(asked && !join ? { videoUnavailable: true } : {}) }
}

/** Which video provider this calendar allows (cached per address for the instance's life). */
const providers = new Map<string, MeetingProvider | null>()
async function videoFor(email: string, address: string): Promise<MeetingProvider | null> {
  const k = `${email.toLowerCase()}|${address}`
  if (providers.has(k)) return providers.get(k)!
  let allowed: string[] | null = null
  try {
    const c = await graph<{ allowedOnlineMeetingProviders?: string[] }>(email, address, 'me/calendar?$select=allowedOnlineMeetingProviders,defaultOnlineMeetingProvider')
    allowed = Array.isArray(c?.allowedOnlineMeetingProviders) ? c.allowedOnlineMeetingProviders : null
  } catch {
    allowed = null
  }
  const p = pickMeetingProvider(allowed)
  providers.set(k, p)
  return p
}

/** Events in [from, to) on this address's default calendar, soonest first (follows paging up to 300). */
export async function outlookRange(email: string, address: string, from: Date, to: Date, o: { q?: string; max?: number } = {}): Promise<UpcomingEvent[]> {
  const max = Math.min(250, Math.max(1, o.max ?? 100))
  const q = new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: String(Math.min(100, max)), $orderby: 'start/dateTime', $select: EVENT_SELECT, $expand: EVENT_EXPAND })
  let next: string | null = `me/calendarView?${q}`
  const out: GraphEvent[] = []
  for (let page = 0; next && page < 3 && out.length < max; page++) {
    const j: { value?: GraphEvent[]; '@odata.nextLink'?: string } = await graph(email, address, next)
    out.push(...(j?.value ?? []))
    next = j?.['@odata.nextLink'] ?? null
  }
  return out
    .filter((e) => !e.isCancelled)
    .map((e) => fromGraph(e, address))
    .filter((e) => textHit(e, o.q))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, max)
}

export async function outlookUpcoming(email: string, address: string, days = READ_DAYS, now = new Date()): Promise<UpcomingEvent[]> {
  const span = Math.min(READ_DAYS, Math.max(0, days))
  return outlookRange(email, address, now, new Date(now.getTime() + span * 86_400_000))
}

export async function outlookGet(email: string, address: string, id: string): Promise<UpcomingEvent | null> {
  try {
    const e = await graph<GraphEvent>(email, address, `me/events/${enc(id)}?$select=${EVENT_SELECT}&$expand=${enc(EVENT_EXPAND)}`)
    return !e || e.isCancelled ? null : fromGraph(e, address)
  } catch (err) {
    const s = (err as GraphError).status
    if (s === 404 || s === 410) return null
    throw err
  }
}

/** A new event (the user's yes, or their own request). With attendees, Outlook emails the invitations. */
export async function outlookCreate(email: string, address: string, ev: NewEvent, o: { attendees?: Attendee[]; meet?: boolean; ref?: string } = {}): Promise<OutlookCreated> {
  const video = o.meet ? await videoFor(email, address) : null
  const body = graphEventBody(ev, { attendees: o.attendees, video, ref: o.ref })
  let e: GraphEvent
  try {
    e = await graph<GraphEvent>(email, address, 'me/events', { method: 'POST', body })
  } catch (err) {
    // The calendar refused the video provider (a personal calendar that allows none): add it without.
    if (video && (err as GraphError).status === 400) {
      providers.set(`${email.toLowerCase()}|${address}`, null)
      const { isOnlineMeeting: _a, onlineMeetingProvider: _b, ...plain } = body
      void _a; void _b
      e = await graph<GraphEvent>(email, address, 'me/events', { method: 'POST', body: plain })
    } else throw err
  }
  return created(e, Boolean(o.meet))
}

/** Puts a Teams (or the calendar's own) link on an event. */
export async function outlookAddVideo(email: string, address: string, id: string): Promise<OutlookCreated> {
  const video = await videoFor(email, address)
  if (!video) {
    const cur = await outlookGet(email, address, id)
    return { id, link: cur?.link ?? null, meet: cur?.meet ?? null, videoUnavailable: !cur?.meet }
  }
  try {
    const e = await graph<GraphEvent>(email, address, `me/events/${enc(id)}`, { method: 'PATCH', body: { isOnlineMeeting: true, onlineMeetingProvider: video } })
    return created(e, true)
  } catch (err) {
    if ((err as GraphError).status === 400) {
      providers.set(`${email.toLowerCase()}|${address}`, null)
      return { id, link: null, meet: null, videoUnavailable: true }
    }
    throw err
  }
}

export async function outlookAddAttendee(email: string, address: string, id: string, who: Attendee): Promise<OutlookCreated> {
  const cur = await graph<GraphEvent>(email, address, `me/events/${enc(id)}?$select=attendees`)
  const e = await graph<GraphEvent>(email, address, `me/events/${enc(id)}`, { method: 'PATCH', body: { attendees: withAttendee(cur?.attendees, who) } })
  return created(e, false)
}

/** Deletes an event; as the organizer of a meeting, Outlook sends the guests a cancellation. */
export async function outlookDelete(email: string, address: string, id: string): Promise<void> {
  await graph(email, address, `me/events/${enc(id)}`, { method: 'DELETE' })
}

/** Moves an event (same length unless given); guests get Outlook's update. */
export async function outlookMove(email: string, address: string, id: string, startIso: string, durationMin?: number): Promise<OutlookCreated> {
  const cur = await graph<GraphEvent>(email, address, `me/events/${enc(id)}?$select=start,end,isAllDay`)
  const a = cur?.start ? fromGraph({ ...cur, id }, address) : null
  const oldLen = a && !a.allDay && a.end ? Date.parse(a.end) - Date.parse(a.start) : 30 * 60000
  const e = await graph<GraphEvent>(email, address, `me/events/${enc(id)}`, { method: 'PATCH', body: { ...graphMoveBody(startIso, durationMin ? durationMin * 60000 : oldLen), ...(a?.allDay ? { isAllDay: false } : {}) } })
  return created(e, false)
}

/** Changes an event's title, time, place or notes (Calendar page); guests, if any, get Outlook's update. */
export async function outlookUpdate(email: string, address: string, id: string, p: EventPatch): Promise<OutlookCreated> {
  const e = await graph<GraphEvent>(email, address, `me/events/${enc(id)}`, { method: 'PATCH', body: graphPatchBody(p) })
  return created(e, false)
}
