'use client'
import { useEffect, useState } from 'react'

// "Last updated" stamp for the header. Formats the feed's updated_at in the viewer's local
// time (the page renders server-side in UTC, so this must happen on the client) and refreshes
// the relative age each minute. Renders empty on the server to avoid a hydration mismatch.
export default function LastUpdated({ iso, lang = 'en' }: { iso: string | null; lang?: string }) {
  const [txt, setTxt] = useState('')
  const es = lang === 'es'

  useEffect(() => {
    if (!iso) return
    const t = Date.parse(iso)
    if (isNaN(t)) return
    const fmt = () => {
      const mins = Math.max(0, Math.floor((Date.now() - t) / 60000))
      const rel = mins < 1 ? (es ? 'recién' : 'just now') : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`
      const time = new Date(t).toLocaleTimeString(es ? 'es-CL' : 'en-US', { hour: 'numeric', minute: '2-digit' })
      setTxt(`${es ? 'actualizado' : 'updated'} ${time} · ${rel}`)
    }
    fmt()
    const id = setInterval(fmt, 60000)
    return () => clearInterval(id)
  }, [iso, es])

  return (
    <span suppressHydrationWarning className="text-xs text-neutral-400" title={iso || undefined}>
      {txt}
    </span>
  )
}
