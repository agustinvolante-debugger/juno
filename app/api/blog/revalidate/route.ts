// On-demand refresh of the blog, for when two minutes is too long to wait.
//   GET or POST /api/blog/revalidate?secret=<BLOG_REVALIDATE_SECRET>
// Marks every Notion read stale and re-renders the blog pages on their next visit.
// Without BLOG_REVALIDATE_SECRET set, the route is off.

import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { timingSafeEqual } from 'node:crypto'
import { BLOG_TAG } from '@/lib/blog'

function ok(given: string | null): boolean {
  const secret = process.env.BLOG_REVALIDATE_SECRET
  if (!secret || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handle(req: NextRequest) {
  const given = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-blog-secret')
  if (!ok(given)) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })
  revalidateTag(BLOG_TAG, { expire: 0 })
  revalidatePath('/blog', 'layout')
  revalidatePath('/sitemap.xml')
  return NextResponse.json({ ok: true, revalidated: ['/blog', '/blog/*', '/blog/whats-new', '/blog/rss.xml', '/sitemap.xml'] })
}

export const GET = handle
export const POST = handle
