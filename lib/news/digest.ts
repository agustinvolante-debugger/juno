import { getFeedCache, getSectionBriefs, getTranslations, setTranslations } from '@/lib/news/store'
import { buildNewsDigestHtml } from '@/lib/news/digest-html'
import { SECTIONS, SECTION_QUERIES, ES_LABELS, ES_NATIVE } from '@/lib/news/feeds'
import { translateTitles, translateParagraphs } from '@/lib/news/ai'

// The daily email's content, built once per language per send (app/api/news/digest).
const APP_URL = 'https://news.tryjunoapp.com'
// Sections to include in the digest: the AI-curated ones (with briefs), in catalog order.
const DIGEST_SECTIONS = Object.keys(SECTION_QUERIES)
const PER_SECTION = 5 // what digest-html shows; only these get translated

export type Lang = 'en' | 'es'
export const langOf = (l: string | null | undefined): Lang => (l === 'es' ? 'es' : 'en')

/**
 * The email in the reader's language: the one they set on the page (EN/ES). Spanish uses the same
 * headline translations the page caches per link (news_translations), so a story translated for
 * the page isn't paid for twice, plus one call for the section summaries. If a translation fails,
 * that line stays in English rather than the email not going out.
 */
export async function buildDigestHtml(lang: Lang): Promise<string | null> {
  const [cache, briefs] = await Promise.all([getFeedCache(), getSectionBriefs()])
  const es = lang === 'es'
  const sections = DIGEST_SECTIONS
    .map((key) => ({
      key,
      label: (es && ES_LABELS[key]) || SECTIONS.find((s) => s.key === key)?.label || key,
      brief: briefs[key] || '',
      items: (cache[key] || []).slice(0, PER_SECTION).map((it) => ({ t: it.t, l: it.l, s: it.s })),
    }))
    .filter((s) => s.items.length)
  if (!sections.length) return null

  if (es) {
    // Headlines (sections already written in Spanish, like Chile, are left alone).
    const titleByLink: Record<string, string> = {}
    for (const s of sections) if (!ES_NATIVE.has(s.key)) for (const it of s.items) titleByLink[it.l] = it.t
    const links = Object.keys(titleByLink)
    const cached = await getTranslations(links).catch(() => ({} as Record<string, string>))
    const missing = links.filter((l) => !cached[l])
    const tr = { ...cached }
    if (missing.length) {
      const out = await translateTitles(missing.map((l) => titleByLink[l]), 'es')
      const fresh: Record<string, string> = {}
      missing.forEach((l, i) => { if (out[i]) fresh[l] = out[i] })
      await setTranslations(fresh).catch(() => {})
      Object.assign(tr, fresh)
    }
    for (const s of sections) for (const it of s.items) it.t = tr[it.l] || it.t
    // Summaries: one call for all of them.
    const withBrief = sections.filter((s) => s.brief && !ES_NATIVE.has(s.key))
    const out = await translateParagraphs(withBrief.map((s) => s.brief))
    withBrief.forEach((s, i) => { if (out[i]) s.brief = out[i] })
  }

  const dateStr = new Date().toLocaleDateString(es ? 'es-CL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })
  return buildNewsDigestHtml({ sections, dateStr, appUrl: APP_URL, lang })
}

export const digestSubject = (lang: Lang) =>
  lang === 'es'
    ? `▦ Resumen diario — ${new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`
    : `▦ Daily Brief — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
