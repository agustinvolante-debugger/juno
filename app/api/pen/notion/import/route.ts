import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { pausedRefusal } from '@/lib/pen/pause'
import { getAllowance } from '@/lib/pen/allowance'
import { importText, MAX_CHARS } from '@/lib/pen/import-text'
import { readMeeting } from '@/lib/pen/notion-import'
import { autoToNotion } from '@/lib/pen/notion'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Imports one Notion AI Meeting Note's transcript as a Juno recording, then Juno writes its own
// notes from it (and, if Notion sending is on, adds them to the "Juno Pen notes" table).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const paused = await pausedRefusal(email)
  if (paused) return NextResponse.json({ error: paused }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; consent?: boolean; people?: { id?: unknown; name?: unknown }[] }
  if (!b.id || !/^[0-9a-f-]{32,36}$/i.test(b.id)) return NextResponse.json({ error: 'Pick a meeting.' }, { status: 400 })
  if (b.consent !== true) return NextResponse.json({ error: 'Confirm that everyone agreed to be recorded.' }, { status: 400 })

  // Imported before: open that one instead of making a copy.
  const storagePath = `text:notion:${b.id}`
  const prior = await supabaseAdmin.from('pen_sessions').select('id').eq('user_email', email).eq('storage_path', storagePath).limit(1).maybeSingle()
  if (prior.data?.id) return NextResponse.json({ id: prior.data.id, existing: true })

  const allowance = await getAllowance(email)
  if (!allowance.canProcess) return NextResponse.json({ error: 'You have no recording hours left this month.' }, { status: 402 })

  try {
    const m = await readMeeting(email, b.id)
    if (!m.text.trim()) return NextResponse.json({ error: 'Notion has no transcript for that meeting. If it says no audio was captured, it recorded silence.' }, { status: 400 })
    if (m.text.length > MAX_CHARS) return NextResponse.json({ error: 'That transcript is too long to import in one go.' }, { status: 400 })
    return NextResponse.json(
      await importText(email, {
        text: m.text,
        title: m.title.slice(0, 90),
        sourceName: `Notion: ${m.title}`.slice(0, 200),
        people: Array.isArray(b.people) ? b.people : [],
        recordedAt: m.start,
        durationSec: m.seconds,
        storagePath,
        afterNotes: (s) => autoToNotion(email, s),
      }),
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}
