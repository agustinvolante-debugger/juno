// Juno Pen's own web app manifest. The site-wide app/manifest.ts belongs to the Daily Brief
// (start_url /news), so "Add to Home Screen" from Juno Pen opened the news reader. Pen pages
// point here instead (app/pen/layout.tsx `manifest`). '/' is Pen's home on tryjunoapp.com.
export const dynamic = 'force-static'

export function GET() {
  return Response.json(
    {
      name: 'Juno Pen',
      short_name: 'Juno Pen',
      description: 'Plug in the recorder, get the meeting written up.',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#F2EFE5',
      theme_color: '#F2EFE5',
      icons: [{ src: '/juno_mark.png', sizes: '256x256', type: 'image/png', purpose: 'any' }],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}
