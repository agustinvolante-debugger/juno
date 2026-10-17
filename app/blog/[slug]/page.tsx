import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { SITE, allEntries, formatDate, getEntry, readingMinutes } from '@/lib/blog'
import { Blocks } from '../components/Blocks'
import Newsletter from '../components/Newsletter'
import { Back, JsonLd, Meta, SampleBanner } from '../components/bits'

export const revalidate = 120

export async function generateStaticParams() {
  const { entries } = await allEntries()
  return entries.filter((e) => e.type === 'post').map((e) => ({ slug: e.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { entries } = await allEntries()
  const post = entries.find((e) => e.slug === slug)
  if (!post) return { title: 'Not found', robots: { index: false } }
  const title = post.seoTitle || post.title
  const description = post.seoDescription || post.summary || undefined
  const url = `${SITE}/blog/${post.slug}`
  return {
    title,
    description,
    authors: [{ name: post.author }],
    alternates: { canonical: url },
    keywords: post.tags,
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      publishedTime: post.date,
      modifiedTime: post.lastEdited,
      authors: [post.author],
      tags: post.tags,
      // The image is the generated card (opengraph-image.tsx next to this page).
    },
  }
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params
  const post = await getEntry(slug)
  if (!post) notFound()
  // Updates live on the changelog, not on a page of their own.
  if (post.type === 'update') permanentRedirect(`/blog/whats-new#${post.slug}`)

  const { entries } = await allEntries()
  const more = entries.filter((e) => e.type === 'post' && e.id !== post.id).slice(0, 3)
  const url = `${SITE}/blog/${post.slug}`

  return (
    <>
      {post.sample && <SampleBanner />}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.seoDescription || post.summary,
          datePublished: post.date,
          dateModified: post.lastEdited,
          author: { '@type': 'Person', name: post.author },
          publisher: { '@type': 'Organization', name: 'Juno Pen', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/juno_mark.png` } },
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          url,
          image: post.cover ? (post.cover.startsWith('/') ? `${SITE}${post.cover}` : post.cover) : `${url}/opengraph-image`,
          keywords: post.tags.join(', '),
        }}
      />

      <article className="blog-article">
        <header className="blog-article-head lpa-wrap">
          <Back />
          <h1 className="blog-article-title">{post.title}</h1>
          {post.summary && <p className="blog-article-lede">{post.summary}</p>}
          <div className="blog-article-meta">
            <Meta post={post} minutes={readingMinutes(post.blocks)} />
            {post.tags.length > 0 && (
              <ul className="blog-chips" aria-label="Topics">
                {post.tags.map((t) => <li key={t} className="blog-chip">{t}</li>)}
              </ul>
            )}
          </div>
        </header>

        {post.cover && (
          <div className="lpa-wrap">
            <figure className="blog-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.cover} alt="" decoding="async" fetchPriority="high" />
            </figure>
          </div>
        )}

        <div className="lpa-wrap">
          <div className="prose">
            <Blocks blocks={post.blocks} />
          </div>
        </div>
      </article>

      <div className="lpa-wrap blog-news-wrap blog-news-col">
        <Newsletter from={`post:${post.slug}`} />
      </div>

      {more.length > 0 && (
        <section className="lpa-wrap blog-section blog-more" aria-labelledby="more-h">
          <h2 id="more-h" className="blog-section-h">Keep reading</h2>
          <ol className="blog-list">
            {more.map((p) => (
              <li key={p.id} className="blog-row">
                <time className="blog-row-date" dateTime={p.date}>{formatDate(p.date)}</time>
                <div className="blog-row-body">
                  <h3 className="blog-row-title"><Link href={`/blog/${p.slug}`}>{p.title}</Link></h3>
                  {p.summary && <p className="blog-row-sum">{p.summary}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
