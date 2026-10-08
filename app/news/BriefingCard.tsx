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
// generated once per day (the route caches them) and swapped in when they arrive. It never
// re-prints headlines as bullets (they sit right below); without bullets the card keeps the
// Listen button and says why it's empty. Collapsible for the day.
export default function BriefingCard({ day, initial, initialAt, top, authed, lang = 'en', listen, updatedAt }: {
  day: string; initial: Bullet[] | null; initialAt: string | null; top: { t: string; l: string; s: string }[]
  authed: boolean; lang?: string; listen: string; updatedAt: string | null
}) {
  const es = lang === 'es'
  const [bullets, setBullets] = useState<Bullet[]>(initial || [])
  const [status, setStatus] = useState<'ready' | 'writing' | 'failed'>(initial?.length ? 'ready' : authed && top.length ? 'writing' : 'failed')
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
        if (cancelled) return
        if (!j?.briefing?.bullets?.length) { setStatus('failed'); return }
        setBullets(j.briefing.bullets); setAt(j.briefing.at); setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('failed') })
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

  const note = status === 'writing'
    ? (es ? 'Escribiendo el resumen de hoy…' : "Writing today's briefing…")
    : !authed
      ? (es ? 'Escucha los titulares de hoy. Inicia sesión para un resumen escrito.' : "Listen to today's headlines. Sign in for a written briefing.")
      : (es ? 'El resumen no está listo. Escucha los titulares de hoy.' : "The briefing isn't ready. Listen to today's headlines.")
  if (!bullets.length && !listen.trim()) return null
  return (
    <section className={`db-briefing${collapsed ? ' is-collapsed' : ''}`} aria-labelledby="db-briefing-h">
      <div className="db-briefing-head">
        <h2 id="db-briefing-h">{es ? 'El resumen de hoy' : "Today's briefing"}</h2>
        <span className="db-briefing-meta" suppressHydrationWarning>{bullets.length ? stamp : ''}</span>
        <span className="db-briefing-acts">
          <ListenButton text={listen} lang={lang} />
          <button type="button" className="db-iconbtn db-briefing-toggle" aria-expanded={!collapsed} aria-label={collapsed ? (es ? 'Mostrar resumen' : 'Show briefing') : (es ? 'Ocultar por hoy' : 'Hide for today')} onClick={toggle}>
            <ChevronIcon />
          </button>
        </span>
      </div>
      {!collapsed && !bullets.length && <p className="db-briefing-note" aria-live="polite">{note}</p>}
      {!collapsed && bullets.length > 0 && (
        <ul className="db-briefing-list">
          {bullets.map((b) => (
            <li key={b.l + b.t}><a href={b.l} target="_blank" rel="noopener noreferrer">{b.t}</a></li>
          ))}
        </ul>
      )}
    </section>
  )
}
