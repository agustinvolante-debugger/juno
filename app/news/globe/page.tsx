import { authedEmail } from '@/lib/news/auth'
import { headers } from 'next/headers'
import { PLACES } from '@/lib/news/places'
import GlobeExplorer from './GlobeExplorer'

export const dynamic = 'force-dynamic'

// Place-first geographic news explorer. Signed-in only (matches the AI features), though the
// fan-out itself uses no AI. See lib/news/places.ts (the pin table) + lib/news/geo.ts (templates).
export default async function GlobePage() {
  const email = await authedEmail()
  const host = (await headers()).get('host') || 'tryjunoapp.com'
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'

  if (!email) {
    const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(`${proto}://${host}/news/globe`)}`
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05070d] text-neutral-100">
        <div className="text-5xl">🌍</div>
        <h1 className="text-xl font-bold">World Explorer</h1>
        <p className="max-w-sm text-center text-sm text-neutral-400">Sign in to explore news by place — click a country or city and pull its latest, by category.</p>
        <a href={signInHref} className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-900">Sign in</a>
        <a href="/news" className="text-sm text-neutral-500 hover:underline">← Daily Brief</a>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-neutral-100">
      <header className="flex items-center gap-4 border-b border-neutral-800 px-6 py-3">
        <a href="/news" className="text-sm font-semibold text-neutral-400 hover:text-neutral-100">← Daily Brief</a>
        <h1 className="text-lg font-bold tracking-tight">🌍 World Explorer</h1>
        <span className="ml-auto text-xs text-neutral-500">{PLACES.length} places · on-demand</span>
      </header>
      <GlobeExplorer places={PLACES} />
    </main>
  )
}
