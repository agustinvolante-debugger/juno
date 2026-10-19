// Pure helpers for email drafts (no database, no network): which mail service someone uses, the
// prefilled-compose links for it, the length limits, the RFC 2822 message Gmail sends, and which
// connected Gmail a draft goes out from. Tested in .pentest/mail-unit.mts.
//
// Compose link formats (19 Oct 2026; none of the three is formally documented, so test on a phone):
//   Gmail          https://mail.google.com/mail/?view=cm&fs=1&to=&su=&body=   (+ authuser=<address>
//                  so a browser signed in to several Google accounts opens the right one)
//   Outlook (M365) https://outlook.office.com/mail/deeplink/compose?to=&subject=&body=
//   Outlook.com    https://outlook.live.com/mail/0/deeplink/compose?to=&subject=&body=
//   Yahoo          https://compose.mail.yahoo.com/?to=&subject=&body=
// Values are percent-encoded with encodeURIComponent (spaces as %20, never "+", which Outlook and
// Yahoo would show literally). mailto: uses CRLF line breaks (RFC 6068).

/** gmail · outlook (Microsoft 365 / work) · outlook_live (Outlook.com, Hotmail) · yahoo. */
export type MailProvider = 'gmail' | 'outlook' | 'outlook_live' | 'yahoo'
/** What the user said they use. 'other' = a mail app (Apple Mail…): only the mailto link. */
export type MailApp = 'gmail' | 'outlook' | 'yahoo' | 'other'

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])
const MS_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com'])
const YAHOO_DOMAINS = new Set(['yahoo.com', 'ymail.com', 'rocketmail.com'])

export const domainOf = (email: string | null | undefined): string => (email ?? '').split('@')[1]?.trim().toLowerCase() ?? ''

/** From the address alone: consumer domains only (yahoo.co.uk, hotmail.es… count too). */
export function providerFromDomain(email: string | null | undefined): MailProvider | null {
  const d = domainOf(email)
  if (!d) return null
  if (GMAIL_DOMAINS.has(d)) return 'gmail'
  if (MS_DOMAINS.has(d) || /^(outlook|hotmail|live)\.[a-z.]+$/.test(d)) return 'outlook_live'
  if (YAHOO_DOMAINS.has(d) || /^(yahoo|ymail)\.[a-z.]+$/.test(d)) return 'yahoo'
  return null
}

/** From a company domain's mail servers: Microsoft 365 → Outlook on the web, Google Workspace → Gmail. */
export function providerFromMx(hosts: string[]): MailProvider | null {
  const h = hosts.map((x) => x.toLowerCase().replace(/\.$/, ''))
  if (h.some((x) => x.endsWith('.mail.protection.outlook.com') || x.endsWith('.protection.outlook.com'))) return 'outlook'
  if (h.some((x) => x.endsWith('google.com') || x.endsWith('googlemail.com'))) return 'gmail'
  if (h.some((x) => x.endsWith('yahoodns.net'))) return 'yahoo'
  return null
}

/** What the user said ("I use Outlook"), mapped to a provider. Outlook = their personal flavour
 *  only when their own address is an Outlook.com one; otherwise the Microsoft 365 web app. */
export function providerFromApp(app: MailApp | null | undefined, email?: string | null): MailProvider | null | undefined {
  if (!app) return undefined // nothing said
  if (app === 'other') return null // said: a mail app, no web link
  if (app === 'outlook') return providerFromDomain(email) === 'outlook_live' ? 'outlook_live' : 'outlook'
  return app
}

export const PROVIDER_NAME: Record<MailProvider, string> = { gmail: 'Gmail', outlook: 'Outlook', outlook_live: 'Outlook', yahoo: 'Yahoo Mail' }

const enc = encodeURIComponent
const lf = (s: string) => s.replace(/\r\n?/g, '\n')

export type ComposeParts = { to: string | null; subject: string; body: string }

/** The provider's prefilled-compose URL. `from` (a Gmail address) picks the account in Gmail. */
export function composeUrl(p: MailProvider, m: ComposeParts, from?: string | null): string {
  const to = enc(m.to ?? '')
  const subject = enc(lf(m.subject))
  const body = enc(lf(m.body))
  switch (p) {
    case 'gmail':
      return `https://mail.google.com/mail/?${from ? `authuser=${enc(from)}&` : ''}view=cm&fs=1&to=${to}&su=${subject}&body=${body}`
    case 'outlook':
      return `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`
    case 'outlook_live':
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subject}&body=${body}`
    case 'yahoo':
      return `https://compose.mail.yahoo.com/?to=${to}&subject=${subject}&body=${body}`
  }
}

/** mailto: with the address's @ kept (some mail apps don't decode %40 there) and CRLF breaks. */
export function mailtoUrl(m: ComposeParts): string {
  const to = (m.to ?? '').split(/[,;\s]+/).filter(Boolean).map((a) => enc(a).replace(/%40/g, '@')).join(',')
  return `mailto:${to}?subject=${enc(lf(m.subject))}&body=${enc(lf(m.body).replace(/\n/g, '\r\n'))}`
}

/** Some mail apps drop a mailto past ~2000 characters; web compose URLs take far more, but
 *  browsers and Google/Microsoft front ends start refusing around 8 KB. */
export const MAILTO_SAFE = 1900
export const WEB_SAFE = 7000

