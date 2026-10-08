'use client'
import { softRefresh } from './soft'

export default function ShowHidden({ count, lang = 'en' }: { count: number; lang?: string }) {
  if (!count) return null
  const es = lang === 'es'
  return (
    <button
      onClick={async () => {
        await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unhideAll: true }) })
        softRefresh()
      }}
      type="button"
      className="db-textbtn"
    >
      {es ? `Mostrar ${count} ${count > 1 ? 'secciones ocultas' : 'sección oculta'}` : `Show ${count} hidden section${count > 1 ? 's' : ''}`}
    </button>
  )
}
