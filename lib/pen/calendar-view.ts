// The Calendar page (22 Oct): the shapes the browser and the /api/pen/calendar routes share. Pure
// types, no server imports, so app/pen/calendar/* can import it. Events are read live from every
// connected Google and Outlook calendar (lib/pen/calendars.ts) for the range on screen and never
// stored; the Juno extras (recording of a past meeting, brief) are computed on each read. Meetings only:
// to-dos and reminders stay on Home and WhatsApp (founder, 22 Oct).
//
// Routes:
//   GET    /api/pen/calendar?from=<ISO>&to=<ISO>        → CalRange   (span ≤ 42 days)
//   GET    /api/pen/calendar/brief?ref=<event ref>      → { brief: CalBrief }
//   POST   /api/pen/calendar/events   CalCreate         → { event: CalViewEvent }
//   PATCH  /api/pen/calendar/events   CalPatch          → { event: CalViewEvent }  (a calendar move returns the event's new ref)
//   DELETE /api/pen/calendar/events?ref=<ref>[&confirm=1] → { ok: true }
// A change that would email guests (create with guests, or patch/delete of an event with guests)
// without confirm → 409 { needsConfirm: true, guests: <count> }; the page asks, then resends with
// confirm. An event the user didn't organise → 403 { readOnly: true } (open it in Google/Outlook).

export type CalProviderName = 'google' | 'outlook'

/** One connected calendar, in Settings order (the page colours them by this order). */
export type CalAccount = {
  key: string
  address: string | null
  provider: CalProviderName
  /** Its connection needs reconnecting: no events were read from it. */
  broken: boolean
  /** New events go here unless the user picks another. */
  isDefault: boolean
}

export type CalGuest = { email: string; name: string | null }

export type CalViewEvent = {
  /** "<provider id>|<calendar key>" (calendar-merge.ts eventRef): what every change sends back. */
  ref: string
  /** The calendar this copy was read from; `cals` = every connected calendar it is on. */
  cal: string
  cals: string[]
  title: string
  /** ISO with offset for timed events; 'YYYY-MM-DD' for all-day ones (end exclusive). */
  start: string
  end: string | null
  allDay: boolean
  location: string | null
  description: string | null
  /** Video link (Meet / Teams). */
  meet: string | null
  /** The event in Google Calendar / Outlook on the web. */
  link: string | null
  declined: boolean
  guests: CalGuest[]
  organizer: CalGuest | null
  /** The user organised it (or nobody else did): it can be changed here. */
  editable: boolean
  /** Juno added it. */
  juno: boolean
  /** One occurrence of a repeating event: a change applies to that occurrence only. */
  recurring?: boolean
  /** A past meeting matched to its Pen recording (time overlap, guests). */
  recording: { id: string; title: string } | null
  /** An upcoming meeting with guests: GET /api/pen/calendar/brief has something to show. */
  hasBrief: boolean
}

export type CalRange = {
  calendars: CalAccount[]
  events: CalViewEvent[]
  /** Calendar keys that failed to read this time (shown as a quiet warning). */
  failed: string[]
  /** The user's IANA zone (lib/pen/timezone.ts userZone), for labels. */
  tz: string
}

export type CalBrief = {
  people: {
    name: string
    email: string | null
    lastCall: { sessionId: string; date: string; title: string; summary: string } | null
    youOwe: string[]
    theyOwe: string[]
  }[]
}

export type CalCreate = {
  /** Calendar key; omitted = the default calendar. */
  cal?: string
  title: string
  /** Timed: ISO instant. All-day: 'YYYY-MM-DD'. */
  start: string
  end: string
  allDay?: boolean
  location?: string
  description?: string
  guests?: CalGuest[]
  /** Add a Meet / Teams link. */
  video?: boolean
  /** The browser's IANA zone. */
  tz: string
  confirm?: boolean
}

export type CalPatch = {
  ref: string
  title?: string
  start?: string
  end?: string
  location?: string | null
  description?: string | null
  /** The full guest list after the edit (absent = unchanged). Adding or removing anyone emails them → 409 needsConfirm first. */
  guests?: CalGuest[]
  /** true = add a Meet / Teams link (no removal: Outlook can't take one off reliably). */
  video?: boolean
  /** Move it to another connected calendar (create there, delete here). Refused (400) for an event with guests: it would cancel and re-invite everyone. */
  cal?: string
  tz: string
  confirm?: boolean
}
