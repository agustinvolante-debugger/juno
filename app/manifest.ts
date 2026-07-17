import type { MetadataRoute } from 'next'

// Web app manifest → installable to the home screen (Android/desktop), and pairs with the
// appleWebApp metadata for iOS "Add to Home Screen". Opens standalone (no browser chrome).
// iOS 16.4+ only grants Web Push to installed (standalone) web apps, so this is also a
// prerequisite for monitor push alerts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Daily Brief',
    short_name: 'Daily Brief',
    description: 'Your personal news reader — global headlines, AI briefings, live markets, and video.',
    start_url: '/news',
    display: 'standalone',
    background_color: '#FAF7F0',
    theme_color: '#14110C',
    icons: [{ src: '/juno_logo.png', sizes: 'any', type: 'image/png' }],
  }
}
