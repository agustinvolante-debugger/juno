import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'

export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36'
const KINDS = new Set(['STOCK', 'FUND', 'ETF', 'INDEX'])

// GET ?q=microsoft → [{ symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' }, …]
// Company-name or ticker search for "Add a stock", via CNBC's symbol lookup (the same service
// that quotes the tickers). US listings first; foreign lines of the same company drop out.
export async function GET(req: Request) {
  if (!(await authedEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 40)
  if (q.length < 1) return NextResponse.json({ results: [] })
  try {
    const r = await fetch(`https://symlookup.cnbc.com/symservice/symlookup.do?prefix=${encodeURIComponent(q)}&partnerid=20064&pgok=1&pgsize=25`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000),
    })
    const rows: any[] = (await r.json()).slice(1)
    const seen = new Set<string>()
    const results = rows
      .filter((x) => x?.symbolName && KINDS.has(String(x.issueType)) && !/-|\./.test(String(x.symbolName).replace(/^\./, '')))
      .sort((a, b) => Number(b.countryCode === 'US') - Number(a.countryCode === 'US'))
      .filter((x) => { const k = String(x.issuerId || x.companyName); if (seen.has(k)) return false; seen.add(k); return true })
      .slice(0, 7)
      .map((x) => ({ symbol: String(x.symbolName).toUpperCase(), name: String(x.companyName || ''), exchange: String(x.exchangeName || '') }))
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
