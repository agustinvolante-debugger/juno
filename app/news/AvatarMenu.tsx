'use client'
import { useState } from 'react'
import Popover from './Popover'

const post = (body: object) => fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Account menu behind the avatar: language, refresh, sports on Today, globe, sign out.
export default function AvatarMenu({ email, lang, sports, hasSports }: { email: string; lang: string; sports: boolean; hasSports: boolean }) {
  const es = lang === 'es'
  const [busy, setBusy] = useState('')
  const initial = (email[0] || '?').toUpperCase()

  async function setLang(l: string) {
    if (l === lang) return
    setBusy('lang'); await post({ lang: l }); location.reload()
  }
  async function refresh() {
    setBusy('refresh')
    await Promise.allSettled([fetch('/api/news/cron'), fetch('/api/news/refresh-mine', { method: 'POST' })])
    location.reload()
  }
  async function toggleSports() {
    setBusy('sports'); await post({ layout: { sports: !sports } }); location.reload()
  }

  return (
    <Popover label={es ? 'Cuenta' : 'Account'} className="db-avatar" trigger={<span className="db-avatar-dot" aria-hidden>{initial}</span>}>
      {() => (
        <>
          <div className="db-menu-head">{email}</div>
          <div className="db-menu-row">
            <span>{es ? 'Idioma' : 'Language'}</span>
            <span className="db-seg">
              <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
              <button type="button" aria-pressed={lang === 'es'} onClick={() => setLang('es')}>ES</button>
            </span>
          </div>
          {hasSports && (
            <button type="button" role="menuitemcheckbox" aria-checked={sports} className="db-menu-item" onClick={toggleSports} disabled={!!busy}>
              <span>{es ? 'Deportes en Hoy' : 'Sports on Today'}</span><span className="db-switch" data-on={sports ? '1' : '0'} aria-hidden />
            </button>
          )}
          <button type="button" role="menuitem" className="db-menu-item" onClick={refresh} disabled={!!busy}>
            <span>{busy === 'refresh' ? (es ? 'Actualizando…' : 'Refreshing…') : (es ? 'Actualizar ahora' : 'Refresh now')}</span>
          </button>
          <a role="menuitem" className="db-menu-item" href="/news/globe"><span>{es ? 'Explorador mundial' : 'World explorer'}</span></a>
          <a role="menuitem" className="db-menu-item is-quiet" href="/api/auth/signout"><span>{es ? 'Cerrar sesión' : 'Sign out'}</span></a>
        </>
      )}
    </Popover>
  )
}
