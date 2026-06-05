import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getCustomTickers, setCustomTickers, getStatsCache, setStatsCache, getPrefs, setPrefs } from '@/lib/news/store'
import { getStats, tickerDef, DEFAULT_STATS } from '@/lib/news/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

// POST { symbol }: validate the ticker via CNBC (also grabs its name), store it, and fetch its
// quote now so it appears on the belt immediately. DELETE ?symbol=… removes it.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json().catch(() => ({})))?.symbol
  const symbol = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12)
  if (!symbol) return NextResponse.json({ error: 'empty' }, { status: 400 })

  // Fetch the quote to confirm it's real and to populate the belt cache immediately.
  const def = tickerDef(symbol)
  const stats = await getStats([def])
  if (!stats[def.id]) return NextResponse.json({ error: 'not found', symbol }, { status: 404 })

  const tickers = await getCustomTickers()
  if (!tickers.some((t) => t.symbol === symbol)) {
    await setCustomTickers([...tickers, { symbol, label: stats[def.id].label || symbol }])
  }
  await setStatsCache({ ...(await getStatsCache()), [def.id]: stats[def.id] })
  // Pin it to this user's belt so it shows immediately (otherwise it only lands in the menu).
  const prefs = await getPrefs(email)
  const layout: any = prefs.layout || {}
  const selected: string[] = layout.stats || DEFAULT_STATS
  if (!selected.includes(def.id)) await setPrefs(email, { lang: prefs.lang, layout: { ...layout, stats: [...selected, def.id] } })
  return NextResponse.json({ ok: true, symbol })
}

export async function DELETE(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const symbol = (new URL(req.url).searchParams.get('symbol') || '').trim().toUpperCase()
  const tickers = await getCustomTickers()
  await setCustomTickers(tickers.filter((t) => t.symbol !== symbol))
  // Also unpin it from this user's belt.
  const id = tickerDef(symbol).id
  const prefs = await getPrefs(email)
  const layout: any = prefs.layout || {}
  if (Array.isArray(layout.stats) && layout.stats.includes(id)) {
    await setPrefs(email, { lang: prefs.lang, layout: { ...layout, stats: layout.stats.filter((x: string) => x !== id) } })
  }
  return NextResponse.json({ ok: true })
}
