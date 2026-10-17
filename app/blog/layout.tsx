import type { Metadata, Viewport } from 'next'
import { Newsreader, Lora } from 'next/font/google'
import Link from 'next/link'
import Image from 'next/image'
// The landing page's stylesheet, for the same nav, footer, buttons and tokens (all .lpa-*).
import '../pen/landing-apple.css'
import './blog.css'
import { BLOG_DESCRIPTION, BLOG_TITLE, SITE } from '@/lib/blog'
import { DOCS_URL as DOCS } from '@/lib/docs-url'

// The landing page's faces (app/pen/layout.tsx): Newsreader italic for headings and the
// wordmark "J", Lora for reading. Same configuration, so next/font serves the same files.
const lpHead = Newsreader({
  subsets: ['latin'],
  style: 'italic',
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-lp-head',
})
const lpBody = Lora({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-lp-body',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: BLOG_TITLE, template: '%s · The Juno Blog' },
  description: BLOG_DESCRIPTION,
  applicationName: 'Juno Pen',
  icons: { icon: [{ url: '/juno_mark.png', type: 'image/png', sizes: '256x256' }], apple: '/juno_mark.png' },
  alternates: { types: { 'application/rss+xml': `${SITE}/blog/rss.xml` } },
  openGraph: { siteName: 'Juno Pen', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
  colorScheme: 'light',
}

const SIGN_IN = '/auth/signin?callbackUrl=/pen'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lpa blog ${lpHead.variable} ${lpBody.variable}`}>
      <a href="#blog-main" className="lpa-skip">Skip to content</a>
      <header className="lpa-nav">
        <div className="lpa-wrap lpa-nav-in">
          <div className="blog-brand">
            <Link href="/" className="lpa-brand" aria-label="Juno Pen, home">
              <Image src="/juno_mark.png" alt="" width={26} height={26} className="lpa-mark" priority />
              <span><span className="lpa-j">J</span>uno Pen</span>
            </Link>
            <Link href="/blog" className="blog-brand-section">Blog</Link>
          </div>
          <nav className="lpa-nav-links" aria-label="Blog">
            <Link href="/blog/whats-new" className="lpa-navlink lpa-hide-sm">What&rsquo;s new</Link>
            <a href={DOCS} className="lpa-navlink lpa-hide-sm">Docs</a>
            <Link href={SIGN_IN} className="lpa-navlink lpa-hide-sm">Sign in</Link>
            <Link href="/pen/signup?from=blog" className="lpa-btn lpa-btn-sm">Get Juno Pen</Link>
          </nav>
        </div>
      </header>

      <main id="blog-main" className="blog-main">{children}</main>

      <footer className="lpa-foot">
        <div className="lpa-wrap">
          <div className="lpa-foot-row">
            <nav className="lpa-foot-links" aria-label="Juno Pen">
              <Link href="/">Juno Pen</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/blog/whats-new">What&rsquo;s new</Link>
              <a href={DOCS}>Docs</a>
              <a href="/blog/rss.xml">RSS</a>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href={SIGN_IN}>Sign in</Link>
            </nav>
            <a className="blog-foot-mail" href="mailto:hello@tryjunoapp.com">hello@tryjunoapp.com</a>
          </div>
          <p className="lpa-copy">&copy; {new Date().getFullYear()} <span className="lpa-j">J</span>uno Pen</p>
        </div>
      </footer>
    </div>
  )
}
