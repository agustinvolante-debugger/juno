'use client'

// Clears the learned click-profile that powers For You. Lets the user "tune" by starting over.
export default function ResetForYou() {
  return (
    <button
      title="Reset what For You has learned"
      onClick={async () => {
        if (!confirm('Reset For You? This clears what it has learned from your clicks.')) return
        await fetch('/api/news/profile', { method: 'DELETE' })
        location.reload()
      }}
      className="font-bold opacity-60 hover:opacity-100"
    >
      ↺
    </button>
  )
}
