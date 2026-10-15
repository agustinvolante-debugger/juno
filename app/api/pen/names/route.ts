import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession, type PenSession } from '@/lib/pen/store'
import { getProfile } from '@/lib/pen/profile'
import { mentionsFor, scanNames, searchMentions } from '@/lib/pen/names'
import { supabaseAdmin } from '@/lib/supabase'
import { displayName } from '@/lib/pen/name-hints'
import { segmentsFor, splitEvent, confirmName } from '@/lib/pen/conference'
import { cleanName, enrichPerson, linkPerson, upsertByName } from '@/lib/pen/people'
import { readOnlyRefusal } from '@/lib/pen/access'
import { foldName, isSelfName, type SpeakerMap } from '@/lib/pen/speakers'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f-]{36}$/i

/** Names heard and conversations for one or more recordings (a joined meeting's parts). */
async function payload(email: string, sessions: PenSession[]) {
  const ids = sessions.map((s) => s.id)
  const [mentions, segments, profile] = await Promise.all([
    mentionsFor(email, ids),
    segmentsFor(email, ids),
    getProfile(email).catch(() => ({ name: undefined })),
  ])
  return {
    me: profile.name ?? null,
    recordings: Object.fromEntries(sessions.map((s) => [s.id, {
      names_at: s.names_at ?? null,
      segments_at: s.segments_at ?? null,
      event_mode: s.event_mode === true,
      mentions: mentions[s.id] ?? [],
      segments: segments[s.id] ?? [],
    }])),
  }
}

async function owned(email: string, ids: string[]): Promise<PenSession[]> {
  const out: PenSession[] = []
  for (const id of Array.from(new Set(ids.filter((x) => UUID.test(x)))).slice(0, 12)) {
    const s = await getSession(email, id)
    if (s) out.push(s)
  }
  return out
}

// GET ?ids=<id>,<id>   names heard + conversations per recording
// GET ?q=<word>        names heard across every recording, for the People search
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q) return NextResponse.json({ heard: await heardAcross(email, q) })
  const ids = (url.searchParams.get('ids') ?? '').split(',')
  const sessions = await owned(email, ids)
  if (!sessions.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(await payload(email, sessions))
}

