import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { isMissingSchema } from '@/lib/pen/allowance'
import { userLang } from '@/lib/pen/user-lang'
import { getLinkByEmail } from '@/lib/pen/whatsapp/store'
import { decideSuggestion, resolveSuggestion, validZone } from '@/lib/pen/suggestions'
import { homeSuggestions, recordingSuggestions, titlesFor, view } from '@/lib/pen/suggestions-web'
import { acceptFollowup, acceptMeeting, acceptNotion, acceptOther } from '@/lib/pen/offer-accept'
import type { AcceptOutcome } from '@/lib/pen/suggestion-view'
import type { Lang } from '@/lib/pen/currency'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The web side of Juno's offers (lib/pen/suggestions.ts). Same rows, same states and the same
// accept logic as WhatsApp (lib/pen/offer-accept.ts), so a yes on either side is seen on both.
//
//   GET  ?session=<id>  the ≤3 open offers for that recording ("Juno noticed")
//   GET                 Home: every open offer (best first) + what Juno did in the last 14 days
//   POST {id, action: 'accept' | 'dismiss', time_zone?, start_local?, plain?}
//
// Nothing runs without the click: POST is the only thing that acts, and only on the user's own
// open suggestion. A read-only account can look but not act.

export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sessionId = new URL(req.url).searchParams.get('session')
  try {
    if (sessionId) return NextResponse.json({ open: await recordingSuggestions(email, sessionId) })
    return NextResponse.json(await homeSuggestions(email))
  } catch (e) {
    const msg = (e as Error).message
    // Before the pen_suggestions table exists, there is simply nothing to show.
    if (isMissingSchema(msg)) return NextResponse.json({ open: [], did: [] })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const refusal = await readOnlyRefusal(email)
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; time_zone?: string; start_local?: string; plain?: boolean }
  if (!b.id || !/^[0-9a-f-]{36}$/i.test(b.id) || (b.action !== 'accept' && b.action !== 'dismiss')) {
    return NextResponse.json({ error: 'id and action (accept | dismiss) required' }, { status: 400 })
  }
  // resolveSuggestion with an id is scoped to the signed-in user: someone else's id finds nothing.
  const s = await resolveSuggestion(email, b.id)
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!['suggested', 'offered'].includes(s.state)) return NextResponse.json({ error: `already ${s.state}` }, { status: 409 })

  const lang = await userLang(email)
  if (b.action === 'dismiss') {
    await decideSuggestion(email, s.id, 'dismissed')
    return NextResponse.json({ status: 'dismissed' })
  }

  const link = await getLinkByEmail(email).catch(() => null)
  const ctx = { email, lang, phone: link?.linked_at && link.phone ? link.phone : null }
  const tz = validZone(b.time_zone) ? b.time_zone : ''
  const local = typeof b.start_local === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.start_local) ? b.start_local : ''
  try {
    let r: Record<string, unknown>
    switch (s.kind) {
      case 'meeting': r = (await acceptMeeting(ctx, s, tz, local)) as Record<string, unknown>; break
      case 'followup': r = (await acceptFollowup(ctx, s, tz)) as Record<string, unknown>; break
      case 'notion': r = (await acceptNotion(ctx, s, b.plain === true)) as Record<string, unknown>; break
      default: r = await acceptOther(ctx, s)
    }
    const out = await outcome(email, lang, s.id, r)
    return NextResponse.json(out, { status: out.status === 'error' ? 422 : 200 })
  } catch (e) {
    return NextResponse.json({ status: 'error', error: (e as Error).message } satisfies AcceptOutcome, { status: 500 })
  }
}

async function outcome(email: string, lang: Lang, id: string, r: Record<string, unknown>): Promise<AcceptOutcome> {
  if (typeof r.error === 'string') return { status: 'error', error: r.error }
  if (r.needs === 'time') return { status: 'needs_time' }
  if (r.needs === 'time_zone') return { status: 'needs_zone' }
  if (r.notion_connected === false) return { status: 'connect_notion', settings: '/pen/settings/notion' }
  const row = await resolveSuggestion(email, id)
  if (!row) return { status: 'error', error: 'not found' }
  const titles = await titlesFor(email, [row])
  return {
    status: 'done',
    suggestion: view(row, lang, titles),
    addedTo: r.added_to === 'Google Calendar' ? 'google' : typeof r.calendar_ics === 'string' ? 'links' : undefined,
    reminderAt: typeof r.reminder_set === 'string' ? r.reminder_set : null,
    dueDate: typeof r.due_date === 'string' ? r.due_date : null,
    notionUrl: typeof r.notion_url === 'string' ? r.notion_url : null,
    plan: Array.isArray(r.plan) ? (r.plan as string[]) : undefined,
  }
}
