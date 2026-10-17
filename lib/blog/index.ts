// The one entry point the blog pages use. Reads Notion when it is configured and falls back to
// the sample fixtures otherwise, or when Notion errors, so a page never crashes on a missing
// token or a Notion outage. A failure is logged; a built page keeps its last good copy anyway,
// because ISR only replaces a page when the regeneration succeeds.

import { cache } from 'react'
import { FIXTURES } from './fixtures'
import { notionBlogConfigured, notionEntries, notionPostBlocks } from './notion'
import type { Post, PostWithBlocks } from './types'

export { BLOG_REVALIDATE, BLOG_TAG } from './notion'
export type { Post, PostWithBlocks, Block, RichText } from './types'

export const SITE = 'https://www.tryjunoapp.com'
export const BLOG_TITLE = 'The Juno Blog'
export const BLOG_DESCRIPTION =
  'Notes from the team building Juno Pen: how people use it, what we shipped, and what we learned about turning real conversations into work done.'

export type Source = 'notion' | 'sample'

const strip = ({ blocks: _blocks, ...post }: PostWithBlocks): Post => post

/** All published entries, newest first, plus where they came from. */
export const allEntries = cache(async (): Promise<{ entries: Post[]; source: Source }> => {
  if (notionBlogConfigured()) {
    try {
      return { entries: await notionEntries(), source: 'notion' }
    } catch (e) {
      // In production a Notion error must surface in a regeneration failure rather than
      // replacing real posts with samples; ISR then keeps serving the last good page.
      // During `next build` a throw would fail the whole deploy, so the build gets an empty
      // blog instead and the first revalidation (BLOG_REVALIDATE seconds later) fills it in.
      if (process.env.NEXT_PHASE === 'phase-production-build') {
        console.error('[blog] Notion read failed during build:', (e as Error).message)
        return { entries: [], source: 'notion' }
      }
      if (process.env.NODE_ENV === 'production') throw e
      console.error('[blog] Notion read failed, showing samples:', (e as Error).message)
    }
  }
  return { entries: FIXTURES.map(strip), source: 'sample' }
})

export async function getPosts() {
  const { entries, source } = await allEntries()
  return { posts: entries.filter((e) => e.type === 'post'), source }
}

export async function getUpdates() {
  const { entries, source } = await allEntries()
  return { updates: entries.filter((e) => e.type === 'update'), source }
}

export const getEntry = cache(async (slug: string): Promise<PostWithBlocks | null> => {
  const { entries, source } = await allEntries()
  const post = entries.find((e) => e.slug === slug)
  if (!post) return null
  if (source === 'sample') return FIXTURES.find((f) => f.id === post.id) ?? null
  return notionPostBlocks(post)
})

/** Tags in use on posts, most used first. */
export function tagsOf(posts: Post[]): string[] {
  const count = new Map<string, number>()
  for (const p of posts) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
}

export function postUrl(p: Pick<Post, 'slug' | 'type'>, absolute = false): string {
  const path = p.type === 'update' ? `/blog/whats-new#${p.slug}` : `/blog/${p.slug}`
  return absolute ? `${SITE}${path}` : path
}

export function formatDate(iso: string, style: 'long' | 'short' = 'long'): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return d.toLocaleDateString('en-US', style === 'long'
    ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Rough reading time from the blocks' text, at 230 words a minute. */
export function readingMinutes(blocks: PostWithBlocks['blocks']): number {
  let words = 0
  const walk = (bs: PostWithBlocks['blocks']) => {
    for (const b of bs) {
      for (const r of b.data.rich_text ?? []) words += r.plain_text.split(/\s+/).filter(Boolean).length
      if (b.children) walk(b.children)
    }
  }
  walk(blocks)
  return Math.max(1, Math.round(words / 230))
}
