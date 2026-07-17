'use client'

// Clears the learned click-profile that powers For You. Lets the user "tune" by starting over.
// Labeled "reset" in words (not an ↺ icon) so nobody mistakes it for a refresh button —
// clearing the profile makes the whole For You section disappear until new clicks teach it again.
export default function ResetForYou() {
  return (
    <button
      title="Start over: clears what For You learned from your clicks (the section disappears until it re-learns)"
      onClick={async () => {
        if (!confirm('Reset For You? This ERASES what it learned from your clicks — the section will disappear until you click more articles.')) return
        await fetch('/api/news/profile', { method: 'DELETE' })
        location.reload()
      }}
      className="db-pill font-normal normal-case tracking-normal"
    >
      reset
    </button>
  )
}
