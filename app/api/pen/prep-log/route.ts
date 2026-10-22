import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'

export const dynamic = 'force-dynamic'

// The browser's audio prep fell back (worker → page, or to uploading the original as-is): one
// line in the server log, so real-world prep failures are visible in Vercel. No table, nothing
// stored; the client sends it fire-and-forget (lib/pen/stream-prep-client.ts PrepFailed trail).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as {
    name?: unknown
    bytes?: unknown
    outcome?: unknown
    trail?: unknown
  }
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')
  const trail = (Array.isArray(b.trail) ? b.trail : []).slice(0, 4).map((t) => {
    const x = (t ?? {}) as Record<string, unknown>
    return `${str(x.path, 12)}/${str(x.stage, 8)}@${typeof x.pct === 'number' ? Math.round(x.pct) : '?'}%: ${str(x.error, 200)}`
  })
  const mb = typeof b.bytes === 'number' ? (b.bytes / 1048576).toFixed(1) : '?'
  console.warn(
    `[pen prep-log] ${email} file=${str(b.name, 80)} ${mb} MB outcome=${str(b.outcome, 12)} ` +
      `trail=[${trail.join(' | ')}] ua=${str(req.headers.get('user-agent'), 200)}`,
  )
  return NextResponse.json({ ok: true })
}
