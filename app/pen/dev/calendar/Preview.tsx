'use client'

import { useEffect, useState } from 'react'
import { LangProvider } from '@/app/pen/LangContext'
import Icon from '@/app/pen/Icon'
import type { Lang } from '@/lib/pen/i18n'
import type { CalRange } from '@/lib/pen/calendar-view'
import CalendarView from '@/app/pen/calendar/CalendarView'
import { buildMock, buildStress, mockBrief, mockPeople } from './mock'

/** ?clock=8:45 — the page's clock reads 8:45 today (and keeps ticking), so the phone's day view
 *  shows past, now and upcoming whatever time the screenshots are taken. Dev preview only. */
function setClock(hm: string) {
  const [h, m] = hm.split(':').map(Number)
  if (!Number.isFinite(h)) return
  const Real = Date
  const t = new Real()
  t.setHours(h, m || 0, 0, 0)
  const off = t.getTime() - Real.now()
  class Shifted extends Real {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(Real.now() + off)
      else super(...(a as [string]))
    }
    static now() {
      return Real.now() + off
    }
  }
  window.Date = Shifted as DateConstructor
}

export default function Preview({ phone, lang, empty, stress, goto, clock }: { phone: boolean; lang: Lang; empty: boolean; stress?: boolean; goto?: string; clock?: string }) {
  // Built after mount: "today" is the browser's today, and server and client never disagree.
  const [mock, setMock] = useState<CalRange | null>(null)
  useEffect(() => {
    if (clock) setClock(clock)
    const m = stress ? buildStress() : buildMock()
    setMock(empty ? { ...m, calendars: [], events: [] } : m)
  }, [empty, stress, clock])
  const log = (what: string) => (id: string) => console.info(`[calendar preview] ${what}`, id)
  const view = mock && (
    <CalendarView phone={phone} goTo={goto ? { date: goto, n: 1 } : undefined} mock={mock} mockBrief={mockBrief} mockPeople={mockPeople} onOpenRecording={log('open recording')} onOpenConnections={() => log('open connections')('')} />
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
          {/* The real shell's tab bar (PhoneShell.tsx), so the floating pills sit where they will. */}
          <nav className="pen-m-tabs" aria-label="Main">
            {(['home', 'calendar', 'recordings', 'chat'] as const).map((t) => (
              <button key={t} type="button" className="pen-m-tab" data-on={t === 'calendar'}>
                <Icon name={t} size={23} />
                <span>{{ home: 'Home', calendar: 'Calendar', recordings: 'Recordings', chat: 'Chat' }[t]}</span>
              </button>
            ))}
          </nav>
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
