// Renders Notion blocks as the article body. Server component, no client JS.
// Supported: paragraph, heading 1-3, bulleted/numbered lists (nested), to-do, quote, callout,
// divider, image (with caption), code, toggle, video/embed (YouTube, Vimeo, Loom), bookmark,
// link preview, file/pdf as a link, columns (stacked). Anything else is skipped quietly.

import { Fragment } from 'react'
import type { Block, RichText } from '@/lib/blog'

function isExternal(href: string) {
  return /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?tryjunoapp\.com/.test(href)
}

export function Rich({ text }: { text?: RichText[] }) {
  if (!text?.length) return null
  return (
    <>
      {text.map((r, i) => {
        const a = r.annotations ?? {}
        let node: React.ReactNode = r.plain_text
        if (a.code) node = <code>{node}</code>
        if (a.bold) node = <strong>{node}</strong>
        if (a.italic) node = <em>{node}</em>
        if (a.strikethrough) node = <s>{node}</s>
        if (a.underline) node = <u>{node}</u>
        if (a.color && a.color !== 'default') node = <span data-color={a.color}>{node}</span>
        if (r.href) {
          const ext = isExternal(r.href)
          node = (
            <a href={r.href} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {node}
            </a>
          )
        }
        return <Fragment key={i}>{node}</Fragment>
      })}
    </>
  )
}

const plain = (t?: RichText[]) => (t ?? []).map((r) => r.plain_text).join('')

/** A YouTube / Vimeo / Loom URL turned into its privacy-friendly embed URL, or null. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/)
      if (m) return `https://www.youtube-nocookie.com/embed/${m[2]}`
    }
    if (host === 'vimeo.com') {
      const m = u.pathname.match(/^\/(\d+)/)
      if (m) return `https://player.vimeo.com/video/${m[1]}?dnt=1`
    }
    if (host === 'loom.com') {
      const m = u.pathname.match(/^\/(share|embed)\/([\w-]+)/)
      if (m) return `https://www.loom.com/embed/${m[2]}`
    }
  } catch {}
  return null
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Caption({ text }: { text?: RichText[] }) {
  return text?.length ? <figcaption><Rich text={text} /></figcaption> : null
}

function Video({ url, caption }: { url: string; caption?: RichText[] }) {
  const src = embedUrl(url)
  if (src) {
    return (
      <figure className="bl-embed">
        <div className="bl-embed-frame">
          <iframe src={src} title={plain(caption) || 'Video'} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
        </div>
        <Caption text={caption} />
      </figure>
    )
  }
  // An uploaded video file (served through our media route) or a direct .mp4 link.
  if (url.startsWith('/api/blog/media/') || /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return (
      <figure className="bl-embed">
        <video src={url} controls preload="metadata" playsInline />
        <Caption text={caption} />
      </figure>
    )
  }
  return <LinkCard url={url} caption={caption} />
}

function LinkCard({ url, caption }: { url: string; caption?: RichText[] }) {
  const ext = isExternal(url)
  return (
    <a className="bl-card" href={url} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <span className="bl-card-title">{plain(caption) || hostOf(url)}</span>
      <span className="bl-card-url">{hostOf(url)}</span>
      <svg className="bl-card-arrow" viewBox="0 0 20 20" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 13.5 13.5 6.5M8 6.5h5.5V12" />
      </svg>
    </a>
  )
}

function One({ b }: { b: Block }) {
  const d = b.data
  const kids = b.children?.length ? <Blocks blocks={b.children} /> : null
  switch (b.type) {
    case 'paragraph':
      return d.rich_text?.length ? <p><Rich text={d.rich_text} /></p> : null
    // A Notion "Heading 1" sits under the page title, so it renders as h2 (one h1 per page).
    case 'heading_1':
      return <h2 className="bl-h1"><Rich text={d.rich_text} /></h2>
    case 'heading_2':
      return <h2><Rich text={d.rich_text} /></h2>
    case 'heading_3':
      return <h3><Rich text={d.rich_text} /></h3>
    case 'quote':
      return <blockquote><p><Rich text={d.rich_text} /></p>{kids}</blockquote>
    case 'callout':
      return (
        <aside className="bl-callout">
          {d.icon?.emoji && <span className="bl-callout-icon" aria-hidden>{d.icon.emoji}</span>}
          <div><p><Rich text={d.rich_text} /></p>{kids}</div>
        </aside>
      )
    case 'divider':
      return <hr />
    case 'image':
      if (!d.url) return null
      return (
        <figure className="bl-figure">
          {/* Plain <img>: sources are our media route or an author's external link, sizes unknown. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.url} alt={plain(d.caption)} loading="lazy" decoding="async" />
          <Caption text={d.caption} />
        </figure>
      )
    case 'video':
    case 'embed':
      return d.url ? <Video url={d.url} caption={d.caption} /> : null
    case 'bookmark':
    case 'link_preview':
      return d.url ? <LinkCard url={d.url} caption={d.caption} /> : null
    case 'file':
    case 'pdf':
      return d.url ? <LinkCard url={d.url} caption={d.caption?.length ? d.caption : [{ plain_text: 'Download the file' }]} /> : null
    case 'code':
      return (
        <figure className="bl-code">
          <pre><code data-lang={d.language}>{plain(d.rich_text)}</code></pre>
          <Caption text={d.caption} />
        </figure>
      )
    case 'toggle':
      return (
        <details className="bl-toggle">
          <summary>
            <span><Rich text={d.rich_text} /></span>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 4.4v11.2M4.4 10h11.2" /></svg>
          </summary>
          <div className="bl-toggle-body">{kids}</div>
        </details>
      )
    case 'to_do':
      return (
        <div className="bl-todo" data-done={d.checked ? 'true' : undefined}>
          <span className="bl-todo-box" aria-hidden>{d.checked && <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.6 10.4 8 13.8l7-7.6" /></svg>}</span>
          <span><span className="bl-sr">{d.checked ? 'Done: ' : 'To do: '}</span><Rich text={d.rich_text} /></span>
          {kids}
        </div>
      )
    case 'column_list':
    case 'column':
    case 'synced_block':
      return kids
    default:
      return null
  }
}

/** Groups consecutive list items into one <ul>/<ol>, the way Notion shows them. */
export function Blocks({ blocks }: { blocks: Block[] }) {
  const out: React.ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') {
      const run: Block[] = []
      while (i < blocks.length && blocks[i].type === b.type) run.push(blocks[i++])
      i--
      const items = run.map((li) => (
        <li key={li.id}>
          <Rich text={li.data.rich_text} />
          {li.children?.length ? <Blocks blocks={li.children} /> : null}
        </li>
      ))
      out.push(b.type === 'bulleted_list_item' ? <ul key={b.id}>{items}</ul> : <ol key={b.id}>{items}</ol>)
      continue
    }
    out.push(<One key={b.id} b={b} />)
  }
  return <>{out}</>
}
