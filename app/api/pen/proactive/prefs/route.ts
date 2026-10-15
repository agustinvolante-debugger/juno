import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs, setPrefs, PROACTIVE_KINDS } from '@/lib/pen/proactive'
import type { ProactiveKind } from '@/lib/pen/suggestions-types'

export const dynamic = 'force-dynamic'

// Settings → WhatsApp & iMessage → "Messages from Juno": the same switches as STOP / START in
// the chat (lib/pen/proactive.ts setPrefs), stored in profile.proactive {off, offKinds}.
//   GET                       → { off, offKinds }
//   POST { on, kind? }        → no kind = everything; returns the new prefs

export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const p = await getPrefs(email)
  return NextResponse.json({ off: !!p.off, offKinds: p.offKinds ?? [] })
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { on?: unknown; kind?: unknown }
  if (typeof b.on !== 'boolean') return NextResponse.json({ error: 'on (boolean) required' }, { status: 400 })
  if (b.kind !== undefined && !PROACTIVE_KINDS.includes(b.kind as ProactiveKind)) return NextResponse.json({ error: 'unknown kind' }, { status: 400 })
  try {
    const p = await setPrefs(email, b.on, b.kind as ProactiveKind | undefined)
    return NextResponse.json({ off: !!p.off, offKinds: p.offKinds ?? [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
