import type { MonitorCard } from '@/lib/news/feeds'

// Adaptive summary card for a Monitor. Rich layouts for the two structured types the AI can
// reliably extract (earnings, sports); other types fall back to the brief + timeline.
function tone(v?: string): string {
  const t = (v || '').toLowerCase()
  if (/\b(beat|beats|topped|tops|above|surge|jump|rose|up|record|strong)\b/.test(t)) return 'text-green-700 dark:text-green-500'
  if (/\b(miss|missed|below|fell|drop|down|weak|disappoint|cut|warn)\b/.test(t)) return 'text-red-700 dark:text-red-500'
  return 'text-neutral-600 dark:text-neutral-400'
}

function MetricRow({ label, actual, est }: { label: string; actual?: string; est?: string }) {
  if (!actual && !est) return null
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[12.5px]">
      <span className="text-neutral-500">{label}</span>
      <span className="tabular-nums">
        <span className="font-bold">{actual || '—'}</span>
        {est ? <span className="ml-1.5 text-neutral-400">vs est {est}</span> : null}
      </span>
    </div>
  )
}

export default function MonitorCardView({ card, lang = 'en' }: { card?: MonitorCard; lang?: string }) {
  if (!card) return null
  const es = lang === 'es'

  if (card.type === 'earnings') {
    const hasNums = !!(card.revenue || card.eps || card.revenueEst || card.epsEst)
    if (!card.company && !hasNums && !card.reportDate && !card.verdict) return null
    return (
      <div className="border-b border-neutral-100 bg-neutral-50 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[13px] font-bold">{card.company || (es ? 'Resultados' : 'Earnings')}</span>
          {card.reported ? (
            card.verdict && <span className={`text-[11px] font-bold uppercase tracking-wide ${tone(card.verdict)}`}>{card.verdict}</span>
          ) : card.reportDate ? (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">{es ? 'Reporta' : 'Reports'} {card.reportDate}</span>
          ) : null}
        </div>
        {hasNums ? (
          <div className="rounded-md border border-neutral-200 px-2.5 py-1.5 dark:border-neutral-800">
            <MetricRow label={es ? 'Ingresos' : 'Revenue'} actual={card.revenue} est={card.revenueEst} />
            <MetricRow label="EPS" actual={card.eps} est={card.epsEst} />
          </div>
        ) : (
          card.verdict && !card.reported && <div className="text-[12px] text-neutral-500">{card.verdict}</div>
        )}
      </div>
    )
  }

  if (card.type === 'sports') {
    const results = card.results || []
    const fixtures = card.fixtures || []
    if (!results.length && !fixtures.length && !card.competition) return null
    return (
      <div className="border-b border-neutral-100 bg-neutral-50 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
        {card.competition && <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">{card.competition}</div>}
        {results.length > 0 && (
          <div className="mb-1.5">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400">{es ? 'Resultados' : 'Results'}</div>
            {results.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-baseline justify-between py-0.5 text-[12.5px]">
                <span className="font-semibold">{r.label}</span>
                {r.detail && <span className="text-[11px] text-neutral-400">{r.detail}</span>}
              </div>
            ))}
          </div>
        )}
        {fixtures.length > 0 && (
          <div>
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400">{es ? 'Próximos' : 'Upcoming'}</div>
            {fixtures.slice(0, 5).map((f, i) => (
              <div key={i} className="flex items-baseline justify-between py-0.5 text-[12.5px]">
                <span>{f.label}</span>
                {f.when && <span className="text-[11px] text-neutral-400">{f.when}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}
