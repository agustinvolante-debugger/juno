import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { isMissingSchema } from '@/lib/pen/allowance'
import { dismissSplit, finishSplit, joinBack, openSplit, performSplit } from '@/lib/pen/split-server'

export const dynamic = 'force-dynamic'
// "Join back" rewrites the notes over the whole recording before it answers.
export const maxDuration = 300

// One recording, two meetings (lib/pen/split.ts, lib/pen/split-server.ts).
//
//   GET  ?session=<id>                          the open suggestion for that recording, or null
//   POST { action: 'accept', id }               split where the suggestion says
//   POST { action: 'split', session, cuts }     split at these seconds ("Split here")
//   POST { action: 'dismiss', id }              "No, it's one": never suggested again
//   POST { action: 'join_back', session }       the parts become one joined recording again
//
// A split answers as soon as the rows exist, each part 'noting'; the notes for each part are
// written after the response (the page polls 'noting' recordings until they are written).

const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('session') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ error: 'session required' }, { status: 400 })
  try {
    return NextResponse.json({ suggestion: await openSplit(email, id) })
  } catch (e) {
    const msg = (e as Error).message
    if (isMissingSchema(msg)) return NextResponse.json({ suggestion: null })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; session?: string; cuts?: unknown }

  if (b.action === 'dismiss') {
    if (!b.id || !UUID.test(b.id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
    return NextResponse.json({ ok: await dismissSplit(email, b.id) })
  }

  if (b.action === 'join_back') {
    if (!b.session || !UUID.test(b.session)) return NextResponse.json({ error: 'session required' }, { status: 400 })
    const r = await joinBack(email, b.session)
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status })
  }

  let session = b.session ?? ''
  let cuts: number[] = Array.isArray(b.cuts) ? b.cuts.map(Number).filter(Number.isFinite).slice(0, 8) : []
  let titles: (string | null)[] | undefined
  let suggestionId: string | null = null
  if (b.action === 'accept') {
    if (!b.id || !UUID.test(b.id) || !b.session || !UUID.test(b.session)) return NextResponse.json({ error: 'id and session required' }, { status: 400 })
    const s = await openSplit(email, b.session)
    if (!s || s.id !== b.id) return NextResponse.json({ error: 'That suggestion is gone; the recording may have changed.' }, { status: 409 })
    session = s.sessionId
    cuts = s.hint.cuts
    titles = s.hint.parts.map((p) => p.title)
    suggestionId = s.id
  } else if (b.action !== 'split') {
    return NextResponse.json({ error: 'action must be accept, split, dismiss or join_back' }, { status: 400 })
  }
  if (!UUID.test(session) || !cuts.length) return NextResponse.json({ error: 'session and cuts required' }, { status: 400 })

  const r = await performSplit(email, session, cuts, { titles, suggestionId })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  after(() => finishSplit(email, r).catch((e) => console.warn(`pen split: finish: ${(e as Error).message}`)))
  return NextResponse.json({ ok: true, parts: r.parts })
}
