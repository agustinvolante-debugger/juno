import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { tokenFor } from '@/lib/pen/drive-routes'

export const dynamic = 'force-dynamic'

// The Google Picker's token (/pen/drive/pick): a short-lived access token for the signed-in
// user's Google connection that has Docs & Sheets (drive.file), asked of Google for drive.file
// only. Never the refresh token. 401 signed out, 409 not connected (lib/pen/drive-routes.ts).
export async function GET(req: Request) {
  const r = await tokenFor(await authedEmail(), req.url)
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store, private' } })
}
