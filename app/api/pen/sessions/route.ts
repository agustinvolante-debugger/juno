import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { createSession, listSessions } from '@/lib/pen/store'

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
    return NextResponse.json({ session, duplicate })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
