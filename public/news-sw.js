/* Daily Brief service worker — web push for monitor alerts (offline caching may layer on later). */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

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
