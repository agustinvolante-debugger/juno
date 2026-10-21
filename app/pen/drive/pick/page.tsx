import type { Metadata } from 'next'
import { authedEmail } from '@/lib/news/auth'
import { appLangFor } from '../../app-lang'
import { gcalConfigured, getGcalConnection, hasDrive } from '@/lib/pen/google-calendar'
import PickClient, { type PickState } from './PickClient'
import './pick.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Let Juno edit a file · Juno Pen', robots: { index: false } }

// "Let Juno edit a file" (21 Oct). Juno's Google permission is drive.file: it opens only files it
// made, and files the user chooses for it in Google's own Picker, here. Signed-in page; the chat's
// pick_google_file tool links to it (lib/pen/whatsapp/tools/google.ts). The Picker loads only when
// they tap "Choose files", with a drive.file-only token from /api/pen/drive/token.
export default async function DrivePickPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const email = await authedEmail()
  const lang = await appLangFor(email ?? '', email ? undefined : null)
  const pickerKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_KEY || ''

  let state: PickState
  let account: string | null = null
  if (!email) state = 'signed_out'
  else if (!gcalConfigured() || !pickerKey) state = 'not_configured'
  else {
    const c = await getGcalConnection(email).catch(() => null)
    account = c?.calendar_email ?? null
    state = !c || !hasDrive(c.scope) ? 'connect' : c.last_error ? 'reconnect' : 'ready'
  }

  // Dev only: show a state without a Google connection (screenshots). Never in production.
  const preview = process.env.NODE_ENV !== 'production' && typeof sp.preview === 'string' ? sp.preview : null
  if (preview && ['signed_out', 'not_configured', 'connect', 'reconnect', 'ready', 'done'].includes(preview)) {
    state = preview as PickState
    if (preview === 'ready' || preview === 'done') account = account ?? 'you@example.com'
  }

  return (
    <main className="pen-check pen-drive">
      <PickClient
        lang={lang}
        state={state}
        account={account}
        pickerKey={state === 'ready' ? pickerKey : ''}
        previewDone={preview === 'done'}
      />
    </main>
  )
}
