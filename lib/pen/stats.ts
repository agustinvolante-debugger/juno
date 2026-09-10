// Archive-wide stats. Two audiences, one query surface:
//
//   archiveStats()  — what the USER sees. The point is not vanity metrics: it is that the
//                     value visibly accumulates. Outstanding actions across every recording
//                     is the number that makes someone open this on a Monday.
//
//   ownerRollup()   — what AGUSTIN sees. page_views already exists but only answers "did
//                     someone load the page". This answers "did they actually record
//                     anything, and did they come back", derived from pen_sessions with no
//                     new tables.
import { supabaseAdmin } from '@/lib/supabase'
import { slugType, displayType } from './store'
import type { PenNotes, MeetingType } from './store'

export type OpenAction = {
  sessionId: string
  sessionTitle: string
  when: string
  action: string
  owner: string
  due: string
  priority: 'high' | 'normal' | 'low'
}

export type ClientCard = {
  name: string
  showings: number
  profile: {
    must_haves?: string[]
    dealbreakers?: string[]
    revealed_criteria?: string[]
    budget_signals?: string[]
    open_questions?: string[]
  }
  updatedAt: string | null
}

export type ArchiveStats = {
  recordings: number
  minutes: number
  transcribedMinutes: number
  actionsTotal: number
  actionsOpen: number
  missedSurfaced: number
  peopleMet: number
  /** One row per distinct category, newest-first by last use. Drives the left nav. */
  categories: { slug: string; label: string; count: number }[]
  openActions: OpenAction[]
  clients: ClientCard[]
  firstAt: string | null
  lastAt: string | null
}

type Row = {
  id: string
  title: string | null
  status: string
  duration_sec: number | null
  meeting_type: MeetingType | null
  notes: PenNotes
  action_done: number[] | null
  recorded_at: string | null
  created_at: string
}

export async function archiveStats(userEmail: string): Promise<ArchiveStats> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,status,duration_sec,meeting_type,notes,action_done,recorded_at,created_at')
    .eq('user_email', userEmail)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]

  const cats = new Map<string, { slug: string; label: string; count: number }>()
  const people = new Set<string>()
  const openActions: OpenAction[] = []
  let minutes = 0
  let transcribedMinutes = 0
  let actionsTotal = 0
  let actionsOpen = 0
  let missedSurfaced = 0

  for (const r of rows) {
    const mins = (r.duration_sec ?? 0) / 60
    minutes += mins
    if (r.status === 'transcribed' || r.status === 'noted') transcribedMinutes += mins
    // Group by slug, display the first label seen for it.
    const label = displayType(r.meeting_type) || 'Uncategorised'
    const slug = slugType(label) || 'uncategorised'
    const cur = cats.get(slug)
    if (cur) cur.count += 1
    else cats.set(slug, { slug, label, count: 1 })

    const n = r.notes ?? {}
    missedSurfaced += n.missed?.length ?? 0
    for (const p of n.people ?? []) {
      // Names only. A role like "buyer" is not a person and would inflate the count.
      if (p.name?.trim()) people.add(p.name.trim().toLowerCase())
    }

    const done = new Set(Array.isArray(r.action_done) ? r.action_done : [])
    const acts = n.actions ?? []
    actionsTotal += acts.length
    acts.forEach((a, i) => {
      if (done.has(i)) return
      actionsOpen += 1
      openActions.push({
        sessionId: r.id,
        sessionTitle: r.title ?? 'Untitled',
        when: r.recorded_at ?? r.created_at,
        action: a.action,
        owner: a.owner ?? '',
        due: a.due ?? '',
        priority: a.priority ?? 'normal',
      })
    })
  }

  // High priority first, then oldest — an action you owed two weeks ago outranks today's.
  const rank = { high: 0, normal: 1, low: 2 } as const
  openActions.sort((a, b) => rank[a.priority] - rank[b.priority] || a.when.localeCompare(b.when))

  const { data: clientRows } = await supabaseAdmin
    .from('pen_clients')
    .select('name,profile,showings,updated_at')
    .eq('user_email', userEmail)
    .order('updated_at', { ascending: false })

  const clients: ClientCard[] = (clientRows ?? [])
    .map((c) => ({
      name: c.name as string,
      showings: (c.showings as number) ?? 0,
      profile: (c.profile as ClientCard['profile']) ?? {},
      updatedAt: (c.updated_at as string) ?? null,
    }))
    // A card needs something actually LEARNED. open_questions alone means the profile knows
    // only what it doesn't know, which is honest but not worth a card.
    .filter((c) =>
      [c.profile.must_haves, c.profile.dealbreakers, c.profile.revealed_criteria, c.profile.budget_signals]
        .some((v) => Array.isArray(v) && v.length),
    )

  const stamps = rows.map((r) => r.recorded_at ?? r.created_at).sort()

  return {
    recordings: rows.length,
    minutes: Math.round(minutes),
    transcribedMinutes: Math.round(transcribedMinutes),
    actionsTotal,
    actionsOpen,
    missedSurfaced,
    peopleMet: people.size,
    categories: Array.from(cats.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    openActions: openActions.slice(0, 40),
    clients,
    firstAt: stamps[0] ?? null,
    lastAt: stamps[stamps.length - 1] ?? null,
  }
}

/* ------------------------------------------------------------ owner view */

export type OwnerRow = {
  email: string
  recordings: number
  minutes: number
  noted: number
  briefingsSent: number
  chatTurns: number
  firstAt: string
  lastAt: string
  daysActive: number
}

/** Per-account rollup. Answers the only question that matters at this stage: did they come back. */
export async function ownerRollup(): Promise<OwnerRow[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('user_email,duration_sec,status,briefing_sent_at,chat,created_at')
  if (error) throw new Error(error.message)

  const acc = new Map<string, OwnerRow & { days: Set<string> }>()
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const email = String(r.user_email)
    const created = String(r.created_at)
    if (!acc.has(email)) {
      acc.set(email, {
        email, recordings: 0, minutes: 0, noted: 0, briefingsSent: 0, chatTurns: 0,
        firstAt: created, lastAt: created, daysActive: 0, days: new Set(),
      })
    }
    const a = acc.get(email)!
    a.recordings += 1
    a.minutes += (Number(r.duration_sec) || 0) / 60
    if (r.status === 'noted') a.noted += 1
    if (r.briefing_sent_at) a.briefingsSent += 1
    a.chatTurns += Array.isArray(r.chat) ? (r.chat as unknown[]).length : 0
    if (created < a.firstAt) a.firstAt = created
    if (created > a.lastAt) a.lastAt = created
    a.days.add(created.slice(0, 10))
  }

  return Array.from(acc.values())
    .map(({ days, ...row }) => ({ ...row, minutes: Math.round(row.minutes), daysActive: days.size }))
    .sort((x, y) => y.lastAt.localeCompare(x.lastAt))
}
