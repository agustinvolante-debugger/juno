// GET /api/vc/agent/result/[id] — the exact row snapshot behind a chat table
// artifact (gated). The UI renders this directly; the model never touches it.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chatGate, CHAT_CORS as CORS } from '@/lib/vc/chat-auth'

export const dynamic = 'force-dynamic'
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = chatGate(req)
  if (denied) return denied
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('vc_result_sets')
    .select('id,interpretation,filters,columns,rows,total,created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  if (!data) return NextResponse.json({ error: 'result set not found' }, { status: 404, headers: CORS })
  return NextResponse.json(data, { headers: CORS })
}
