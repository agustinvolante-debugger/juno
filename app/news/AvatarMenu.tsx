'use client'
import { useState } from 'react'
import { softRefresh } from './soft'
import Popover from './Popover'

const post = (body: object) => fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Account menu behind the avatar: language, refresh, the tutorial, globe, sign out.
export default function AvatarMenu({ email, lang }: { email: string; lang: string }) {
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
    setBusy(''); softRefresh()
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
          <a role="menuitem" className="db-menu-item" href="/news/profile"><span>{es ? 'Tu perfil' : 'Your profile'}</span></a>
          <button type="button" role="menuitem" className="db-menu-item" onClick={() => window.dispatchEvent(new Event('db:tour'))}>
            <span>{es ? 'Ver el tutorial' : 'Show the tutorial'}</span>
          </button>
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
