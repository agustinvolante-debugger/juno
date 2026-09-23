import { redirect } from 'next/navigation'

// The root is Juno Pen. On tryjunoapp.com proxy.ts rewrites / to /pen before this runs; on
// every other host (localhost, Vercel previews) this sends / there instead. The old
// attribution landing page that used to live here is retired; its other routes remain.
export default function Home() {
  redirect('/pen')
}
