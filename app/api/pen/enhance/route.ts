import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { getSession } from '@/lib/pen/store'
import type { NoteBlock } from '@/lib/pen/store'
import { enhanceBlocks } from '@/lib/pen/enhance'
import { toDialogue } from '@/lib/pen/aai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Returns expansions keyed by block id. Deliberately does NOT write to the DB — the client
// owns the block list and saves it, so an expansion the user immediately undoes never persists.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Read-only after the plan ends: nothing that adds or calls a model (lib/pen/access.ts).
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; blocks?: NoteBlock[] }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!Array.isArray(b.blocks) || !b.blocks.length) {
    return NextResponse.json({ error: 'write a note first, then enhance it' }, { status: 400 })
  }

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const dialogue = toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  if (!dialogue.trim()) {
    return NextResponse.json({ error: 'no transcript yet — enhance needs the recording for context' }, { status: 400 })
  }

  try {
    const expansions = await enhanceBlocks({
      blocks: b.blocks.slice(0, 60),
      dialogue,
      notes: session.notes ?? {},
    })
    return NextResponse.json({ expansions })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
