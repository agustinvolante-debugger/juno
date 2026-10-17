// Images and files from the blog's Notion pages.
//
// Notion hands out signed S3 URLs that expire after about an hour, so a cached blog page can't
// embed them. Pages link here instead (/api/blog/media/<block-or-page-id>?v=<last-edited>), and
// this route asks Notion for a fresh URL on each uncached request:
//  · images up to ~4 MB are streamed through, with a year-long immutable cache. The `v` in the
//    URL changes whenever the block is edited, so a replaced image gets a new address.
//  · anything bigger (Vercel caps a function response at 4.5 MB) is a short-lived redirect to
//    the fresh signed URL, cached for less than the URL's lifetime.
// ?kind=cover reads a page's cover (the Cover property, or the page's own Notion cover).

import { NextResponse, type NextRequest } from 'next/server'
import { freshMediaUrl, notionBlogConfigured } from '@/lib/blog/notion'

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
const STREAM_MAX = 4 * 1024 * 1024

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id) || !notionBlogConfigured()) return new NextResponse('Not found', { status: 404 })
  const kind = req.nextUrl.searchParams.get('kind') === 'cover' ? 'cover' : 'block'

  let signed: string | null
  try {
    signed = await freshMediaUrl(id, kind)
  } catch (e) {
    console.error('[blog] media lookup failed', id, (e as Error).message)
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } })
  }
  if (!signed || !/^https:\/\//.test(signed)) return new NextResponse('Not found', { status: 404 })

  const redirect = () =>
    NextResponse.redirect(signed!, { status: 302, headers: { 'Cache-Control': 'public, max-age=600, s-maxage=2400' } })

  const upstream = await fetch(signed, { cache: 'no-store' }).catch(() => null)
  if (!upstream?.ok || !upstream.body) return redirect()
  const type = upstream.headers.get('content-type') ?? ''
  const size = Number(upstream.headers.get('content-length') ?? 'NaN')
  if (!type.startsWith('image/') || !(size <= STREAM_MAX)) {
    upstream.body.cancel().catch(() => {})
    return redirect()
  }
  const versioned = req.nextUrl.searchParams.has('v')
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
