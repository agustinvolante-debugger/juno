'use client'

export default function LangToggle({ lang }: { lang: string }) {
  async function set(l: string) {
    if (l === lang) return
    await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l }) })
    location.reload()
  }
  return (
    <span className="text-sm text-neutral-500">
      <button onClick={() => set('en')} className={lang === 'en' ? 'font-bold underline' : ''}>EN</button>
      {' · '}
      <button onClick={() => set('es')} className={lang === 'es' ? 'font-bold underline' : ''}>ES</button>
    </span>
  )
}
