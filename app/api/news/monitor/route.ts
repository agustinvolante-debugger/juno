import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { buildMonitor } from '@/lib/news/ai'
import { getUserMonitors, setUserMonitors, getPrefs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX = 6 // keep the monitor count sane

// POST { query, refresh? }: create a monitor, or re-check an existing one for new developments
// (preserving when each item was first seen so the UI can mark what's NEW).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { query, refresh } = await req.json().catch(() => ({}))
  const q = (query || '').toString().trim().slice(0, 120)
  if (!q) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const lang = (await getPrefs(email)).lang
  const monitors = await getUserMonitors(email)
  const prev = monitors.find((m) => m.query.toLowerCase() === q.toLowerCase())
  if (!prev && !refresh && monitors.length >= MAX) return NextResponse.json({ error: 'limit' }, { status: 400 })

  const built = await buildMonitor(q, lang, prev)
  const next = prev ? monitors.map((m) => (m === prev ? built : m)) : [built, ...monitors]
  await setUserMonitors(email, next)
  return NextResponse.json({ ok: true })
}

// PATCH { query, alerts }: toggle push alerts for one monitor (device subscription is separate,
// stored via /api/news/push-sub).
export async function PATCH(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { query, alerts } = await req.json().catch(() => ({}))
  const q = (query || '').toString().trim().toLowerCase()
  if (!q) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const monitors = await getUserMonitors(email)
  await setUserMonitors(email, monitors.map((m) => (m.query.toLowerCase() === q ? { ...m, alerts: !!alerts } : m)))
  return NextResponse.json({ ok: true })
}

// DELETE ?query=…
export async function DELETE(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('query') || '').trim()
  const monitors = await getUserMonitors(email)
  await setUserMonitors(email, monitors.filter((m) => m.query.toLowerCase() !== q.toLowerCase()))
  return NextResponse.json({ ok: true })
}