// POST { action, ids | id, ... }
//   scan     find names on each recording (backfill for old ones)
//   split    "This was an event": names if missing, then the conversations
//   confirm  { id, segment, name, personId? }  this conversation was with … ('' clears)
//   speaker  { id, label, name }  Who's who from a suggestion: names the voice, saves the contact
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const refused = await readOnlyRefusal(email)
  if (refused) return NextResponse.json({ error: refused }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as {
    action?: string; ids?: string[]; id?: string; segment?: string; name?: string; personId?: string | null; label?: string
  }
  const sessions = await owned(email, b.ids ?? (b.id ? [b.id] : []))
  if (!sessions.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    // Every part at once: a 7-hour event is 7 files, and one after another (~30 s each) came
    // close to the 300 s limit. Each part reads its neighbour's transcript, not its result, so
    // they don't depend on each other.
    if (b.action === 'scan') {
      await Promise.all(sessions.map((s) => scanNames(email, s)))
    } else if (b.action === 'split') {
      // Every part of the meeting at once (lib/pen/conference.ts splitEvent).
      // One call per meeting, not per part: splitEvent already covers all of a meeting's parts.
      const meetings = sessions.filter((s, i) => !s.merge_group || sessions.findIndex((x) => x.merge_group === s.merge_group) === i)
      const ok = await Promise.all(meetings.map((s) => splitEvent(email, s)))
      if (ok.some((x) => !x)) return NextResponse.json({ error: 'Could not split this recording. Try again in a minute.' }, { status: 502 })
    } else if (b.action === 'confirm') {
      const s = sessions[0]
      if (!b.segment || !UUID.test(b.segment)) return NextResponse.json({ error: 'bad segment' }, { status: 400 })
      const seg = await confirmName(email, s, b.segment, b.name ?? '', b.personId && UUID.test(b.personId) ? b.personId : null)
      if (!seg) return NextResponse.json({ error: 'not found' }, { status: 404 })
      if (seg.person_id) after(() => enrichPerson(email, seg.person_id!).catch(() => {}))
    } else if (b.action === 'speaker') {
      const s = sessions[0]
      const label = String(b.label ?? '').trim()
      const name = cleanName(b.name)
      if (!name || !(s.transcript?.utterances ?? []).some((u) => u.speaker === label)) {
        return NextResponse.json({ error: 'A name and a speaker are required.' }, { status: 400 })
      }
      const person = await upsertByName(email, name)
      await linkPerson(email, s.id, person.id, 'user')
      const map: SpeakerMap = { ...((s.speaker_map ?? {}) as SpeakerMap) }
      // Same rule as the WhatsApp name_speaker: a second voice given a name another voice has
      // is that voice, split in two by the transcriber.
      const twin = Object.entries(map).find(([l, e]) => l !== label && !e.same_as && e.name && foldName(e.name) === foldName(person.name))
      map[label] = twin
        ? { name: '', person_id: null, same_as: twin[0], source: 'user' }
        : { name: person.name, person_id: person.id, source: 'user' }
      await updateSession(s.id, { speaker_map: map })
      after(() => enrichPerson(email, person.id).catch(() => {}))
      return NextResponse.json({ speaker_map: map, person: { id: person.id, name: person.name } })
    } else {
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }
    return NextResponse.json(await payload(email, await owned(email, sessions.map((s) => s.id))))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * "Dimitri" typed in People: everyone of that name said in any recording, grouped by name, each
 * with where and when, newest recording first. The user's own name is left out.
 */
async function heardAcross(email: string, q: string) {
  if (q.length < 2) return []
  const hits = await searchMentions(email, q, 200, { namesOnly: true })
  if (!hits.length) return []
  const ids = Array.from(new Set(hits.map((h) => h.session_id)))
  const { data } = await supabaseAdmin.from('pen_sessions').select('id,title,source_name,recorded_at,created_at,merge_group,merge_index').eq('user_email', email).in('id', ids)
  type Row = { id: string; title: string | null; source_name: string | null; recorded_at: string | null; created_at: string; merge_group: string | null; merge_index: number | null }
  const rows = (data ?? []) as Row[]
  // A later part of a joined meeting opens, and is named as, the meeting's first part.
  const groupsWanted = Array.from(new Set(rows.filter((r) => r.merge_group && (r.merge_index ?? 0) > 0).map((r) => r.merge_group!)))
  const heads = new Map<string, Row>()
  if (groupsWanted.length) {
    const { data: hs } = await supabaseAdmin.from('pen_sessions').select('id,title,source_name,recorded_at,created_at,merge_group,merge_index').eq('user_email', email).in('merge_group', groupsWanted).eq('merge_index', 0)
    for (const h of (hs ?? []) as Row[]) heads.set(h.merge_group!, h)
  }
  const byId = new Map(rows.map((r) => [r.id, (r.merge_group && (r.merge_index ?? 0) > 0 && heads.get(r.merge_group)) || r]))
  const me = (await getProfile(email).catch(() => ({ name: undefined }))).name ?? null
  const groups = new Map<string, { name: string; count: number; moments: { session_id: string; title: string; when: string; at_sec: number; context: string | null }[] }>()
  for (const h of hits) {
    const r = byId.get(h.session_id)
    if (!r || isSelfName(h.name, me)) continue
    const k = foldName(h.name)
    const g = groups.get(k) ?? { name: displayName(h.name), count: 0, moments: [] }
    g.count++
    if (g.moments.length < 6 && !g.moments.some((m) => m.session_id === r.id)) {
      g.moments.push({ session_id: r.id, title: r.title || r.source_name || 'Untitled', when: r.recorded_at ?? r.created_at, at_sec: h.at_sec, context: h.context })
    }
    groups.set(k, g)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, moments: g.moments.sort((a, b) => b.when.localeCompare(a.when)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
}
