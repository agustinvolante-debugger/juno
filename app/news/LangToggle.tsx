'use client'

export default function LangToggle({ lang }: { lang: string }) {
  async function set(l: string) {
    if (l === lang) return
    await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l }) })
    location.reload()
  }
  return (
    <span className="db-seg db-lang" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === 'en'} onClick={() => set('en')}>EN</button>
      <button type="button" aria-pressed={lang === 'es'} onClick={() => set('es')}>ES</button>
    </span>
  )
}
