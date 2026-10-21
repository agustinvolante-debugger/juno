// The logic behind /api/pen/drive/token and /api/pen/drive/picked, apart from the session, so it
// can be tested without Next's request scope (.pentest/drive-edit-unit.mts).

import { readOnlyRefusal } from './access'
import { driveConnected } from './google-calendar'
import { pickedFiles, pickerToken } from './google-drive'
import { startContinue } from './drive-continue'

export type RouteOut = { status: number; body: Record<string, unknown> }

/** The Picker's token for this signed-in user (null = signed out). ?account= must be the Docs & Sheets account. */
export async function tokenFor(email: string | null, url: string): Promise<RouteOut> {
  if (!email) return { status: 401, body: { error: 'unauthorized' } }
  const refusal = await readOnlyRefusal(email)
  if (refusal) return { status: 403, body: { error: refusal } }
  if (!(await driveConnected(email))) return { status: 409, body: { error: 'not connected', connect: true } }
  try {
    const t = await pickerToken(email)
    if (!t) return { status: 409, body: { error: 'not connected', connect: true } }
    const want = new URL(url).searchParams.get('account')?.trim().toLowerCase()
    if (want && t.account && want !== t.account.toLowerCase()) {
      return { status: 404, body: { error: 'That Google account isn’t connected for Docs & Sheets.', account: t.account } }
    }
    return { status: 200, body: { accessToken: t.accessToken, expiresIn: t.expiresIn, account: t.account } }
  } catch (e) {
    return { status: 502, body: { error: (e as Error).message, connect: true } }
  }
}

/**
 * After a pick: which of these files Juno can now open (names and links). With the chat's token
 * (`token`, lib/pen/drive-continue.ts), the request that led here carries on in that chat in the
 * background: `continued` says so, `back` which chat, `reason` why not (window = WhatsApp's 24 h).
 */
export async function pickedFor(email: string | null, raw: unknown, schedule?: (job: () => Promise<void>) => void | Promise<void>): Promise<RouteOut> {
  if (!email) return { status: 401, body: { error: 'unauthorized' } }
  const b = (raw ?? {}) as { files?: { id?: unknown }[]; token?: unknown }
  const ids = (Array.isArray(b.files) ? b.files : []).map((f) => (typeof f?.id === 'string' ? f.id : '')).filter((id) => /^[A-Za-z0-9_-]{10,200}$/.test(id)).slice(0, 5)
  if (!ids.length) return { status: 400, body: { error: 'no files' } }
  if (!(await driveConnected(email))) return { status: 409, body: { error: 'not connected', connect: true } }
  try {
    const files = (await pickedFiles(email, ids)).map((f) => ({ id: f.id, name: f.name, kind: f.kind, url: f.url }))
    const cont = b.token ? await startContinue(email, b.token, files, schedule) : { continued: false }
    return { status: 200, body: { files, missing: ids.length - files.length, ...cont } }
  } catch (e) {
    return { status: 502, body: { error: (e as Error).message } }
  }
}
