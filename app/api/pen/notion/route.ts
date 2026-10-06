import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { disconnect, setAuto } from '@/lib/pen/notion'

export const dynamic = 'force-dynamic'

// Settings → Notion: switch automatic sending on or off (PATCH), or disconnect (DELETE).
export async function PATCH(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { auto?: boolean }
  try {
    await setAuto(email, Boolean(b.auto))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await disconnect(email)
  return NextResponse.json({ ok: true })
}
