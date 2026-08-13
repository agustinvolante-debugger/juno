import { NextResponse, type NextRequest } from 'next/server'

// Subdomain roots: news.* → /news (the reader), gym.* → /gym.html (static plan).
// Only rewrites the root path; auth (/api/auth/*) and everything else pass through untouched,
// and the main domain (tryjunoapp.com) is unaffected.
export function proxy(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0]
  if (host.startsWith('news.') && req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = '/news'
    return NextResponse.rewrite(url)
  }
  // gym.tryjunoapp.com → the static training/nutrition plan in public/.
  if (host.startsWith('gym.') && req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = '/gym.html'
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/'] }
