import type { Metadata } from 'next'
import { APP_NAME, COPY, asLang, type ConnectApp } from '@/lib/pen/connect-link'
import { botNumber } from '@/lib/pen/whatsapp/provider'
import { outlookAdminUrl } from '@/lib/pen/outlook'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Juno Pen', robots: { index: false } }

// Where a connect started from the chat lands (lib/pen/connect-link.ts): one line, and the way
// back to the chat. No session needed and nothing private shown: app, language, channel and an
// error code come in the query.
export default async function ConnectedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const lang = asLang(one('lang'))
  const app: ConnectApp = one('app') === 'notion' ? 'notion' : one('app') === 'gdrive' ? 'gdrive' : one('app') === 'granola' ? 'granola' : one('app') === 'gmail' ? 'gmail' : one('app') === 'outlook' ? 'outlook' : 'gcal'
  const L = COPY[lang]
  const error = one('error')
  const wa = botNumber()
  const button = { display: 'inline-block', background: 'var(--accent)', color: '#fff', textDecoration: 'none', padding: '12px 20px', borderRadius: 999, fontFamily: 'var(--font-ui), system-ui, sans-serif', fontSize: 15 }
  const back =
    // Started in the website chat: "Connected ✓" is posted in that thread; this goes back to it.
    one('c') === 'web' ? (
      <a href="/pen?view=chats" style={button}>{L.backWeb}</a>
    ) : one('c') === 'im' ? (
      <p style={{ color: 'var(--soft)', margin: 0 }}>{L.backIm}</p>
    ) : wa ? (
      <a href={`https://wa.me/${wa}`} style={button}>
        {L.backWa}
      </a>
    ) : (
      <p style={{ color: 'var(--soft)', margin: 0 }}>{L.backWa}.</p>
    )
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--paper)', color: 'var(--ink)', padding: '18vh 20px 40px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display), Georgia, serif', fontWeight: 400, fontSize: 34, lineHeight: 1.15, margin: '0 0 12px' }}>
          {error ? L.failTitle : `${L.pageTitle} ✓`}
        </h1>
        <p style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 17, lineHeight: 1.5, color: 'var(--soft)', margin: '0 0 24px' }}>
          {error === 'admin_consent' ? L.errors.admin_consent : error ? `${L.errors[error] ?? error.slice(0, 200)} ${L.askAgain}` : L.pageLine(APP_NAME[lang][app])}
        </p>
        {error === 'admin_consent' && app === 'outlook' && (
          // A Microsoft 365 organisation that lets only IT approve apps: the link to forward them.
          <p style={{ fontFamily: 'var(--font-ui), system-ui, sans-serif', fontSize: 14, lineHeight: 1.5, color: 'var(--soft)', margin: '0 0 24px', overflowWrap: 'anywhere' }}>
            {L.adminLink}<br />
            <a href={outlookAdminUrl({ tenant: one('tenant') || null })} style={{ color: 'var(--accent)' }}>{outlookAdminUrl({ tenant: one('tenant') || null })}</a>
          </p>
        )}
        {back}
      </div>
    </main>
  )
}
