// Shared gate for the VC chat endpoints. Two ways in:
//   1. x-chat-key header (or ?key= for browser-navigated downloads) = VC_CHAT_KEY
//   2. a signed-in allowed Google account (shared .tryjunoapp.com session cookie)
// Because session auth needs credentials:'include', CORS must echo the origin
// (wildcard is invalid with credentials) — reuse vcCors.
import { NextRequest, NextResponse } from 'next/server'
import { vcCors, vcSessionEmail } from '@/lib/vc/vc-auth'

export function chatCors(req: NextRequest): Record<string, string> {
  const h = vcCors(req)
  return { ...h, 'Access-Control-Allow-Headers': 'content-type,x-chat-key' }
}

export async function chatGate(req: NextRequest): Promise<NextResponse | null> {
  const CORS = chatCors(req)
  const key = process.env.VC_CHAT_KEY
  const got = req.headers.get('x-chat-key') || req.nextUrl.searchParams.get('key')
  if (key && got === key) return null
  if (await vcSessionEmail()) return null
  return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS })
}

// legacy export shape used by earlier routes — keep name, now credential-aware per-request
export const CHAT_CORS = {
  'Access-Control-Allow-Origin': 'https://vc.tryjunoapp.com',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-chat-key',
  'Access-Control-Allow-Credentials': 'true',
} as const
