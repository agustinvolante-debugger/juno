import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Subdomain roots: news.* → /news (the reader), gym.* → /gym.html (static plan).
// Juno Pen is the root domain itself; pen.* redirects there.
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
  // Juno Pen lives at the root domain. tryjunoapp.com/ is the landing page (signed out) or the
  // app (signed in), served by the real /pen route so it keeps its own layout and fonts.
  const isRoot = host === 'tryjunoapp.com' || host === 'www.tryjunoapp.com'
  if (isRoot) {
    const map: Record<string, string> = { '/': '/pen', '/signup': '/pen/signup', '/settings': '/pen/settings', '/settings/hours': '/pen/settings/hours', '/settings/whatsapp': '/pen/settings/whatsapp' }
    // One address per page: /pen itself redirects to the clean root.
    if (pathname === '/pen') return NextResponse.redirect(new URL('/', req.url), 308)
    if (map[pathname]) {
      const url = req.nextUrl.clone()
      url.pathname = map[pathname]
      const res = NextResponse.rewrite(url)
      // The landing page's language switch (?m=en|es|pt) is remembered for a year, so a
      // Chilean in San Francisco who picks Español keeps getting it. See app/pen/page.tsx.
      const m = req.nextUrl.searchParams.get('m')
      if (pathname === '/' && (m === 'en' || m === 'es' || m === 'pt')) {
        res.cookies.set('juno_lang', m, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
      }
      return res
    }
  }

  // pen.tryjunoapp.com was the old address. Pages redirect to the same place on the root, so
  // old links and emails keep working. /api is left alone: Stripe and AssemblyAI post to
  // webhooks here, and a webhook does not follow a redirect.
  if (host.startsWith('pen.') && !pathname.startsWith('/api/') && !pathname.startsWith('/_next/')) {
    const path = pathname === '/pen' ? '/' : pathname
    const target = new URL(`https://tryjunoapp.com${path}${req.nextUrl.search}`)
    return NextResponse.redirect(target, 308)
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
