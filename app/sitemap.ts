import type { MetadataRoute } from 'next'
import { SITE, allEntries } from '@/lib/blog'

// The public pages of tryjunoapp.com: the Juno Pen landing, its legal pages and the blog.
// Scoped on purpose: the app, the news reader and the gated subdomains are not listed.
export const revalidate = 120

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries } = await allEntries().catch(() => ({ entries: [] as Awaited<ReturnType<typeof allEntries>>['entries'] }))
  const posts = entries.filter((e) => e.type === 'post' && !e.sample)
  const updates = entries.filter((e) => e.type === 'update' && !e.sample)
  const newest = (list: typeof entries) => (list[0] ? new Date(list[0].lastEdited) : undefined)
  return [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/blog`, lastModified: newest(posts), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE}/blog/whats-new`, lastModified: newest(updates), changeFrequency: 'weekly', priority: 0.6 },
    ...posts.map((p) => ({ url: `${SITE}/blog/${p.slug}`, lastModified: new Date(p.lastEdited), changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${SITE}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
