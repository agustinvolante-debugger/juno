import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { createUploadUrl } from '@/lib/pen/store'

export const dynamic = 'force-dynamic'

// Hands the browser a signed URL so it can PUT the audio straight into Supabase Storage.
// Audio must never pass through this function: Vercel caps request bodies at 4.5MB and a
// showing is far bigger even after Opus compression.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { name?: string }
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  try {
    const out = await createUploadUrl(email, body.name)
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
