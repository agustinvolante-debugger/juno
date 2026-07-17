/* Daily Brief service worker — web push for monitor alerts + offline reading.
   Caching rules (deliberately narrow):
   - NEVER touches /api/* or auth routes (mutations, sessions) — network only.
   - /news documents: network-first, falling back to the last cached edition offline.
   - Static assets (/_next/static, images, Google Fonts): stale-while-revalidate.
   The page shows an "offline · showing HH:MM edition" ribbon via OfflineRibbon.tsx. */

const CACHE = 'db-offline-v1'
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']
// Dev chunks aren't content-hashed — stale-while-revalidate would keep serving outdated code
// after every edit. No caching on localhost (push handlers still work); prod chunks are hashed.
const DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('db-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
)

function cacheable(res) {
  return res && res.ok && (res.type === 'basic' || res.type === 'cors')
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (cacheable(res)) cache.put(req, res.clone())
    return res
  } catch {
    const hit = await cache.match(req, { ignoreSearch: false })
    if (hit) return hit
    // fall back to the base /news edition for any /news* navigation
    const base = await cache.match('/news')
    if (base) return base
    throw new Error('offline, no cached edition')
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  const refresh = fetch(req)
    .then((res) => { if (cacheable(res)) cache.put(req, res.clone()); return res })
    .catch(() => undefined)
  return hit || refresh.then((res) => { if (!res) throw new Error('offline'); return res })
}

self.addEventListener('fetch', (e) => {
  if (DEV) return
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // hands off anything stateful: APIs, auth, non-news pages
  if (url.origin === self.location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth'))) return

  // /news documents → network-first with offline fallback
  if (req.mode === 'navigate') {
    if (url.origin === self.location.origin && (url.pathname === '/news' || url.pathname.startsWith('/news'))) {
      e.respondWith(networkFirst(req))
    }
    return
  }

  // static assets → stale-while-revalidate
  const isStatic =
    (url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || /\.(png|jpg|svg|ico|avif|webp)$/.test(url.pathname))) ||
    FONT_HOSTS.includes(url.hostname)
  if (isStatic) e.respondWith(staleWhileRevalidate(req))
})

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { /* non-JSON payload */ }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Daily Brief', {
      body: d.body || '',
      icon: '/juno_logo.png',
      badge: '/juno_logo.png',
      tag: d.tag || d.title || 'daily-brief', // one visible notification per monitor
      data: { url: d.url || '/news' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/news'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes('/news') && 'focus' in c) return c.focus()
      return self.clients.openWindow(url)
    }),
  )
})
