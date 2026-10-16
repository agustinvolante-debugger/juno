import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { pausedRefusal } from '@/lib/pen/pause'
import { getAllowance } from '@/lib/pen/allowance'
import { GRANOLA_ID, importMany, listForPicker } from '@/lib/pen/granola-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Imports the picked Granola meetings (or every one from the last 30 days not yet in Juno) in the
// background, two at a time (lib/pen/granola-import.ts). Answers at once with how many were
// queued; the recordings appear in the list as they are made.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const paused = await pausedRefusal(email)
  if (paused) return NextResponse.json({ error: paused }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { ids?: unknown; all?: boolean; consent?: boolean }
  if (b.consent !== true) return NextResponse.json({ error: 'Confirm that everyone agreed to be recorded.' }, { status: 400 })
  const allowance = await getAllowance(email)
  if (!allowance.canProcess) return NextResponse.json({ error: 'You have no recording hours left this month.' }, { status: 402 })

  let ids: string[] = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string' && GRANOLA_ID.test(x)) : []
  try {
    if (b.all) ids = (await listForPicker(email, { since: new Date(Date.now() - 30 * 86_400_000) })).filter((m) => !m.imported).map((m) => m.id)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
  ids = [...new Set(ids)].slice(0, 60)
  if (!ids.length) return NextResponse.json({ queued: 0 })
  after(() => importMany(email, ids).then(() => {}, (e) => console.warn(`pen granola import: ${(e as Error).message}`)))
  return NextResponse.json({ queued: ids.length })
}
