import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { pickedFor } from '@/lib/pen/drive-routes'

export const dynamic = 'force-dynamic'
// A pick from the chat's link runs one agent turn after the response (lib/pen/drive-continue.ts).
export const maxDuration = 300

// After the Picker (/pen/drive/pick): Google has already given Juno access to the chosen files
// (drive.file). This checks each one opens and returns its name and link for the success screen.
// With the chat's token, the request that led to the pick carries on in that chat (after()).
export async function POST(req: Request) {
  const r = await pickedFor(await authedEmail(), await req.json().catch(() => ({})))
  return NextResponse.json(r.body, { status: r.status })
}
