import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Subdomain roots: news.* → /news (the reader), gym.* → /gym.html (static plan).
// Only rewrites the root path; auth (/api/auth/*) and everything else pass through untouched,
// and the main domain (tryjunoapp.com) is unaffected.
export async function proxy(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0]
  const { pathname } = req.nextUrl
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

  // ai.tryjunoapp.com → The AI Stack, exported as static HTML under public/ai/.
  // Behind the same sign-in as the rest of the app: the static files sit in public/,
  // which Next serves without any auth of its own, so the gate has to live here.
  // /api/ask is the one server route the Stack needs and is handled by the app.
  if (host.startsWith('ai.')) {
    // Never gate these, or the gate fights itself:
    //  · /api/*      NextAuth's endpoints and /api/ask
    //  · /auth/*     the app's own sign-in PAGE. Gating it sent /auth/signin back to
    //                /api/auth/signin, which renders /auth/signin, which was gated —
    //                an infinite redirect that only appears once the domain is live.
    //  · /ai/_next/* the exported bundle's CSS, JS and fonts. These already point at
    //                their real public path, and gating them served the site unstyled.
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/auth/') ||
      pathname.startsWith('/ai/_next/')
    ) {
      return NextResponse.next()
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      const signin = new URL('/api/auth/signin', req.url)
      signin.searchParams.set('callbackUrl', req.url)
      return NextResponse.redirect(signin)
    }

    // The export was built with basePath '/ai', so its own links and assets already
    // carry the prefix. Only add it when it is missing, or the path doubles up. And
    // resolve directory URLs by hand: Next does not serve public/x/index.html for /x/.
    let target = pathname.startsWith('/ai') ? pathname : `/ai${pathname}`
    if (target === '/ai') target = '/ai/index.html'
    else if (target.endsWith('/')) target += 'index.html'

    const url = req.nextUrl.clone()
    url.pathname = target
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

// The gym and news rules only need the root; the AI Stack needs every path under
// ai.*, so the matcher now covers everything except Next internals and static assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
