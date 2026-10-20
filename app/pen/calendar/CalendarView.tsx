'use client'

// The Calendar page (22 Oct). Stub: replaced by the real view (week/month on desktop, agenda on
// phone). Types and routes: lib/pen/calendar-view.ts.

export type CalendarViewProps = {
  phone?: boolean
  /** Open a recording (a past meeting's notes). */
  onOpenRecording: (sessionId: string) => void
  /** Settings → Connections, to connect or reconnect a calendar. */
  onOpenConnections: () => void
}

export default function CalendarView(_props: CalendarViewProps) {
  return <section className="pen-cal" aria-label="Calendar" />
}
