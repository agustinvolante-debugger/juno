// GET /api/vc/agent/conversations/[id] — messages of one conversation (gated).
// DELETE — remove a conversation (cascades messages + result sets).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chatGate, chatCors, chatIdentity } from '@/lib/vc/chat-auth'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) { return new NextResponse(null, { headers: chatCors(req) }) }

// owner check (migration 013): a conversation belongs to whoever created it.
// Pre-migration (no user_email column / null value) everything stays accessible.
async function ownedBy(id: string, email: string | null): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('vc_chat_conversations').select('user_email').eq('id', id).maybeSingle()
  if (error || !data) return true // pre-migration or missing row — downstream query 404s naturally
  return !(data as any).user_email || (data as any).user_email === email
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const CORS = chatCors(req)
  const denied = await chatGate(req)
  if (denied) return denied
  const { id } = await ctx.params
  if (!(await ownedBy(id, await chatIdentity(req)))) return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS })
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
  const CORS = chatCors(req)
  const denied = await chatGate(req)
  if (denied) return denied
  const { id } = await ctx.params
  if (!(await ownedBy(id, await chatIdentity(req)))) return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS })
  const { error } = await supabaseAdmin.from('vc_chat_conversations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ deleted: id }, { headers: CORS })
}
