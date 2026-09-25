import { getProfile } from '@/lib/pen/profile'
import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession } from '@/lib/pen/store'
import { cleanAbout, cleanEmail, cleanName, enrichPerson, linkPerson, listPeople, peopleOnSession, suggestionsFrom, updatePerson, upsertByName } from '@/lib/pen/people'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** People on one recording, plus who the notes heard but nobody has added yet. */
async function forSession(email: string, sessionId: string) {
  const session = await getSession(email, sessionId)
  if (!session) return null
  const people = await peopleOnSession(email, sessionId)
  // The user's own name, for the transcript's "Who's who" menu ("You (Agustín)").
  const me = (await getProfile(email).catch(() => ({ name: undefined }))).name ?? null
  return { people, suggestions: suggestionsFrom(session.notes, people), me }
}

// GET ?session=<id>  the recording page's People section
// GET                everyone, for the @ picker
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sessionId = new URL(req.url).searchParams.get('session')
  try {
    if (sessionId) {
      const out = await forSession(email, sessionId)
      return out ? NextResponse.json(out) : NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ people: await listPeople(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Adds someone to a recording, creating them if the name is new.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { sessionId?: string; name?: unknown; email?: unknown; about?: unknown }
  const name = cleanName(b.name)
  if (!b.sessionId || !name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
  const given = b.email === undefined || b.email === '' ? null : cleanEmail(b.email)
  if (b.email && !given) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })

  try {
    const session = await getSession(email, b.sessionId)
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const person = await upsertByName(email, name, given)
    await linkPerson(email, session.id, person.id, 'user')
    const about = cleanAbout(b.about)
    if (about) await updatePerson(email, person.id, { about })
    // The card fills in after the response; the next time the section loads it is there.
    after(() => enrichPerson(email, person.id).catch((e) => console.warn(`pen: enrich ${person.id}: ${(e as Error).message}`)))
    return NextResponse.json(await forSession(email, session.id))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
