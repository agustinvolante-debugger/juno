// Dev preview only: a realistic two-and-a-half weeks of calendar around today, built in the
// browser's zone so "today" is really today. Nothing here touches a real account.

import type { CalBrief, CalRange, CalViewEvent } from '@/lib/pen/calendar-view'
import { addDays, startOfWeek, ymd } from '@/app/pen/calendar/cal-utils'

const GMAIL = 'g1'
const WORK = 'g2'
const OUTLOOK = 'o1'
const BROKEN = 'o2'

const ana = { email: 'ana.souza@lumenpay.com', name: 'Ana Souza' }
const marco = { email: 'marco@lumenpay.com', name: 'Marco Rossi' }
const priya = { email: 'priya@northwind.vc', name: 'Priya Natarajan' }
const chris = { email: 'chris@tryjunoapp.com', name: 'Chris Park' }
const me = { email: 'agustin@tryjunoapp.com', name: 'Agustin Volante' }
const dana = { email: 'dana.kim@acme-realty.com', name: 'Dana Kim' }

export function buildMock(): CalRange {
  const mon = startOfWeek(new Date())
  const at = (day: number, h: number, m = 0) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + day, h, m).toISOString()
  const date = (day: number) => ymd(addDays(mon, day))
  let n = 0
  const ev = (p: Partial<CalViewEvent> & Pick<CalViewEvent, 'title' | 'start' | 'cal'>): CalViewEvent => ({
    ref: `${p.ref ?? `ev${++n}`}|${p.cal}`,
    cal: p.cal,
    cals: p.cals ?? [p.cal],
    title: p.title,
    start: p.start,
    end: p.end ?? null,
    allDay: p.allDay ?? false,
    location: p.location ?? null,
    description: p.description ?? null,
    meet: p.meet ?? null,
    link: p.link ?? 'https://calendar.google.com/calendar/r',
    declined: p.declined ?? false,
    guests: p.guests ?? [],
    organizer: p.organizer ?? null,
    editable: p.editable ?? true,
    juno: p.juno ?? false,
    recording: p.recording ?? null,
    hasBrief: p.hasBrief ?? false,
  })
  const meet = 'https://meet.google.com/xyz-abcd-efg'
  const teams = 'https://teams.microsoft.com/l/meetup-join/demo'

  const events: CalViewEvent[] = [
    // This week
    ev({ cal: WORK, ref: 'standup_20261019T160000Z', title: 'Team stand-up', start: at(0, 9), end: at(0, 9, 30), meet, guests: [me, chris], organizer: me }),
    ev({ cal: WORK, ref: 'standup_20261020T160000Z', title: 'Team stand-up', start: at(1, 9), end: at(1, 9, 30), meet, guests: [me, chris], organizer: me }),
    ev({ cal: WORK, ref: 'standup_20261021T160000Z', title: 'Team stand-up', start: at(2, 9), end: at(2, 9, 30), meet, guests: [me, chris], organizer: me }),
    ev({ cal: WORK, ref: 'standup_20261022T160000Z', title: 'Team stand-up', start: at(3, 9), end: at(3, 9, 30), meet, guests: [me, chris], organizer: me }),
    ev({
      cal: WORK, title: 'LumenPay discovery call', start: at(0, 11), end: at(0, 12), meet, guests: [me, ana, marco], organizer: me,
      recording: { id: 'rec-lumen-1', title: 'LumenPay discovery call' },
      description: 'Walk through their payout reconciliation and where the finance team loses a day each week.',
    }),
    ev({ cal: GMAIL, title: 'Gym', start: at(0, 7), end: at(0, 8), location: 'Equinox Sports Club' }),
    ev({ cal: GMAIL, title: 'Gym', start: at(2, 7), end: at(2, 8), location: 'Equinox Sports Club' }),
    ev({
      cal: OUTLOOK, title: 'Board prep with Priya', start: at(1, 10), end: at(1, 11), meet: teams, guests: [priya, me], organizer: priya,
      editable: false, link: 'https://outlook.office.com/calendar/view/week', hasBrief: true,
    }),
    ev({ cal: WORK, title: 'Pricing review', start: at(1, 10, 30), end: at(1, 11, 30), location: 'Office · Room 2', guests: [me, chris], organizer: me }),
    ev({ cal: GMAIL, title: 'Lunch with Carlos', start: at(1, 12, 30), end: at(1, 13, 30), location: 'Tartine Manufactory, 595 Alabama St' }),
    ev({
      cal: WORK, ref: 'acme-onb', title: 'Acme Realty — onboarding', start: at(3, 15), end: at(3, 16), meet, guests: [me, dana], organizer: me, hasBrief: true,
      description: 'Set up their 6 agents with pens. Bring the Spanish quick-start.',
    }),
    ev({ cal: OUTLOOK, title: 'Northwind portfolio sync', start: at(2, 11), end: at(2, 12), meet: teams, guests: [priya, me], organizer: priya, editable: false, declined: true, link: 'https://outlook.office.com/calendar/view/week' }),
    ev({ cal: WORK, title: 'Deep work: calendar page', start: at(2, 13), end: at(2, 16), juno: true }),
    ev({ cal: WORK, title: 'Ship review', start: at(2, 14), end: at(2, 14, 45), guests: [me, chris], organizer: me, meet }),
    ev({ cal: GMAIL, title: 'Dentist', start: at(3, 8), end: at(3, 8, 45), location: 'Dr. Lee, 450 Sutter St' }),
    ev({ cal: OUTLOOK, title: 'Investor update call', start: at(3, 14), end: at(3, 14, 30), meet: teams, guests: [priya, me], organizer: priya, editable: false, link: 'https://outlook.office.com/calendar/view/week' }),
    ev({ cal: WORK, ref: 'lumen-fu', title: 'LumenPay follow-up', start: at(4, 10), end: at(4, 10, 45), meet, guests: [me, ana], organizer: me, hasBrief: true }),
    ev({ cal: GMAIL, title: 'Dinner at Mom’s', start: at(4, 19), end: at(4, 21) }),
    ev({ cal: GMAIL, title: 'Half Moon Bay', start: date(5), end: date(7), allDay: true }),
    ev({ cal: WORK, title: 'Q4 planning week', start: date(0), end: date(3), allDay: true, guests: [me, chris], organizer: me }),
    ev({ cal: GMAIL, title: 'Late flight to NYC', start: at(6, 22), end: at(7, 6, 30), location: 'SFO Terminal 2' }),
    // Next week
    ev({ cal: WORK, title: 'Team stand-up', start: at(7, 9), end: at(7, 9, 30), meet, guests: [me, chris], organizer: me }),
    ev({ cal: OUTLOOK, title: 'Board meeting', start: at(8, 13), end: at(8, 15), location: 'Northwind, 1 Market St', guests: [priya, me], organizer: priya, editable: false, hasBrief: true, link: 'https://outlook.office.com/calendar/view/week' }),
    ev({ cal: WORK, title: 'Acme Realty check-in', start: at(9, 11), end: at(9, 11, 30), meet, guests: [me, dana], organizer: me }),
    ev({ cal: GMAIL, title: 'Haircut', start: at(10, 17), end: at(10, 17, 45) }),
    ev({ cal: WORK, title: 'Month close', start: date(11), end: date(12), allDay: true }),
    // Last week (for month view)
    ev({ cal: WORK, title: 'Customer interviews', start: at(-4, 10), end: at(-4, 12), recording: { id: 'rec-int-1', title: 'Customer interviews' } }),
    ev({ cal: GMAIL, title: 'Climbing', start: at(-2, 9), end: at(-2, 11) }),
  ]

  return {
    calendars: [
      { key: GMAIL, address: 'agustin.volante@gmail.com', provider: 'google', broken: false, isDefault: false },
      { key: WORK, address: 'agustin@tryjunoapp.com', provider: 'google', broken: false, isDefault: true },
      { key: OUTLOOK, address: 'avolante@northwind-advisors.com', provider: 'outlook', broken: false, isDefault: false },
      { key: BROKEN, address: 'agustin@caerusai.com', provider: 'outlook', broken: true, isDefault: false },
    ],
    events,
    todos: [
      { ref: 'rec-lumen-1#0', sessionId: 'rec-lumen-1', text: 'Send Ana the reconciliation demo', date: date(1), done: true },
      { ref: 'rec-lumen-1#1', sessionId: 'rec-lumen-1', text: 'Draft LumenPay pilot terms', date: date(3), done: false },
      { ref: 'rec-int-1#0', sessionId: 'rec-int-1', text: 'Write up interview notes for Chris', date: date(2), done: false },
    ],
    reminders: [
      { id: 'r1', text: 'Call Ana about the pilot', dueAt: at(1, 16, 30), sent: false },
      { id: 'r2', text: 'Book flights for the offsite', dueAt: at(3, 11, 30), sent: false },
    ],
    failed: [],
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

export function mockBrief(ref: string): CalBrief {
  if (ref.startsWith('acme-onb|')) {
    return {
      people: [
        {
          name: 'Dana Kim',
          email: dana.email,
          lastCall: { sessionId: 'rec-acme-0', date: new Date(Date.now() - 9 * 86_400_000).toISOString(), title: 'Acme Realty intro', summary: 'Six agents, mostly Spanish-speaking clients. Wants recordings to land in their CRM notes; worried about consent wording for open houses.' },
          youOwe: ['Spanish quick-start guide', 'Consent script for open houses'],
          theyOwe: ['List of the six agents’ emails'],
        },
      ],
    }
  }
  if (ref.startsWith('lumen-fu|')) {
    return {
      people: [
        {
          name: 'Ana Souza',
          email: ana.email,
          lastCall: { sessionId: 'rec-lumen-1', date: new Date(Date.now() - 86_400_000).toISOString(), title: 'LumenPay discovery call', summary: 'Finance loses a day a week matching payouts. Ana owns the budget; Marco is sceptical about another tool.' },
          youOwe: ['Draft pilot terms'],
          theyOwe: ['Sample payout export'],
        },
      ],
    }
  }
  return { people: [{ name: 'Priya Natarajan', email: priya.email, lastCall: null, youOwe: [], theyOwe: [] }] }
}
