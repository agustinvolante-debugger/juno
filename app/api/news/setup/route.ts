import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { setupChat } from '@/lib/news/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Proposes topic sections (the user confirms each with ✓/✗ client-side → POST /api/news/topic).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ type: 'error', reply: 'Sign in for full access.' }, { status: 401 })
  const { messages } = await req.json().catch(() => ({ messages: [] }))
  const res = await setupChat(Array.isArray(messages) ? messages : [])
  return NextResponse.json(res)
}
