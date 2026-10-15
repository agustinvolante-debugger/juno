// Calendar links (plan F1): a signed .ics link that opens Apple Calendar's "Add event" sheet on
// iPhone, and a Google Calendar template link. STUB: the calendar worktree implements this.

export type CalEvent = {
  title: string
  /** ISO with offset, or UTC. */
  start: string
  durationMin?: number
  /** IANA zone the time was said in, e.g. America/Los_Angeles. */
  tz?: string
  description?: string
  location?: string
  /** Alarm before the start, in minutes (default 30). */
  alarmMin?: number
}

export function calendarLinks(_ev: CalEvent): { ics: string; google: string } {
  throw new Error('calendarLinks: not built yet')
}
