import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { pickedFor } from '@/lib/pen/drive-routes'

export const dynamic = 'force-dynamic'

// After the Picker (/pen/drive/pick): Google has already given Juno access to the chosen files
// (drive.file). This only checks each one opens and returns its name and link for the success
// screen. Nothing is stored: Drive's own file list (find_google_file) now includes them.
export async function POST(req: Request) {
  const r = await pickedFor(await authedEmail(), await req.json().catch(() => ({})))
  return NextResponse.json(r.body, { status: r.status })
}
