'use client'

export default function HideSection({ k }: { k: string }) {
  return (
    <button
      title="hide this section"
      onClick={async () => {
        await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hide: k }) })
        location.reload()
      }}
      className="font-bold opacity-50 hover:opacity-100"
    >
      ✕
    </button>
  )
}
