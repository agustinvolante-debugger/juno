// Server side of the web's "Juno noticed" / "Juno is waiting on you": the rows as the browser
// sees them (WebSuggestion). Used by /api/pen/suggestions and by the Home page's first render,
// so the block is there on load instead of popping in above Today.

import { supabaseAdmin } from '@/lib/supabase'
import { userLang } from './user-lang'
import { listSuggestions, rank, whenText } from './suggestions'
import type { Suggestion } from './suggestions-types'
import type { WebSuggestion } from './suggestion-view'
import type { Lang } from './currency'

const MAX_PER_RECORDING = 3
const DID_DAYS = 14

function short(q: string | null): string | null {
  if (!q) return null
  const t = q.replace(/\s+/g, ' ').trim()
  return t.length > 120 ? `${t.slice(0, 117).replace(/\s+\S*$/, '')}…` : t
}

export function view(s: Suggestion, lang: Lang, titles: Map<string, string>): WebSuggestion {
  const d = s.detail ?? {}
  const cal = d.calendar as { ics?: string; google?: string } | undefined
  const decided = s.state === 'done' || s.state === 'accepted'
  return {
    id: s.id,
    sessionId: s.session_id,
    sessionTitle: s.session_id ? titles.get(s.session_id) ?? null : null,
    kind: s.kind,
    state: s.state,
    title: s.title,
    why: short(s.quote),
    when: whenText(s, lang),
    person: s.person,
    day: typeof d.date === 'string' && d.date ? d.date : typeof d.local === 'string' ? d.local.slice(0, 10) : null,
    doc: typeof d.doc === 'string' && d.doc ? d.doc : null,
    decidedAt: s.decided_at,
    done: decided
      ? {
          gcalLink: typeof d.gcal_link === 'string' ? d.gcal_link : null,
          ics: cal?.ics ?? null,
          google: cal?.google ?? null,
          notionUrl: typeof d.url === 'string' ? d.url : null,
          docDest: typeof d.url === 'string' ? (d.dest === 'google_docs' || d.url.includes('docs.google.com') ? 'google_docs' : 'notion') : null,
          remindAt: typeof d.remind_at === 'string' ? d.remind_at : null,
          toDoOnly: d.to_do_only === true,
          plain: d.plain === true,
        }
      : null,
  }
}

export async function titlesFor(email: string, rows: Suggestion[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.session_id).filter((x): x is string => !!x))]
  if (!ids.length) return new Map()
  const { data } = await supabaseAdmin.from('pen_sessions').select('id,title,source_name').eq('user_email', email).in('id', ids)
  return new Map(((data ?? []) as { id: string; title: string | null; source_name: string | null }[]).map((r) => [r.id, r.title || r.source_name || '']))
}


/** One recording's ≤3 open offers, best first. */
export async function recordingSuggestions(email: string, sessionId: string): Promise<WebSuggestion[]> {
  const lang = await userLang(email)
  const open = (await listSuggestions(email, { sessionId })).sort(rank).slice(0, MAX_PER_RECORDING)
  const titles = await titlesFor(email, open)
  return open.map((s) => view(s, lang, titles))
}

/** Home: every open offer (best first, at most 8) and what Juno did in the last DID_DAYS. */
export async function homeSuggestions(email: string): Promise<{ open: WebSuggestion[]; did: WebSuggestion[] }> {
  const lang = await userLang(email)
  const open = (await listSuggestions(email)).sort(rank).slice(0, 8)
  const since = new Date(Date.now() - DID_DAYS * 86_400_000).toISOString()
  const { data } = await supabaseAdmin
    .from('pen_suggestions').select('*').eq('user_email', email).in('state', ['done', 'accepted']).gte('decided_at', since)
    .order('decided_at', { ascending: false }).limit(6)
  const did = (data ?? []) as Suggestion[]
  const titles = await titlesFor(email, [...open, ...did])
  return { open: open.map((s) => view(s, lang, titles)), did: did.map((s) => view(s, lang, titles)) }
}
