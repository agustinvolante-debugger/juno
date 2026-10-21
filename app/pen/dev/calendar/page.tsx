import { notFound } from 'next/navigation'
import Preview from './Preview'

// Dev-only preview of the Calendar page with made-up data (screenshots, design review).
// /pen/dev/calendar            desktop week/month
// /pen/dev/calendar?phone=1    phone agenda
// ?lang=es|pt  ?empty=1  (no calendars connected)  ?stress=1  (long titles, a 20-event day, 5 all-day items, a failed read)  ?goto=YYYY-MM-DD  (the mini calendar's jump)
export default async function CalendarPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  const lang = sp.lang === 'es' || sp.lang === 'pt' ? sp.lang : 'en'
  return <Preview phone={sp.phone === '1'} lang={lang} empty={sp.empty === '1'} stress={sp.stress === '1'} goto={typeof sp.goto === 'string' ? sp.goto : undefined} />
}
