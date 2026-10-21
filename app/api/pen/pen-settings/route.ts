import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { penSettingsGet, penSettingsPut } from '@/lib/pen/pen-device-server'

export const dynamic = 'force-dynamic'

// Settings → Pen (21 Oct): the Juno Pen's recording settings, kept in the profile so every
// computer writes the same MRECSET.TXT onto the pen (lib/pen/pen-device.ts, pen-settings.ts).
//   GET ?tz=<browser zone> → { settings: EFFECTIVE (what to write onto the pen now), saved, savedAt, preset }
//   PUT PenSettings (any subset; unknown keys dropped, numbers clamped) ?tz= → { settings: SAVED, savedAt, effective, preset }
// preset = a conference on the user's calendar is coming (from 18:00 the day before) or on: the
// effective settings are then the saved ones with the conference set-up over them, the saved
// ones untouched (lib/pen/event-prep.ts, PEN_EVENT_PREP=1). Contract: lib/pen/pen-device.ts.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await penSettingsGet(email, { tz: new URL(req.url).searchParams.get('tz') }))
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
    return NextResponse.json(await penSettingsPut(email, body, { tz: new URL(req.url).searchParams.get('tz') }))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
