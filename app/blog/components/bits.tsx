import Link from 'next/link'
import type { Post } from '@/lib/blog'
import { formatDate } from '@/lib/blog'

/** Shown only while the pages are fed by the sample fixtures (no Notion integration yet). */
export function SampleBanner() {
  return (
    <div className="blog-sample" role="note">
      <div className="lpa-wrap">
        <strong>Preview.</strong> These are sample posts. They are replaced by the Juno Blog database in Notion once it is connected.
      </div>
    </div>
  )
}

export function Meta({ post, minutes }: { post: Post; minutes?: number }) {
  return (
    <p className="blog-meta">
      <span>{post.author}</span>
      <span aria-hidden>·</span>
      <time dateTime={post.date}>{formatDate(post.date)}</time>
      {minutes ? (
        <>
          <span aria-hidden>·</span>
          <span>{minutes} min read</span>
        </>
      ) : null}
    </p>
  )
}

export function Back({ href = '/blog', label = 'All posts' }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="blog-back">
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11.8 5.2 7 10l4.8 4.8" /></svg>
      {label}
    </Link>
  )
}

/** Article JSON-LD, escaped as the Next.js guide recommends. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
