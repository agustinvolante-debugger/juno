'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Post } from '@/lib/blog/types'

/**
 * The list of posts under the featured one, with an optional tag filter. Filtering is client-side:
 * the full list is in the server-rendered HTML (good for search engines and no-JS readers), and a
 * chip only hides rows. A blog this size never needs a server round trip for it.
 */
export default function PostList({ posts, tags }: { posts: (Post & { dateLabel: string })[]; tags: string[] }) {
  const [tag, setTag] = useState<string | null>(null)
  const shown = tag ? posts.filter((p) => p.tags.includes(tag)) : posts

  return (
    <div className="blog-list-wrap">
      {tags.length > 1 && (
        <div className="blog-tags" role="group" aria-label="Filter by topic">
          <button type="button" className="blog-tag" aria-pressed={tag === null} onClick={() => setTag(null)}>All</button>
          {tags.map((t) => (
            <button key={t} type="button" className="blog-tag" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
          ))}
        </div>
      )}
      <ol className="blog-list" aria-live="polite">
        {shown.map((p) => (
          <li key={p.id} className="blog-row">
            <time className="blog-row-date" dateTime={p.date}>{p.dateLabel}</time>
            <div className="blog-row-body">
              <h3 className="blog-row-title">
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </h3>
              {p.summary && <p className="blog-row-sum">{p.summary}</p>}
              <p className="blog-row-meta">
                <span>{p.author}</span>
                {p.tags.length > 0 && <span aria-hidden>·</span>}
                {p.tags.length > 0 && <span>{p.tags.join(', ')}</span>}
              </p>
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="blog-empty">Nothing under this topic yet.</li>}
      </ol>
    </div>
  )
}
