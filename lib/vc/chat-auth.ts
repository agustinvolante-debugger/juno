// Shared gate for all VC chat endpoints: x-chat-key header (or ?key= for
// browser-navigated downloads) must equal VC_CHAT_KEY.
import { NextRequest, NextResponse } from 'next/server'

export const CHAT_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-chat-key',
}

export function chatGate(req: NextRequest): NextResponse | null {
  const key = process.env.VC_CHAT_KEY
  if (!key) return NextResponse.json({ error: 'chat is not configured (VC_CHAT_KEY unset)' }, { status: 503, headers: CHAT_CORS })
  const got = req.headers.get('x-chat-key') || req.nextUrl.searchParams.get('key')
  if (got !== key) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CHAT_CORS })
  return null
}
