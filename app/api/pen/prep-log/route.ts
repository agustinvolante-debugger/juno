import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { clientEventRow } from '@/lib/pen/client-events'
import { storeClientEvent } from '@/lib/pen/client-events-server'

export const dynamic = 'force-dynamic'

// The browser's audio prep fell back (worker → page, or to uploading the original as-is), or an
// upload ended in an error: one line in the server log AND one pen_client_events row (23 Oct),
// with how long the tab had been hidden, so real-world failures can be counted. The client sends
// it fire-and-forget (lib/pen/client-events.ts logClientEvent). Before the table exists (the
// 2026-10-23 CREATE in lib/pen/schema.sql) it only logs.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const row = clientEventRow(email, b, req.headers.get('user-agent'))
  if (!row) return NextResponse.json({ error: 'unknown event' }, { status: 400 })
  const mb = row.file_bytes !== null ? (row.file_bytes / 1048576).toFixed(1) : '?'
  const vis = row.visibility ? `${row.visibility.state}, hidden ${Math.round(row.visibility.hidden_ms_last_min / 1000)} s of the last min` : '?'
  console.warn(
    `[pen prep-log] ${email} ${row.kind} file=${row.file_name} ${mb} MB stage=${row.stage ?? '-'}@${row.pct ?? '?'}% ` +
      `vis=[${vis}] reason=${row.reason ?? '-'} ua=${row.ua ?? '-'}`,
  )
  await storeClientEvent(row)
  return NextResponse.json({ ok: true })
}
