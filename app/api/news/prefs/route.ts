import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs, setPrefs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const cur = await getPrefs(email)
  const layout: any = { ...(cur.layout || {}) }
  if (body.layout) Object.assign(layout, body.layout)
  if (body.hide) layout.hidden = Array.from(new Set([...(layout.hidden || []), body.hide]))
  if (body.unhide) layout.hidden = (layout.hidden || []).filter((x: string) => x !== body.unhide)
  if (body.unhideAll) layout.hidden = []
  // Minimize one section (kept in the existing grid.mini list so older layouts still apply).
  if (body.mini && typeof body.mini.id === 'string') {
    const grid = { ...(layout.grid || {}) }
    const mini: string[] = (grid.mini || []).filter((x: string) => x !== body.mini.id)
    if (body.mini.on) mini.push(body.mini.id)
    layout.grid = { ...grid, mini }
  }
  // Section order from drag / Move up-down: the sections on screen in their new order. Ids the
  // client didn't send (video shelves, hidden sections) keep their relative order after them.
  if (Array.isArray(body.order)) {
    const next = body.order.filter((x: unknown) => typeof x === 'string').slice(0, 200) as string[]
    const grid = { ...(layout.grid || {}) }
    grid.order = [...next, ...((grid.order || []) as string[]).filter((x) => !next.includes(x))]
    layout.grid = grid
  }
  // Read-later — prefs.layout.saved (no new table), newest first, capped at 100.
  if (body.save && typeof body.save.l === 'string' && body.save.l) {
    const rest = (layout.saved || []).filter((x: any) => x.l !== body.save.l)
    const { l, t, s, d } = body.save
    layout.saved = [{ l, t: String(t || '').slice(0, 300), s: String(s || '').slice(0, 80), d: d || null, savedAt: Date.now(), done: false }, ...rest].slice(0, 100)
  }
  if (body.unsave) layout.saved = (layout.saved || []).filter((x: any) => x.l !== body.unsave)
  if (body.saveDone && typeof body.saveDone.l === 'string') {
    layout.saved = (layout.saved || []).map((x: any) => (x.l === body.saveDone.l ? { ...x, done: !!body.saveDone.done } : x))
  }
  const patch: { lang?: string; layout?: any } = { layout }
  if (body.lang === 'en' || body.lang === 'es') patch.lang = body.lang
  await setPrefs(email, patch)
  return NextResponse.json({ ok: true })
}
