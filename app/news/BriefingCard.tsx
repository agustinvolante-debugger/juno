'use client'
import { useEffect, useState } from 'react'
import ListenButton from './ListenButton'
import { ChevronIcon } from './Icons'

type Bullet = { t: string; l: string }

function ago(iso: string | null, es: boolean): string {
  if (!iso) return ''
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000))
  if (isNaN(m)) return ''
  const rel = m < 1 ? (es ? 'recién' : 'just now') : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`
  return `${es ? 'actualizado' : 'updated'} ${rel}${m >= 1 ? (es ? '' : ' ago') : ''}`
}

// "Today's briefing" — the one card on the page. Signed in: three AI bullets over the Top 7,
// generated once per day (the route caches them) and swapped in when they arrive; until then,
// and for signed-out readers, the top three headlines stand in. Collapsible for the day.
export default function BriefingCard({ day, initial, initialAt, fallback, top, authed, lang = 'en', listen, updatedAt }: {
  day: string; initial: Bullet[] | null; initialAt: string | null; fallback: Bullet[]; top: { t: string; l: string; s: string }[]
  authed: boolean; lang?: string; listen: string; updatedAt: string | null
}) {
  const es = lang === 'es'
  const [bullets, setBullets] = useState<Bullet[]>(initial || fallback)
  const [at, setAt] = useState<string | null>(initialAt || updatedAt)
  const [collapsed, setCollapsed] = useState(false)
  const [stamp, setStamp] = useState('')

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('db:brief-collapsed') === day) } catch { /* private mode */ }
  }, [day])

  useEffect(() => {
    if (!authed || initial || !top.length) return
    let cancelled = false
    fetch('/api/news/briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: top }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.briefing?.bullets?.length) return
        setBullets(j.briefing.bullets); setAt(j.briefing.at)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authed, initial, top])

  useEffect(() => {
    const f = () => setStamp(ago(at, es))
    f()
    const id = setInterval(f, 60000)
    return () => clearInterval(id)
  }, [at, es])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { if (next) localStorage.setItem('db:brief-collapsed', day); else localStorage.removeItem('db:brief-collapsed') } catch { /* private mode */ }
  }

  if (!bullets.length) return null
  return (
    <section className={`db-briefing${collapsed ? ' is-collapsed' : ''}`} aria-labelledby="db-briefing-h">
      <div className="db-briefing-head">
        <h2 id="db-briefing-h">{es ? 'El resumen de hoy' : "Today's briefing"}</h2>
        <span className="db-briefing-meta" suppressHydrationWarning>{stamp}</span>
        <span className="db-briefing-acts">
          <ListenButton text={listen} lang={lang} />
          <button type="button" className="db-iconbtn db-briefing-toggle" aria-expanded={!collapsed} aria-label={collapsed ? (es ? 'Mostrar resumen' : 'Show briefing') : (es ? 'Ocultar por hoy' : 'Hide for today')} onClick={toggle}>
            <ChevronIcon />
          </button>
        </span>
      </div>
      {!collapsed && (
        <ul className="db-briefing-list">
          {bullets.map((b) => (
            <li key={b.l + b.t}><a href={b.l} target="_blank" rel="noopener noreferrer">{b.t}</a></li>
          ))}
        </ul>
      )}
    </section>
  )
}
