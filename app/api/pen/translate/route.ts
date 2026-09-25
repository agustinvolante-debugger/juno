import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession } from '@/lib/pen/store'
import { translateTranscript } from '@/lib/pen/aai'
import { LANGUAGES } from '@/lib/pen/profile-fields'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// "Translate transcript" on a recording. On demand only (+$0.06 per recorded hour), stored on
// the recording so opening it again costs nothing. DELETE drops it.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; lang?: string }
  const lang = LANGUAGES.find((l) => l.code === b.lang)?.code
  if (!b.id || !lang) return NextResponse.json({ error: 'id and a supported lang required' }, { status: 400 })
  const session = await getSession(email, b.id)
  if (!session?.aai_id) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (session.translation?.lang === lang) return NextResponse.json({ translation: session.translation })
  try {
    const lines = await translateTranscript(session.aai_id, lang)
    // Line up with our transcript; a count mismatch means the two copies differ, so refuse
    // rather than put a translation beside the wrong line.
    if (lines.length !== (session.transcript?.utterances?.length ?? 0)) {
      return NextResponse.json({ error: 'The translation did not line up with the transcript. Try again.' }, { status: 502 })
    }
    const translation = { lang, utterances: lines }
    await updateSession(session.id, { translation })
    return NextResponse.json({ translation })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  const session = id ? await getSession(email, id) : null
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await updateSession(session.id, { translation: null })
  return NextResponse.json({ ok: true })
}