export type Opened = { url: string; full: boolean }

/** The link to open: whole when it fits, else the same compose with no body (the page then
 *  shows the text with a Copy button). */
export function fitLink(kind: 'web' | 'app', m: ComposeParts, provider: MailProvider | null, from?: string | null): Opened {
  const make = (mm: ComposeParts) => (kind === 'app' || !provider ? mailtoUrl(mm) : composeUrl(provider, mm, from))
  const url = make(m)
  if (url.length <= (kind === 'app' || !provider ? MAILTO_SAFE : WEB_SAFE)) return { url, full: true }
  return { url: make({ ...m, body: '' }), full: false }
}

/* ------------------------------------------------------- RFC 2822 for Gmail */

const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s)
/** A header value, as an RFC 2047 encoded-word when it isn't plain ASCII (split under 75 chars). */
export function encodeHeader(s: string): string {
  const clean = s.replace(/[\r\n]+/g, ' ').trim()
  if (ascii(clean)) return clean
  // Split on characters (never inside a UTF-8 sequence), ~45 bytes per word → ≤ 75 chars each.
  const words: string[] = []
  let cur = ''
  for (const ch of clean) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 45) {
      words.push(cur)
      cur = ''
    }
    cur += ch
  }
  if (cur) words.push(cur)
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ')
}

/** "Name" <addr>, with the name encoded when needed. */
export function addressHeader(addr: string, name?: string | null): string {
  const n = (name ?? '').replace(/["\r\n<>]/g, '').trim()
  if (!n) return addr
  return ascii(n) ? `"${n}" <${addr}>` : `${encodeHeader(n)} <${addr}>`
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, (l) => `${l}\r\n`).trimEnd()

/** The message users.messages.send takes (before base64url): plain text, UTF-8, base64 body. */
export function buildRfc2822(m: {
  from: string
  fromName?: string | null
  to: string
  toName?: string | null
  subject: string
  body: string
  date?: Date
  /** A reply in a thread (lib/pen/mail-thread.ts replyHeaders): the Message-ID answered, and the chain. */
  inReplyTo?: string | null
  references?: string | null
}): string {
  if (/[\r\n]/.test(m.from + m.to)) throw new Error('bad address')
  const ids = (s: string | null | undefined) => (s ?? '').match(/<[^<>\s]+>/g)?.join(' ') ?? ''
  const inReplyTo = ids(m.inReplyTo).split(' ')[0]
  const references = ids(m.references)
  return [
    `From: ${addressHeader(m.from, m.fromName)}`,
    `To: ${addressHeader(m.to, m.toName)}`,
    `Subject: ${encodeHeader(m.subject)}`,
    ...(m.date ? [`Date: ${m.date.toUTCString().replace('GMT', '+0000')}`] : []),
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(lf(m.body).replace(/\n/g, '\r\n'), 'utf8').toString('base64')),
  ].join('\r\n')
}

export const toRaw = (rfc: string) => Buffer.from(rfc, 'utf8').toString('base64url')

/* ------------------------------------------------------------ which From */

export type SendAccount = { address: string; is_default: boolean; last_error?: string | null }
export type FromChoice = { address: string; why: 'override' | 'recipient' | 'default' } | { address: null; why: 'none' } | { address: null; why: 'no_match'; asked: string }

/** "work", "x@y.com", "my company email": the connected address it names, if exactly one. */
export function matchAccount(accounts: SendAccount[], said: string): SendAccount | null {
  const q = said.trim().toLowerCase()
  if (!q) return null
  const exact = accounts.find((a) => a.address === q)
  if (exact) return exact
  const words = q.split(/[^a-z0-9.@_-]+/).filter((w) => w.length >= 3 && !['from', 'the', 'email', 'mail', 'address', 'account', 'gmail', 'correo', 'cuenta', 'conta', 'mio', 'meu', 'my'].includes(w))
  const hits = accounts.filter((a) => words.some((w) => a.address.includes(w)))
  if (hits.length === 1) return hits[0]
  // "work": the one that isn't a consumer address, when there is exactly one.
  if (/\b(work|trabajo|trabalho|empresa|company|office|oficina)\b/.test(q)) {
    const biz = accounts.filter((a) => !providerFromDomain(a.address))
    if (biz.length === 1) return biz[0]
  }
  if (/\b(personal|private|privado|pessoal)\b/.test(q)) {
    const own = accounts.filter((a) => providerFromDomain(a.address))
    if (own.length === 1) return own[0]
  }
  return null
}

/** Override ("from my work email") > the address last used for this recipient > the default. */
export function chooseFrom(accounts: SendAccount[], o: { override?: string | null; lastForRecipient?: string | null } = {}): FromChoice {
  const usable = accounts.filter((a) => !a.last_error)
  const pool = usable.length ? usable : accounts
  if (!pool.length) return { address: null, why: 'none' }
  if (o.override?.trim()) {
    const hit = matchAccount(pool, o.override)
    return hit ? { address: hit.address, why: 'override' } : { address: null, why: 'no_match', asked: o.override.trim() }
  }
  const last = o.lastForRecipient?.toLowerCase()
  if (last && pool.some((a) => a.address === last)) return { address: last, why: 'recipient' }
  const def = pool.find((a) => a.is_default) ?? pool[0]
  return { address: def.address, why: 'default' }
}
