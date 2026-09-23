import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { createSession, listSessions } from '@/lib/pen/store'
import { linkPerson, ownedPeople, upsertByName } from '@/lib/pen/people'

export const dynamic = 'force-dynamic'

export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ sessions: await listSessions(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Called after the browser has finished uploading to storage.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const storage_path = typeof b.storage_path === 'string' ? b.storage_path : ''
  const source_name = typeof b.source_name === 'string' ? b.source_name : ''
  const bytes = typeof b.bytes === 'number' ? b.bytes : 0
  if (!storage_path || !source_name || !bytes) {
    return NextResponse.json({ error: 'storage_path, source_name and bytes required' }, { status: 400 })
  }

  // Fla. Stat. § 934.03 is all-party consent and a third-degree felony, and he is a licensed
  // agent, so the downside is his licence. This is refused rather than defaulted.
  if (b.consent !== true) {
    return NextResponse.json({ error: 'consent must be confirmed before a recording is stored' }, { status: 400 })
  }

  try {
    const { session, duplicate } = await createSession({
      user_email: email,
      storage_path,
      source_name,
      mime: typeof b.mime === 'string' ? b.mime : 'audio/webm',
      bytes,
      duration_sec: typeof b.duration_sec === 'number' ? Math.round(b.duration_sec) : null,
      recorded_at: typeof b.recorded_at === 'string' ? b.recorded_at : null,
      consent: true,
      title: typeof b.title === 'string' ? b.title : null,
      client_name: typeof b.client_name === 'string' ? b.client_name : null,
    })
    // "Who was this call?" at import puts those people on the call. `people` is the picker:
    // existing contacts by id, new ones by name. Older clients send one name as client_name.
    // Never fails the upload: the recording matters more than the contact list.
    if (!duplicate) {
      const picked = Array.isArray(b.people) ? (b.people as { id?: unknown; name?: unknown }[]).slice(0, 12) : []
      const who = typeof b.client_name === 'string' ? b.client_name.trim() : ''
      try {
        const known = await ownedPeople(email, picked.flatMap((p) => (typeof p?.id === 'string' ? [p.id] : [])))
        for (const p of known) await linkPerson(email, session.id, p.id, 'import')
        const names = picked.flatMap((p) => (typeof p?.id !== 'string' && typeof p?.name === 'string' && p.name.trim() ? [p.name] : []))
        if (!picked.length && who) names.push(who)
        for (const n of names) {
          const person = await upsertByName(email, n)
          await linkPerson(email, session.id, person.id, 'import')
        }
      } catch (e) {
        console.warn(`pen: could not link people to ${session.id}: ${(e as Error).message}`)
      }
    }
    return NextResponse.json({ session, duplicate })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
