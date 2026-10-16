// "Next from Juno" on Home: the next message Juno will send this user first, so the web shows
// the bridge to WhatsApp ("Tomorrow 8:00 I'll message you about ...") instead of leaving it a
// surprise (critique 16 Oct, P1).
//
// A light read, not a dry run of the scheduler: the candidates proactive.ts would send, at the
// clock time it would send them, in the user's zone. It ignores the daily max and the hour gap
// (they can only push a message later, never cancel it), so it is a good guess, not a promise.
//
//   reminder      pen_reminders not yet sent: at its due time
//   meeting       an accepted meeting offer in the next 7 days: its brief at 18:00 the evening
//                 before, or 8:00 on the day when the evening has passed
//   todo          the user's own dated to-dos: 7:30 that day (the morning brief carries them) or
//                 9:00 (the nudge) when the morning brief is switched off

import { supabaseAdmin } from '@/lib/supabase'
import { getPrefs, kindOn, localParts, zonedTime, zoneFor, QUIET, type ProactivePrefs } from './proactive'
import { pendingReminders } from './reminders'
import type { OpenAction } from './stats'
import { isMine } from './todo-labels'

export type NextUp = {
  kind: 'reminder' | 'meeting' | 'todo'
  /** When Juno will write, ISO. */
  at: string
  /** The zone the time is shown in. */
  tz: string
  /** What it is about: the reminder's words, the person met, the to-do. */
  about: string
}

const DAY = 86_400_000

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '')

export async function nextFromJuno(email: string, phone: string | null | undefined, openActions: OpenAction[], now = new Date()): Promise<NextUp | null> {
  const tz = await zoneFor(email, phone)
  // No known zone: nothing goes out on a clock (proactive.ts), so there is nothing to promise.
  if (!tz) return null
  const prefs: ProactivePrefs = await getPrefs(email).catch(() => ({}))
  const t = now.getTime()
  const out: NextUp[] = []

  // Reminders the user asked for go regardless of the proactive switch.
  for (const r of await pendingReminders(email).catch(() => [])) {
    if (Date.parse(r.due_at) > t) { out.push({ kind: 'reminder', at: r.due_at, tz, about: clean(r.text) }); break }
  }

  {
    if (kindOn(prefs, 'meeting_brief')) {
      const { data } = await supabaseAdmin
        .from('pen_suggestions')
        .select('person,title,detail,starts_at')
        .eq('user_email', email.toLowerCase())
        .eq('kind', 'meeting')
        .in('state', ['accepted', 'done'])
        .gte('starts_at', now.toISOString())
        .lt('starts_at', new Date(t + 7 * DAY).toISOString())
        .order('starts_at')
        .limit(5)
      for (const m of (data ?? []) as { person: string | null; title: string; detail: Record<string, unknown> | null; starts_at: string }[]) {
        const day = localParts(new Date(m.starts_at), tz).date
        const eve = zonedTime(addDays(day, -1), 18 * 60, tz).getTime()
        const morning = zonedTime(day, 8 * 60, tz).getTime()
        const at = eve > t ? eve : morning > t && morning < Date.parse(m.starts_at) ? morning : null
        const who = (m.person || (typeof m.detail?.with === 'string' ? (m.detail.with as string) : '') || m.title).trim()
        if (at) { out.push({ kind: 'meeting', at: new Date(at).toISOString(), tz, about: who }); break }
      }
    }

    const brief = kindOn(prefs, 'morning_brief')
    if (brief || kindOn(prefs, 'nudges')) {
      const today = localParts(now, tz).date
      const at = brief ? QUIET.start : 9 * 60
      const dated = openActions
        .filter((a) => isMine(a) && a.dueDate && a.dueDate >= today && a.dueDate <= addDays(today, 7))
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      for (const a of dated) {
        const when = zonedTime(a.dueDate!, at, tz).getTime()
        if (when > t) { out.push({ kind: 'todo', at: new Date(when).toISOString(), tz, about: clean(a.action) }); break }
      }
    }
  }

  out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return out[0] ?? null
}
