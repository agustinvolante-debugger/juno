import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getProfile, setProfile } from '@/lib/news/store'

export const dynamic = 'force-dynamic'

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'your', 'what', 'why', 'how', 'new', 'los', 'las', 'una', 'por', 'con', 'para', 'que', 'del', 'este', 'esta', 'como'])
function tokens(t: string): string[] {
  return (t || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
}

// Records one article click into the user's learning profile (powers For-You). No AI cost.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { source, section, title } = await req.json().catch(() => ({}))
  const p = await getProfile(email)
  p.s ||= {}; p.k ||= {}; p.w ||= {}
  if (source) p.s[source] = (p.s[source] || 0) + 1
  if (section) p.k[section] = (p.k[section] || 0) + 1
  for (const w of tokens(title || '')) p.w[w] = (p.w[w] || 0) + 1
  await setProfile(email, p)
  return NextResponse.json({ ok: true })
}

// Reset the learned profile (clears For-You personalization).
export async function DELETE() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await setProfile(email, { s: {}, k: {}, w: {} })
  return NextResponse.json({ ok: true })
}
