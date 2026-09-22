import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession, listSessions } from '@/lib/pen/store'
import { writeNotes } from '@/lib/pen/pipeline'
import { joinSegments, splitGroup, groupSessions, findRuns } from '@/lib/pen/merge'
import { sendBriefing, hasSomethingToSay } from '@/lib/pen/briefing'

export const dynamic = 'force-dynamic'
// Rewrites the notes over the combined transcript — the same Opus call the notes route makes.
export const maxDuration = 300

// Joining the halves of a recording the pen split at its 60-minute file limit.
//
// GET  — runs the detector and reports which recordings look like one meeting.
// POST — { action: 'join', ids } links them and rewrites the notes over the whole thing.
//        { action: 'split', group } undoes it.
//
// Nothing is destroyed either way: each segment keeps its own audio and its own transcript,
// so a join that reads badly is one button from being undone.

export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const runs = findRuns(await listSessions(email, 200))
  return NextResponse.json({
    runs: runs.map((r) => ({
      ids: r.sessions.map((s) => s.id),
      names: r.sessions.map((s) => s.source_name),
      totalSec: r.totalSec,
    })),
  })
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as {
    action?: string
    ids?: string[]
    group?: string
  }

  if (b.action === 'split') {
    if (!b.group) return NextResponse.json({ error: 'group required' }, { status: 400 })
    await splitGroup(email, b.group)
    return NextResponse.json({ ok: true })
  }

  const ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === 'string') : []
  if (ids.length < 2) return NextResponse.json({ error: 'pick at least two recordings' }, { status: 400 })

  // Load every one of them first: a join that silently dropped a segment it could not find
  // would produce notes missing a third of the meeting with nothing to show it happened.
  const rows = await Promise.all(ids.map((id) => getSession(email, id)))
  const missing = ids.filter((_, i) => !rows[i])
  if (missing.length) return NextResponse.json({ error: 'recording not found' }, { status: 404 })
  const sessions = rows.map((r) => r!)

  const untranscribed = sessions.filter((s) => !s.transcript?.utterances?.length && !s.transcript?.text)
  if (untranscribed.length) {
    return NextResponse.json(
      { error: 'every part has to finish transcribing before they can be joined' },
      { status: 409 },
    )
  }
  if (sessions.some((s) => s.merge_group)) {
    return NextResponse.json({ error: 'one of these is already part of a joined meeting' }, { status: 409 })
  }

  try {
    // Every part needs its own notes before the join: they are the coverage floor that stops
    // the tail of a long meeting being compressed out of the combined write-up. A part that
    // was never written up on its own — uploaded and left, or joined straight after
    // transcribing — gets written up here first.
    for (const s of sessions) {
      if (s.notes && Object.keys(s.notes).length) continue
      const r = await writeNotes({ email, session: s, claim: false })
      if (r === 'taken') return NextResponse.json({ error: 'notes are already being written' }, { status: 409 })
    }

    const group = await joinSegments(email, ids)
    const segments = await groupSessions(email, group)
    const primary = segments[0]

    // The parts may each have been briefed on their own. Clearing this lets one briefing go
    // out for the meeting as a whole, which is the thing the user actually wanted to read.
    await updateSession(primary.id, { briefing_sent_at: null })

    const fresh = await getSession(email, primary.id)
    const r = await writeNotes({ email, session: fresh!, claim: false })
    if (r === 'taken') return NextResponse.json({ error: 'notes are already being written' }, { status: 409 })

    const noted = r.session
    let briefed = false
    if (noted && hasSomethingToSay(noted)) {
      const sent = await sendBriefing({ session: noted, to: [email], replyTo: email, parts: segments.length })
      if (sent.ok) {
        await updateSession(primary.id, { briefing_sent_at: new Date().toISOString() })
        briefed = true
      }
    }

    return NextResponse.json({ group, primaryId: primary.id, briefed, session: noted })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
