// Settings → Connections (20 Oct): Google, Email, Notion, Granola and WhatsApp used to be pages of
// their own. They are sections of one page now, and every old address still lands in the right
// place: OAuth callbacks, emails, WhatsApp messages and bookmarks all point at them.
//
// `p` says which panel a status belongs to (each panel used `connected=` / `error=` for its own
// meaning), and the #anchor scrolls to it.

export type ConnPanel = 'google' | 'email' | 'outlook' | 'notion' | 'granola' | 'whatsapp' | 'docs'

export const CONNECTIONS = '/pen/settings/connections'

/** The anchor on Connections for a panel's status. Docs & Sheets lives under Notes & documents. */
export function anchorFor(p: ConnPanel, q?: URLSearchParams | Record<string, string>): string {
  const get = (k: string) => (q instanceof URLSearchParams ? q.get(k) : q?.[k]) ?? null
  if (p === 'email') return 'google'
  if (p === 'google' || p === 'docs') {
    const c = get('connected')
    const d = get('disconnected')
    return c === 'drive' || d === 'drive' || p === 'docs' ? 'docs' : 'google'
  }
  return p
}

/** `/pen/settings/connections?p=<panel>&<query>#<anchor>` (no `p` when there is no status to show). */
export function connectionsHref(p: ConnPanel, query?: string | URLSearchParams | Record<string, string>): string {
  const q = new URLSearchParams(typeof query === 'string' ? query : query instanceof URLSearchParams ? query : (query ?? {}))
  q.delete('p')
  const status = q.size > 0
  const out = new URLSearchParams(status ? [['p', p], ...q.entries()] : [])
  return `${CONNECTIONS}${out.size ? `?${out}` : ''}#${anchorFor(p, q)}`
}
