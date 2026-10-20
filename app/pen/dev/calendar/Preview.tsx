'use client'

import { useEffect, useState } from 'react'
import { LangProvider } from '@/app/pen/LangContext'
import type { Lang } from '@/lib/pen/i18n'
import type { CalRange } from '@/lib/pen/calendar-view'
import CalendarView from '@/app/pen/calendar/CalendarView'
import { buildMock, mockBrief } from './mock'

export default function Preview({ phone, lang, empty }: { phone: boolean; lang: Lang; empty: boolean }) {
  // Built after mount: "today" is the browser's today, and server and client never disagree.
  const [mock, setMock] = useState<CalRange | null>(null)
  useEffect(() => {
    const m = buildMock()
    setMock(empty ? { ...m, calendars: [], events: [], todos: [], reminders: [] } : m)
  }, [empty])
  const log = (what: string) => (id: string) => console.info(`[calendar preview] ${what}`, id)
  const view = mock && (
    <CalendarView phone={phone} mock={mock} mockBrief={mockBrief} onOpenRecording={log('open recording')} onOpenConnections={() => log('open connections')('')} />
  )

  return (
    <LangProvider lang={lang}>
      {phone ? (
        <div className="pen-m">
          <header className="pen-m-top">
            <div className="pen-m-top-side" />
            <h1 className="pen-m-title">Calendar</h1>
            <div className="pen-m-top-side pen-m-top-right" />
          </header>
          <main className="pen-m-body">{view}</main>
        </div>
      ) : (
        <main className="pen-page" style={{ padding: 24 }}>
          <div aria-hidden style={{ borderRadius: 22, background: 'rgba(255,255,255,.5)' }} />
          <div className="pen-main-col">
            <section className="pen-shell-main min-w-0">{view}</section>
          </div>
        </main>
      )}
    </LangProvider>
  )
}
