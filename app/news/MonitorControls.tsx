'use client'
import { useState } from 'react'

function b64ToUint8(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Per-monitor controls: 🔔 push alerts on new developments, ↻ re-checks, ✕ stops monitoring.
export default function MonitorControls({ query, lang = 'en', alerts = false }: { query: string; lang?: string; alerts?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [on, setOn] = useState(alerts)
  const [bellBusy, setBellBusy] = useState(false)
  const es = lang === 'es'

  async function refresh() {
    setBusy(true)
    try {
      await fetch('/api/news/monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, refresh: true }) })
      location.reload()
    } finally { setBusy(false) }
  }
  async function remove() {
    await fetch('/api/news/monitor?query=' + encodeURIComponent(query), { method: 'DELETE' })
    location.reload()
  }

  async function setAlerts(next: boolean) {
    await fetch('/api/news/monitor', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, alerts: next }) })
    setOn(next)
  }

  // Enabling must run inside this click handler: iOS only grants Notification permission
  // from a user gesture, and only for installed (home-screen) web apps.
  async function toggleBell() {
    if (bellBusy) return
    setBellBusy(true)
    try {
      if (on) { await setAlerts(false); return }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
        alert(isIOS
          ? (es ? 'Primero instala la app: Compartir → Añadir a pantalla de inicio, y activa las alertas desde ahí.' : 'Install the app first: Share → Add to Home Screen, then enable alerts from the installed app.')
          : (es ? 'Este navegador no soporta notificaciones push.' : 'This browser does not support push notifications.'))
        return
      }
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone
      if (/iP(hone|ad|od)/.test(navigator.userAgent) && !standalone) {
        alert(es ? 'Primero instala la app: Compartir → Añadir a pantalla de inicio, y activa las alertas desde ahí.' : 'Install the app first: Share → Add to Home Screen, then enable alerts from the installed app.')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        alert(es ? 'Las notificaciones están bloqueadas para este sitio.' : 'Notifications are blocked for this site.')
        return
      }
      const keyRes = await fetch('/api/news/push-sub').then((r) => r.json()).catch(() => null)
      if (!keyRes?.key) {
        alert(es ? 'Push no está configurado en el servidor.' : 'Push is not configured on the server.')
        return
      }
      const reg = await navigator.serviceWorker.register('/news-sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(keyRes.key) as BufferSource })
      const saved = await fetch('/api/news/push-sub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
      if (!saved.ok) throw new Error('subscription not saved')
      await setAlerts(true)
    } catch (e: any) {
      alert((es ? 'No se pudieron activar las alertas: ' : 'Could not enable alerts: ') + String(e?.message || e).slice(0, 120))
    } finally { setBellBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-2 font-normal normal-case">
      <button
        onClick={toggleBell}
        disabled={bellBusy}
        title={on ? (es ? 'Alertas activadas — tocar para desactivar' : 'Alerts on — tap to turn off') : (es ? 'Avisarme de novedades (notificación push)' : 'Alert me on new developments (push notification)')}
        className={`text-[12px] disabled:opacity-50 ${on ? 'text-amber-500 hover:text-amber-600' : 'text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'}`}
      >{bellBusy ? '…' : on ? '⚑' : '⚐'}</button>
      <button onClick={refresh} disabled={busy} title={es ? 'Buscar novedades' : 'Check for new developments'} className="text-[12px] text-neutral-400 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100">{busy ? '…' : '↻'}</button>
      <button onClick={remove} title={es ? 'Dejar de monitorear' : 'Stop monitoring'} className="text-[12px] text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">✕</button>
    </span>
  )
}
