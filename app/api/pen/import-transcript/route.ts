import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { pausedRefusal } from '@/lib/pen/pause'
import { getAllowance } from '@/lib/pen/allowance'
import { importText, MAX_CHARS } from '@/lib/pen/import-text'

export const dynamic = 'force-dynamic'
// Notes are written in after(): about a minute on a long transcript.
export const maxDuration = 300

// "Import a transcript": text from another recorder (Pocket's free plan exports text only,
// Otter, Plaud) or a subtitle file, turned into a recording with notes, search and people.
// The work itself is lib/pen/import-text.ts, shared with "Import from Notion".
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Paused: the service is off. Reading stays open; adding doesn't.
  const paused = await pausedRefusal(email)
  if (paused) return NextResponse.json({ error: paused }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const text = typeof b.text === 'string' ? b.text : ''
  if (!text.trim()) return NextResponse.json({ error: 'Paste a transcript or choose a file.' }, { status: 400 })
  if (text.length > MAX_CHARS) return NextResponse.json({ error: 'That transcript is too long to import in one go. Split it into parts.' }, { status: 400 })
  // Same rule as a recording: the people in it agreed to being recorded.
  if (b.consent !== true) return NextResponse.json({ error: 'Confirm that everyone agreed to be recorded.' }, { status: 400 })

  const allowance = await getAllowance(email)
  if (!allowance.canProcess) return NextResponse.json({ error: 'You have no recording hours left this month.' }, { status: 402 })

  try {
    return NextResponse.json(
      await importText(email, {
        text,
        title: typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 90) : null,
        sourceName: typeof b.source_name === 'string' && b.source_name.trim() ? b.source_name.trim().slice(0, 200) : `Imported transcript ${new Date().toISOString().slice(0, 10)}`,
        people: Array.isArray(b.people) ? (b.people as { id?: unknown; name?: unknown }[]) : [],
      }),
    )
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
