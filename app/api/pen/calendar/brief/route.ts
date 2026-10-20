import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readBrief } from '@/lib/pen/calendar-server'
import { providerError } from '@/lib/pen/calendar-page'

export const dynamic = 'force-dynamic'

// Calendar page → an upcoming meeting → "Brief": for up to four guests, the last call with them and
// open promises both ways, from Pen's own recordings and contacts (no model call). ?ref=<event ref>.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const ref = new URL(req.url).searchParams.get('ref')
  if (!ref) return NextResponse.json({ error: 'ref required' }, { status: 400 })
  try {
    const brief = await readBrief(email, ref)
    return brief ? NextResponse.json({ brief }) : NextResponse.json({ error: 'that event is gone' }, { status: 404 })
  } catch (e) {
    const p = providerError(e)
    return NextResponse.json({ error: p.error }, { status: p.status })
  }
}
