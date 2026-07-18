// GET /api/vc/agent/conversations — chat history list (gated).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chatGate, chatCors, chatIdentity } from '@/lib/vc/chat-auth'

export const dynamic = 'force-dynamic'
export async function OPTIONS(req: NextRequest) { return new NextResponse(null, { headers: chatCors(req) }) }

export async function GET(req: NextRequest) {
  const CORS = chatCors(req)
  const denied = await chatGate(req)
  if (denied) return denied
  const email = await chatIdentity(req)
  // per-user history (migration 013); pre-migration fallback keeps the drawer working
  let q: any = await supabaseAdmin
    .from('vc_chat_conversations')
    .select('id,title,created_at,updated_at')
    .eq('user_email', email)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (q.error && /column/.test(q.error.message)) {
    q = await supabaseAdmin.from('vc_chat_conversations').select('id,title,created_at,updated_at').order('updated_at', { ascending: false }).limit(100)
  }
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ conversations: q.data || [] }, { headers: CORS })
}
