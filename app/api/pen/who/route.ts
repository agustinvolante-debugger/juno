import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { confirmWho, skipWho, whoCards } from '@/lib/pen/who-server'
import { enrichPerson } from '@/lib/pen/people'

export const dynamic = 'force-dynamic'

// "Who was here?" (22 Oct, lib/pen/who.ts).
//   GET                 Home's cards: recent written-up recordings nobody has said who was on
//   GET ?ids=<id>,<id>  the review after a multi-file upload: those recordings, in that order
//   POST { action: 'confirm', id, people: [{ personId } | { name }] }  Save: links them as the user's
//   POST { action: 'skip', id }                                          Skip: don't ask again
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const raw = new URL(req.url).searchParams.get('ids')
  try {
    return NextResponse.json(await whoCards(email, raw ? raw.split(',') : undefined))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const refused = await readOnlyRefusal(email)
  if (refused) return NextResponse.json({ error: refused }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; people?: unknown }
  if (typeof b.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    if (b.action === 'skip') {
      const r = await skipWho(email, b.id)
      return r ? NextResponse.json({ ok: true, ...r }) : NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    if (b.action === 'confirm') {
      const people = (Array.isArray(b.people) ? b.people : []).map((p) => {
        const x = (p ?? {}) as { personId?: unknown; name?: unknown }
        return { personId: typeof x.personId === 'string' ? x.personId : null, name: typeof x.name === 'string' ? x.name : null }
      })
      const r = await confirmWho(email, b.id, people)
      // A new recording each of them was on: their contact cards are rewritten after the answer.
      if (r?.people.length) after(() => Promise.all(r.people.map((p) => enrichPerson(email, p.id).catch(() => {}))))
      return r ? NextResponse.json({ ok: true, ...r }) : NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
