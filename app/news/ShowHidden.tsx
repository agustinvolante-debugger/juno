'use client'

export default function ShowHidden({ count }: { count: number }) {
  if (!count) return null
  return (
    <button
      onClick={async () => {
        await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unhideAll: true }) })
        location.reload()
      }}
      className="underline"
    >
      Show {count} hidden section{count > 1 ? 's' : ''}
    </button>
  )
}
