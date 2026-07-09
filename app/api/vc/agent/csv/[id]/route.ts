// GET /api/vc/agent/csv/[id]?key=… — CSV download generated server-side from
// the exact result-set snapshot (gated; ?key= because downloads are browser
// navigations that can't set headers).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chatGate, CHAT_CORS as CORS } from '@/lib/vc/chat-auth'

export const dynamic = 'force-dynamic'
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

const esc = (v: any) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = chatGate(req)
  if (denied) return denied
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('vc_result_sets')
    .select('columns,rows,interpretation,created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  if (!data) return NextResponse.json({ error: 'result set not found' }, { status: 404, headers: CORS })

  const cols: string[] = data.columns || []
  const lines = [cols.join(',')]
  for (const row of (data.rows || []) as any[]) lines.push(cols.map((c) => esc(row[c])).join(','))
  const stamp = String(data.created_at || '').slice(0, 10)
  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      ...CORS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vc-query-${stamp}-${id.slice(0, 8)}.csv"`,
    },
  })
}
