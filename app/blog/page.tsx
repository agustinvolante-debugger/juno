import type { Metadata } from 'next'
import Link from 'next/link'
import { BLOG_DESCRIPTION, BLOG_TITLE, SITE, formatDate, getPosts, getUpdates, tagsOf } from '@/lib/blog'
import Newsletter from './components/Newsletter'
import PostList from './components/PostList'
import { JsonLd, SampleBanner } from './components/bits'

// Notion publishes show up within two minutes, no deploy (BLOG_REVALIDATE).
export const revalidate = 120

export const metadata: Metadata = {
  title: { absolute: BLOG_TITLE },
  description: BLOG_DESCRIPTION,
  alternates: { canonical: `${SITE}/blog` },
  openGraph: { title: BLOG_TITLE, description: BLOG_DESCRIPTION, url: `${SITE}/blog`, type: 'website' },
}

/** A waveform drawn from the title: same post, same shape. Decorative, so hidden from readers. */
function Voiceprint({ seed }: { seed: string }) {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
  const n = 56
  const bars = Array.from({ length: n }, (_, i) => {
    const env = Math.sin((Math.PI * (i + 0.5)) / n) ** 0.7
    return Math.round(10 + 86 * env * (0.35 + 0.65 * rand()))
  })
  // A short run in the action blue: the moment Juno heard something worth doing.
  const hot = 18 + Math.floor(rand() * 20)
  return (
    <div className="blog-wave" aria-hidden>
      {bars.map((v, i) => (
        <span key={i} style={{ '--h': v, '--i': i } as React.CSSProperties} data-hot={i >= hot && i < hot + 5 ? '' : undefined} />
      ))}
    </div>
  )
}

export default async function BlogIndex() {
  const [{ posts, source }, { updates }] = await Promise.all([getPosts(), getUpdates()])
  const [featured, ...rest] = posts
  const list = rest.map((p) => ({ ...p, dateLabel: formatDate(p.date) }))

  return (
    <>
      {source === 'sample' && <SampleBanner />}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: BLOG_TITLE,
          description: BLOG_DESCRIPTION,
          url: `${SITE}/blog`,
          publisher: { '@type': 'Organization', name: 'Juno Pen', url: SITE, logo: `${SITE}/juno_mark.png` },
          blogPost: posts.slice(0, 10).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: p.date })),
        }}
      />

      <section className="blog-masthead">
        <div className="lpa-wrap">
          <h1 className="blog-title">The <span className="lpa-j">J</span>uno Blog</h1>
          <p className="blog-lede">{BLOG_DESCRIPTION}</p>
        </div>
      </section>

      {featured ? (
        <section className="lpa-wrap" aria-label="Latest post">
          <Link href={`/blog/${featured.slug}`} className="blog-feature" data-cover={featured.cover ? 'true' : undefined}>
            <div className="blog-feature-copy">
              <h2 className="blog-feature-title">{featured.title}</h2>
              {featured.summary && <p className="blog-feature-sum">{featured.summary}</p>}
              <p className="blog-feature-by">
                <span>{featured.author} · <time dateTime={featured.date}>{formatDate(featured.date)}</time></span>
                <span className="blog-feature-read">
                  Read the post
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8.2 5.2 13 10l-4.8 4.8" /></svg>
                </span>
              </p>
            </div>
            {featured.cover ? (
              <div className="blog-feature-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={featured.cover} alt="" loading="eager" decoding="async" />
              </div>
            ) : (
              <Voiceprint seed={featured.title} />
            )}
          </Link>
        </section>
      ) : (
        <section className="lpa-wrap">
          <p className="blog-empty-all">The first post is on its way. Subscribe below and it will come to you.</p>
        </section>
      )}

      {list.length > 0 && (
        <section className="lpa-wrap blog-section" aria-labelledby="more-h">
          <h2 id="more-h" className="blog-section-h">More posts</h2>
          <PostList posts={list} tags={tagsOf(rest)} />
        </section>
      )}

      {updates.length > 0 && (
        <section className="blog-band" aria-labelledby="new-h">
          <div className="lpa-wrap blog-band-in">
            <div className="blog-band-head">
              <h2 id="new-h" className="blog-section-h">What&rsquo;s new</h2>
              <p className="blog-band-sub">The latest changes to Juno Pen, newest first.</p>
              <Link href="/blog/whats-new" className="lpa-link">
                All updates
                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.2 5.2 13 10l-4.8 4.8" /></svg>
              </Link>
            </div>
            <ol className="blog-mini-log">
              {updates.slice(0, 3).map((u) => (
                <li key={u.id}>
                  <time dateTime={u.date}>{formatDate(u.date, 'short')}</time>
                  <Link href={`/blog/whats-new#${u.slug}`}>{u.title}</Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <div className="lpa-wrap blog-news-wrap">
        <Newsletter from="blog-index" />
      </div>
    </>
  )
}
