'use client'
import { useEffect, useState } from 'react'

// Thin ribbon under the masthead when the network is gone: the service worker serves the
// last cached edition, this says which one you're reading.
export default function OfflineRibbon({ iso, lang = 'en' }: { iso: string | null; lang?: string }) {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    setOffline(!navigator.onLine)
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  const when = iso ? new Date(iso).toLocaleTimeString(lang === 'es' ? 'es' : 'en-US', { hour: 'numeric', minute: '2-digit' }) : null
  return (
    <div className="db-offline border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[11.5px] font-semibold text-amber-800 sm:px-7 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {lang === 'es' ? 'sin conexión' : 'offline'}{when ? ` · ${lang === 'es' ? 'mostrando la edición de las' : 'showing the'} ${when}${lang === 'es' ? '' : ' edition'}` : ''}
    </div>
  )
}
