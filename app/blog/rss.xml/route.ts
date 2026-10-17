// RSS 2.0 feed of posts and updates: /blog/rss.xml
import { BLOG_DESCRIPTION, BLOG_TITLE, SITE, allEntries, postUrl } from '@/lib/blog'

export const revalidate = 120

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const rfc822 = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toUTCString()

export async function GET() {
  const { entries } = await allEntries()
  const items = entries.slice(0, 50).map((e) => {
    const link = postUrl(e, true)
    return `    <item>
      <title>${esc(e.type === 'update' ? `What’s new: ${e.title}` : e.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(e.id)}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <dc:creator>${esc(e.author)}</dc:creator>
${e.tags.map((t) => `      <category>${esc(t)}</category>`).join('\n')}
      <description>${esc(e.summary)}</description>
    </item>`
  })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${esc(BLOG_TITLE)}</title>
    <link>${SITE}/blog</link>
    <description>${esc(BLOG_DESCRIPTION)}</description>
    <language>en</language>
    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
    ${entries.length ? `<lastBuildDate>${rfc822(entries.map((e) => e.lastEdited).sort().at(-1)!)}</lastBuildDate>` : ''}
${items.join('\n')}
  </channel>
</rss>
`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
  })
}
