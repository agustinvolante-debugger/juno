'use client'

export default function RemoveVideo({ k }: { k: string }) {
  return (
    <button
      title="close"
      onClick={async () => {
        await fetch('/api/news/video-section?key=' + encodeURIComponent(k), { method: 'DELETE' })
        location.reload()
      }}
      className="font-bold opacity-50 hover:opacity-100"
    >
      ✕
    </button>
  )
}
