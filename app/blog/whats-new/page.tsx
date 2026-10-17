import type { Metadata } from 'next'
import { SITE, formatDate, getEntry, getUpdates } from '@/lib/blog'
import { Blocks } from '../components/Blocks'
import Newsletter from '../components/Newsletter'
import { Back, SampleBanner } from '../components/bits'

export const revalidate = 120

const TITLE = 'What’s new in Juno Pen'
const DESCRIPTION = 'Every change we ship to Juno Pen, newest first: new features, fixes and improvements.'

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · The Juno Blog` },
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/blog/whats-new` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE}/blog/whats-new`, type: 'website' },
}

export default async function WhatsNew() {
  const { updates, source } = await getUpdates()
  const full = (await Promise.all(updates.map((u) => getEntry(u.slug)))).filter((u) => u !== null)

  return (
    <>
      {source === 'sample' && <SampleBanner />}
      <section className="blog-masthead blog-masthead-tight">
        <div className="lpa-wrap">
          <Back label="Blog" />
          <h1 className="blog-title">What&rsquo;s new</h1>
          <p className="blog-lede">{DESCRIPTION}</p>
        </div>
      </section>

      <div className="lpa-wrap">
        {full.length === 0 ? (
          <p className="blog-empty-all">No updates yet.</p>
        ) : (
          <ol className="log">
            {full.map((u) => (
              <li key={u.id} id={u.slug} className="log-item">
                <div className="log-when">
                  <time dateTime={u.date}>{formatDate(u.date)}</time>
                </div>
                <article className="log-body">
                  <h2 className="log-title">
                    <a href={`#${u.slug}`}>{u.title}</a>
                  </h2>
                  {u.summary && <p className="log-sum">{u.summary}</p>}
                  {u.blocks.length > 0 && (
                    <div className="prose prose-tight">
                      <Blocks blocks={u.blocks} />
                    </div>
                  )}
                  {u.tags.length > 0 && (
                    <ul className="blog-chips" aria-label="Areas">
                      {u.tags.map((t) => <li key={t} className="blog-chip">{t}</li>)}
                    </ul>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="lpa-wrap blog-news-wrap">
        <Newsletter from="whats-new" />
      </div>
    </>
  )
}
