// GET  /api/vc/enrich-queue — pending proposals (chat/session gated, read)
// POST /api/vc/enrich-queue — {ids:[], action:'approve'|'reject'} (admin-key gated)
//   approve applies each row to the live graph via the same executors the chat uses.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chatGate, chatCors } from '@/lib/vc/chat-auth'
import { applyQueued } from '@/lib/vc/agent-tools'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const cors = (req: NextRequest) => ({ ...chatCors(req), 'Access-Control-Allow-Headers': 'content-type,x-chat-key,x-admin-key' })
export async function OPTIONS(req: NextRequest) { return new NextResponse(null, { headers: cors(req) }) }

export async function GET(req: NextRequest) {
  const CORS = cors(req)
  const denied = await chatGate(req)
  if (denied) return denied
  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const { data, error } = await supabaseAdmin.from('vc_enrich_queue')
    .select('id,company_slug,company_name,kind,payload,confidence,source_url,status,run_note,created_at')
    .eq('status', status).order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ items: data || [] }, { headers: CORS })
}

export async function POST(req: NextRequest) {
  const CORS = cors(req)
  const secret = process.env.VC_ADMIN_KEY || process.env.CRON_SECRET
  if (!secret || req.headers.get('x-admin-key') !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 200) : []
  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null
  if (!ids.length || !action) return NextResponse.json({ error: 'ids[] and action (approve|reject) required' }, { status: 400, headers: CORS })

  const sb = supabaseAdmin
  const { data: rows } = await sb.from('vc_enrich_queue').select('id,kind,payload').in('id', ids).eq('status', 'pending')
  const out: any[] = []
  for (const row of rows || []) {
    if (action === 'reject') {
      await sb.from('vc_enrich_queue').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', row.id)
      out.push({ id: row.id, status: 'rejected' })
      continue
    }
    const res = await applyQueued(row as any)
    const failed = !!res?.error
    await sb.from('vc_enrich_queue').update({ status: failed ? 'failed' : 'applied', decided_at: new Date().toISOString() }).eq('id', row.id)
    out.push({ id: row.id, status: failed ? 'failed' : 'applied', detail: res?.error || undefined })
  }
  return NextResponse.json({ results: out }, { headers: CORS })
}
