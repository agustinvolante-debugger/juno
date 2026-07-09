// GET /api/vc/agent/conversations/[id] — messages of one conversation (gated).
// DELETE — remove a conversation (cascades messages + result sets).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chatGate, CHAT_CORS } from '@/lib/vc/chat-auth'

export const dynamic = 'force-dynamic'
const CORS = { ...CHAT_CORS, 'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS' }
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = chatGate(req)
  if (denied) return denied
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('vc_chat_messages')
    .select('id,role,content,created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ messages: data || [] }, { headers: CORS })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = chatGate(req)
  if (denied) return denied
  const { id } = await ctx.params
  const { error } = await supabaseAdmin.from('vc_chat_conversations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ deleted: id }, { headers: CORS })
}
