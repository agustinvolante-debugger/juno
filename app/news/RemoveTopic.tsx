'use client'

export default function RemoveTopic({ query }: { query: string }) {
  return (
    <button
      title="close"
      onClick={async () => {
        await fetch('/api/news/topic?query=' + encodeURIComponent(query), { method: 'DELETE' })
        location.reload()
      }}
      className="db-pill font-normal"
    >
      ✕
    </button>
  )
}
