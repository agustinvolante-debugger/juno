import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { parsePenFiles, penFilesState } from '@/lib/pen/pen-device-server'

export const dynamic = 'force-dynamic'

// The pen is plugged in (21 Oct): which of its recordings Juno already has (don't upload again)
// and which are safely stored (OK to remove from the pen). Read-only for the account: a
// read-only (ended) account may still ask, it only stops uploads elsewhere.
//   POST { files: PenFileInfo[] (≤ 500) } → PenFilesState { uploaded, safe }
// How `safe` is verified: lib/pen/pen-device-server.ts.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const files = parsePenFiles(await req.json().catch(() => null))
  if (typeof files === 'string') return NextResponse.json({ error: files }, { status: 400 })
  try {
    return NextResponse.json(await penFilesState(email, files))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
