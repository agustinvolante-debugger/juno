import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { providerError } from '@/lib/pen/calendar-page'
import { createFromPage, deleteFromPage, patchFromPage, type Outcome } from '@/lib/pen/calendar-server'

export const dynamic = 'force-dynamic'

// Calendar page writes (22 Oct): create, change, delete an event on a connected Google or Outlook
// calendar. A change that would email guests needs confirm (409 { needsConfirm, guests } first);
// an event someone else organised is 403 { readOnly } (open it in Google / Outlook). Decisions in
// lib/pen/calendar-page.ts, calls in lib/pen/calendar-server.ts.

async function gate(): Promise<{ email: string } | NextResponse> {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const refusal = await readOnlyRefusal(email)
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 })
  return { email }
}

const reply = <T>(o: Outcome<T>, wrap: (v: T) => Record<string, unknown>) => (o.ok ? NextResponse.json(wrap(o.value)) : NextResponse.json(o.body, { status: o.status }))

const failed = (e: unknown) => {
  const p = providerError(e)
  if (p.status >= 500) console.warn(`pen calendar events: ${(e as Error).message}`)
  return NextResponse.json({ error: p.error }, { status: p.status })
}

export async function POST(req: Request) {
  const g = await gate()
  if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'bad request' }, { status: 400 })
  try {
    return reply(await createFromPage(g.email, b), (event) => ({ event }))
  } catch (e) {
    return failed(e)
  }
}

export async function PATCH(req: Request) {
  const g = await gate()
  if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'bad request' }, { status: 400 })
  try {
    return reply(await patchFromPage(g.email, b), (event) => ({ event }))
  } catch (e) {
    return failed(e)
  }
}

export async function DELETE(req: Request) {
  const g = await gate()
  if (g instanceof NextResponse) return g
  const q = new URL(req.url).searchParams
  const ref = q.get('ref')
  if (!ref) return NextResponse.json({ error: 'ref required' }, { status: 400 })
  try {
    return reply(await deleteFromPage(g.email, ref, q.get('confirm') === '1'), () => ({ ok: true }))
  } catch (e) {
    return failed(e)
  }
}
