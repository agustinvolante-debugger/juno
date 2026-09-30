// Server-rendered building blocks for the Daily Brief (rows, lead, sections, market tiles).
import type { ReactNode } from 'react'
import type { Item, Stat } from '@/lib/news/feeds'
import { faviconFor, youtubeId, statAgeDays } from '@/lib/news/rank'

export function rel(d: string | null | undefined): { txt: string; fresh: boolean } {
  if (!d) return { txt: '', fresh: false }
  const t = Date.parse(d)
  if (isNaN(t)) return { txt: '', fresh: false }
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 3600) return { txt: `${Math.max(1, Math.floor(s / 60))}m`, fresh: true }
  if (s < 86400) return { txt: `${Math.floor(s / 3600)}h`, fresh: false }
  return { txt: `${Math.floor(s / 86400)}d`, fresh: false }
}

export function Acts({ it, es, always = false }: { it: Item; es: boolean; always?: boolean }) {
  return (
    <div className={`db-row-acts${always ? ' is-on' : ''}`}>
      <button type="button" className="db-act db-save" data-l={it.l} data-t={it.t} data-s={it.s} data-d={it.d || ''} aria-pressed="false" aria-label={es ? 'Guardar' : 'Save'}>
        <svg width="16" height="16" aria-hidden><use href="#db-i-star" /></svg>
      </button>
      <button type="button" className="db-act db-share" data-l={it.l} data-t={it.t} aria-label={es ? 'Compartir' : 'Share'}>
        <svg width="16" height="16" aria-hidden><use href="#db-i-share" /></svg>
      </button>
    </div>
  )
}

// Row icons are drawn once and referenced, so 200 rows don't each carry two inline SVGs.
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <symbol id="db-i-star" viewBox="0 0 16 16"><path d="M8 1.9l1.8 3.8 4.1.5-3 2.8.8 4.1L8 11.1 4.3 13.1l.8-4.1-3-2.8 4.1-.5z" /></symbol>
      <symbol id="db-i-share" viewBox="0 0 16 16"><path d="M8 10V2.2M5.2 4.8L8 2l2.8 2.8M3.5 8v5.2h9V8" /></symbol>
    </svg>
  )
}

export function Meta({ it, extra = 0, section, es, fav = true, children }: {
  it: Item; extra?: number; section?: string; es: boolean; fav?: boolean; children?: ReactNode
}) {
  const r = rel(it.d)
  const icon = fav ? faviconFor(it) : null
  return (
    <div className="db-meta">
      {fav && (icon
        ? <img className="db-fav" src={icon} width={14} height={14} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        : <span className="db-fav is-blank" aria-hidden>{(it.s || '·').replace(/^r\//, '').charAt(0).toUpperCase()}</span>)}
      <span className="db-src">{it.s}</span>
      {r.txt && <time className={`db-time${r.fresh ? ' is-fresh' : ''}`} dateTime={it.d || undefined}>· {r.txt}</time>}
      {extra > 0 && <span className="db-plus">· +{extra} {es ? (extra === 1 ? 'fuente' : 'fuentes') : (extra === 1 ? 'source' : 'sources')}</span>}
      {section && <span className="db-sec-tag">· {section}</span>}
      {children}
    </div>
  )
}

export function Row({ it, title, k, extra, section, es, children }: {
  it: Item; title: string; k: string; extra?: number; section?: string; es: boolean; children?: ReactNode
}) {
  return (
    <li className="db-row" data-row data-l={it.l}>
      <a className="db-row-t" href={it.l} target="_blank" rel="noopener noreferrer" data-s={it.s} data-k={k}>{title}</a>
      <Meta it={it} extra={extra} section={section} es={es}>{children}</Meta>
      <Acts it={it} es={es} />
    </li>
  )
}

export function Lead({ it, title, dek, k, extra, section, es }: {
  it: Item; title: string; dek: string; k: string; extra: number; section?: string; es: boolean
}) {
  return (
    <article className="db-lead" data-row data-l={it.l}>
      <a className="db-lead-t" href={it.l} target="_blank" rel="noopener noreferrer" data-s={it.s} data-k={k}>{title}</a>
      {dek && <p className="db-lead-dek">{dek}</p>}
      <Meta it={it} extra={extra} section={section} es={es} />
      <Acts it={it} es={es} />
    </article>
  )
}

export function VideoRow({ it, k, es, card = false }: { it: Item; k: string; es: boolean; card?: boolean }) {
  const id = youtubeId(it.l)
  const thumb = id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
  const Tag = card ? 'div' : 'li'
  return (
    <Tag className={card ? 'db-vcard' : 'db-vrow'} data-row data-l={it.l}>
      <a className="db-vthumb" href={it.l} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden>
        {thumb ? <img src={thumb} alt="" width={320} height={180} loading="lazy" decoding="async" /> : <span />}
      </a>
      <div className="db-vbody">
        <a className="db-row-t" href={it.l} target="_blank" rel="noopener noreferrer" data-s={it.s} data-k={k}>{it.t}</a>
        <Meta it={it} es={es} fav={false} />
      </div>
      <Acts it={it} es={es} />
    </Tag>
  )
}

const CODE: Record<string, string> = {
  'United States': 'US', 'Euro Area': 'EA', 'United Kingdom': 'UK', Germany: 'DE', France: 'FR', Japan: 'JP', China: 'CN',
  'Hong Kong': 'HK', India: 'IN', Canada: 'CA', Australia: 'AU', Chile: 'CL', Brazil: 'BR', Argentina: 'AR',
}

export type Tile = Stat & { id: string; country: string; group: string }

// A market/macro value. Change colour follows the sign of the move; macro prints show their
// month, and anything older than ~4 months is greyed with its date so it can't pass as current.
export function tileParts(m: Tile, es: boolean) {
  const code = m.group === 'Economic Data' ? CODE[m.country] || '' : ''
  const isChange = /^[+-−]?\d[\d.,]*%$/.test((m.sub || '').trim())
  const age = isChange ? null : statAgeDays(m.sub)
  const stale = age !== null && age > 120
  const dir = isChange ? ((m.sub || '').trim().startsWith('-') ? 'is-down' : 'is-up') : ''
  const note = stale ? `${es ? 'dato de' : 'as of'} ${m.sub}` : m.sub
  return { code, dir, stale, note }
}

export function MarketTile({ m, es }: { m: Tile; es: boolean }) {
  const { code, dir, stale, note } = tileParts(m, es)
  return (
    <div className={`db-tile${stale ? ' is-stale' : ''}`} title={stale ? (es ? `Último dato: ${m.sub}` : `Last data point: ${m.sub}`) : undefined}>
      <span className="db-tile-l">{code && <span className="db-tile-code">{code}</span>}{m.label}</span>
      <span className="db-tile-v">{m.value}</span>
      {note && <span className={`db-tile-c ${dir}`}>{note}</span>}
    </div>
  )
}

export function MarketChip({ m, es }: { m: Tile; es: boolean }) {
  const { code, dir, stale, note } = tileParts(m, es)
  return (
    <span className={`db-mchip${stale ? ' is-stale' : ''}`}>
      <span className="db-mchip-l">{code ? `${code} ` : ''}{m.label}</span>
      <span className="db-mchip-v">{m.value}</span>
      {note && <span className={`db-mchip-c ${dir}`}>{note}</span>}
    </span>
  )
}
