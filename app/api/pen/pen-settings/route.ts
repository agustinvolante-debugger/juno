import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { readPenSettings, savePenSettings } from '@/lib/pen/pen-device-server'

export const dynamic = 'force-dynamic'

// Settings → Pen (21 Oct): the Juno Pen's recording settings, kept in the profile so every
// computer writes the same MRECSET.TXT onto the pen (lib/pen/pen-device.ts, pen-settings.ts).
//   GET → { settings: PenSettings (defaults under what's saved), savedAt: string | null }
//   PUT PenSettings (any subset; unknown keys dropped, numbers clamped) → { settings, savedAt }
export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await readPenSettings(email))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'settings required' }, { status: 400 })
  try {
    return NextResponse.json(await savePenSettings(email, body))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
