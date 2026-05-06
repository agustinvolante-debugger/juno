'use client'

import { useEffect } from 'react'
import { ReportData } from './reports'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, RadialBarChart, RadialBar,
} from 'recharts'

const colors = {
  bg: '#0c0c0b',
  surface: '#141412',
  border: '#222220',
  borderLight: '#2a2a28',
  text: '#f0ead2',
  secondary: '#8a8678',
  tertiary: '#4a4840',
  accent: '#c8f04a',
  accentDim: '#8aaa2e',
  green: '#5ab87a',
  amber: '#e09a30',
  red: '#e05a4a',
  blue: '#5a9fd4',
}

const insightColors = {
  danger: { bg: 'rgba(224,90,74,0.08)', border: 'rgba(224,90,74,0.25)', accent: colors.red },
  warning: { bg: 'rgba(224,154,48,0.08)', border: 'rgba(224,154,48,0.25)', accent: colors.amber },
  info: { bg: 'rgba(90,159,212,0.08)', border: 'rgba(90,159,212,0.25)', accent: colors.blue },
}

function formatCurrency(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#141412] border border-[#222220] rounded-xl p-5">
      <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">{label}</div>
      <div className="text-2xl font-semibold text-[#f0ead2]">{value}</div>
      {sub && <div className="text-[#8a8678] text-sm mt-1">{sub}</div>}
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-[#f0ead2]">{title}</h2>
      {subtitle && <p className="text-[#8a8678] text-sm mt-1">{subtitle}</p>}
    </div>
  )
}

function IntentBadge({ intent }: { intent: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-[#5ab87a]/15 text-[#5ab87a]',
    medium: 'bg-[#e09a30]/15 text-[#e09a30]',
    low: 'bg-[#e05a4a]/15 text-[#e05a4a]',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[intent]}`}>
      {intent} intent
    </span>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1a18] border border-[#2a2a28] rounded-lg px-3 py-2 text-sm">
      <p className="text-[#8a8678] mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {typeof entry.value === 'number' && entry.name?.includes('CPC') ? `$${entry.value.toFixed(2)}` : entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

function WrappedAxisTick({ x, y, payload }: any) {
  const text = payload.value as string
  const maxLen = 14
  if (text.length <= maxLen) {
    return (
      <text x={x} y={y + 12} textAnchor="middle" fill={colors.secondary} fontSize={11}>
        {text}
      </text>
    )
  }
  const spaceIdx = text.lastIndexOf(' ', maxLen)
  const breakAt = spaceIdx > 0 ? spaceIdx : maxLen
  const line1 = text.slice(0, breakAt)
  const line2 = text.slice(breakAt).trimStart()
  return (
    <text x={x} y={y + 10} textAnchor="middle" fill={colors.secondary} fontSize={11}>
      <tspan x={x} dy="0">{line1}</tspan>
      <tspan x={x} dy="14">{line2}</tspan>
    </text>
  )
}

export default function ReportClient({ report }: { report: ReportData }) {
  useEffect(() => {
    fetch('/api/report-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: report.slug }),
    }).catch(() => {})
  }, [report.slug])

  const cpcComparison = [
    { name: 'Industry Avg', cpc: report.industryAvgCPC, fill: colors.tertiary },
    { name: report.company, cpc: report.effectiveCPC, fill: colors.red },
  ]

  const keywordCPCData = report.topKeywords
    .filter(k => k.cpc > 2)
    .sort((a, b) => b.cpc - a.cpc)
    .map(k => ({
      keyword: k.keyword,
      CPC: k.cpc,
      fill: k.cpc > 100 ? colors.red : k.cpc > 10 ? colors.amber : colors.green,
    }))

  const competitorData = [
    { name: report.company.slice(0, 12), keywords: report.paidKeywords },
    ...report.competitors.map(c => ({
      name: c.domain.replace('.com', '').slice(0, 12),
      keywords: parseFloat(c.keywords.replace('K', '')) * (c.keywords.includes('K') ? 1000 : 1),
    })),
  ].sort((a, b) => b.keywords - a.keywords)

  const overlapPercent = report.competitors[1]?.overlapPercent || 0
  const overlapData = [{ name: 'overlap', value: overlapPercent, fill: colors.red }]

  return (
    <div className="min-h-screen bg-[#0c0c0b] text-[#f0ead2] font-sans">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-14 bg-[#0c0c0b]/90 backdrop-blur border-b border-[#222220]">
        <a href="/" className="font-serif text-xl">jun<span className="text-[#c8f04a]">o</span></a>
        <div className="flex items-center gap-4">
          <span className="text-[#4a4840] text-xs font-mono uppercase tracking-widest">Keyword Intelligence Brief</span>
        </div>
      </nav>

      <div className="pt-20 px-6 max-w-5xl mx-auto pb-24">

        {/* HERO */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[#4a4840] text-xs font-mono uppercase tracking-widest">Report</span>
            <span className="text-[#2a2a28]">/</span>
            <span className="text-[#8a8678] text-xs font-mono">{report.generatedDate}</span>
          </div>
          <h1 className="text-4xl font-semibold mb-2">{report.company}</h1>
          <p className="text-[#8a8678] text-lg mb-1">{report.industry}</p>
          <p className="text-[#4a4840] text-sm">{report.description}</p>
          <div className="mt-6 h-px bg-gradient-to-r from-[#c8f04a]/40 via-[#222220] to-transparent" />
        </div>

        {/* OVERVIEW STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatCard label="Est. Paid Keywords" value={report.paidKeywords.toLocaleString()} />
          <StatCard label="Est. Monthly Clicks" value={report.monthlyClicks.toLocaleString()} />
          <StatCard
            label="Est. Monthly Budget"
            value={report.monthlyBudgetLow === report.monthlyBudgetHigh ? formatCurrency(report.monthlyBudgetHigh) : `${formatCurrency(report.monthlyBudgetLow)}–${formatCurrency(report.monthlyBudgetHigh)}`}
            sub="SpyFu estimate"
          />
          <StatCard
            label="Effective CPC"
            value={`$${report.effectiveCPC.toFixed(2)}`}
            sub={`vs $${report.industryAvgCPC.toFixed(2)} industry avg`}
          />
        </div>

        {/* KEY INSIGHTS */}
        <section className="mb-14">
          <SectionHeader title="Key Insights" subtitle="Based on public auction data, competitor analysis, and industry benchmarks" />
          <div className="space-y-4">
            {report.insights.map((insight, i) => {
              const c = insightColors[insight.type]
              return (
                <div
                  key={i}
                  className="rounded-xl p-5 border"
                  style={{ backgroundColor: c.bg, borderColor: c.border }}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-semibold text-[#f0ead2]">{insight.title}</h3>
                    <span
                      className="text-sm font-mono whitespace-nowrap px-3 py-1 rounded-lg"
                      style={{ backgroundColor: `${c.accent}20`, color: c.accent }}
                    >
                      {insight.metric}
                    </span>
                  </div>
                  <p className="text-[#8a8678] text-sm leading-relaxed">{insight.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* CPC COMPARISON CHART */}
        {report.slug !== 'safetywing' && (
        <section className="mb-14">
          <SectionHeader title="Cost Per Click Comparison" subtitle="Estimated effective CPC vs industry benchmark and top competitor" />
          <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cpcComparison} layout="vertical" margin={{ left: 100, right: 40 }}>
                <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fill: colors.secondary, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: colors.text, fontSize: 13 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Bar dataKey="cpc" name="Effective CPC" radius={[0, 6, 6, 0]} barSize={28}>
                  {cpcComparison.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-[#222220]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.tertiary }} />
                <span className="text-[#8a8678] text-xs">Industry Average</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.red }} />
                <span className="text-[#8a8678] text-xs">{report.company}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.secondary }} />
                <span className="text-[#8a8678] text-xs">Top Competitor</span>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* KEYWORD CPC TABLE + CHART */}
        <section className="mb-14">
          <SectionHeader title="Top Keywords by CPC" subtitle="Highest-cost keywords in auction data. Intent rating estimates buyer relevance for EOR services." />
          <div className="space-y-6">
            {/* Table — full width */}
            <div className="bg-[#141412] border border-[#222220] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#222220]">
                    <th className="text-left text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Keyword</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Volume</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">CPC</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Click Share</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Intent</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topKeywords.map((kw, i) => (
                    <tr key={i} className="border-b border-[#1a1a18] hover:bg-[#1a1a18] transition-colors">
                      <td className="px-5 py-3 text-sm font-mono">{kw.keyword}</td>
                      <td className="px-5 py-3 text-sm text-right text-[#8a8678]">{kw.volume}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono">
                        <span className={kw.cpc > 100 ? 'text-[#e05a4a]' : kw.cpc > 10 ? 'text-[#e09a30]' : 'text-[#f0ead2]'}>
                          ${kw.cpc.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-[#8a8678]">{kw.clickShare}%</td>
                      <td className="px-5 py-3 text-right"><IntentBadge intent={kw.intent} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Chart — full width below */}
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={keywordCPCData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <XAxis dataKey="keyword" tick={<WrappedAxisTick />} axisLine={false} tickLine={false} height={65} interval={0} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: colors.secondary, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Bar dataKey="CPC" name="CPC" radius={[4, 4, 0, 0]} barSize={48}>
                    {keywordCPCData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-6 mt-2 pt-3 border-t border-[#222220]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.red }} />
                  <span className="text-[#8a8678] text-xs">{'>'} $100 CPC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.amber }} />
                  <span className="text-[#8a8678] text-xs">$10–$100</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.green }} />
                  <span className="text-[#8a8678] text-xs">{'<'} $10</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMPETITOR LANDSCAPE */}
        <section className="mb-14">
          <SectionHeader title="Competitive Landscape" subtitle="Paid search footprint comparison across the EOR market" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Competitor table */}
            <div className="lg:col-span-2 bg-[#141412] border border-[#222220] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#222220]">
                    <th className="text-left text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Competitor</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Keywords</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Clicks/mo</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Budget</th>
                    <th className="text-right text-[#4a4840] text-xs font-mono uppercase tracking-widest px-5 py-3">Overlap</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1a1a18] bg-[#c8f04a]/5">
                    <td className="px-5 py-3 text-sm font-medium">
                      {report.company} <span className="text-[#c8f04a] text-xs ml-1">you</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-mono">{report.paidKeywords.toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-right font-mono">{report.monthlyClicks.toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-right font-mono">{formatCurrency(report.monthlyBudgetHigh)}</td>
                    <td className="px-5 py-3 text-sm text-right text-[#8a8678]">—</td>
                  </tr>
                  {report.competitors.map((comp, i) => (
                    <tr key={i} className="border-b border-[#1a1a18] hover:bg-[#1a1a18] transition-colors">
                      <td className="px-5 py-3 text-sm">{comp.domain}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono">{comp.keywords}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono">{comp.monthlyClicks}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono">{comp.budget}</td>
                      <td className="px-5 py-3 text-sm text-right">
                        <span className={`font-mono ${comp.overlapPercent > 50 ? 'text-[#e05a4a]' : 'text-[#8a8678]'}`}>
                          {comp.overlapPercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Overlap gauge */}
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6 flex flex-col items-center justify-center">
              <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-4">Keyword Overlap w/ Deel</div>
              <div className="relative w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} data={overlapData} barSize={12}>
                    <RadialBar background={{ fill: colors.borderLight }} dataKey="value" cornerRadius={6} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-semibold text-[#e05a4a]">{overlapPercent}%</span>
                  <span className="text-[#8a8678] text-xs">shared terms</span>
                </div>
              </div>
              <p className="text-[#8a8678] text-xs text-center mt-4 leading-relaxed">
                {report.competitors[1]?.commonKeywords.toLocaleString()} of {report.paidKeywords.toLocaleString()} keywords<br />
                are also targeted by Deel
              </p>
            </div>
          </div>
        </section>

        {/* AD COPY SAMPLES */}
        <section className="mb-14">
          <SectionHeader title="Live Ad Copy" subtitle="Current Google Ads creatives found in auction data" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.adCopy.map((ad, i) => (
              <div key={i} className="bg-[#141412] border border-[#222220] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[#4a4840] text-xs font-mono uppercase tracking-widest">keyword:</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#2a2a28] text-[#8a8678]">{ad.keyword}</span>
                </div>
                <p className="text-[#5a9fd4] text-sm font-medium mb-1">{ad.headline}</p>
                <p className="text-[#8a8678] text-xs leading-relaxed">{ad.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* TRAFFIC SPLIT */}
        <section className="mb-14">
          <SectionHeader title="Traffic Sources" subtitle="Estimated split between paid and organic search traffic" />
          <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
            <div className="flex items-center gap-6 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.accent }} />
                <span className="text-[#8a8678] text-sm">Organic ({report.trafficSplit.organic}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.red }} />
                <span className="text-[#8a8678] text-sm">Paid ({report.trafficSplit.paid}%)</span>
              </div>
            </div>
            <div className="w-full h-4 rounded-full bg-[#2a2a28] overflow-hidden flex">
              <div
                className="h-full rounded-l-full transition-all"
                style={{ width: `${report.trafficSplit.organic}%`, backgroundColor: colors.accent }}
              />
              <div
                className="h-full rounded-r-full transition-all"
                style={{ width: `${report.trafficSplit.paid}%`, backgroundColor: colors.red }}
              />
            </div>
            <p className="text-[#4a4840] text-xs mt-3">
              Approximately {report.trafficSplit.paid}% of traffic is estimated to come from paid search.
              At ~{report.monthlyClicks.toLocaleString()} monthly paid clicks, efficiency per click matters more than volume.
            </p>
          </div>
        </section>

        {/* ORGANIC vs PAID */}
        <section className="mb-14">
          <SectionHeader title="Organic vs Paid" subtitle="Two channels, similar traffic, very different costs" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Side-by-side comparison cards */}
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.red }} />
                <span className="text-xs font-mono uppercase tracking-widest text-[#e05a4a]">Paid Search</span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Monthly clicks</span>
                  <span className="text-xl font-semibold">{report.monthlyClicks.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Keywords</span>
                  <span className="text-xl font-semibold">{report.paidKeywords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Monthly cost</span>
                  <span className="text-xl font-semibold text-[#e05a4a]">{report.monthlyBudgetLow === report.monthlyBudgetHigh ? formatCurrency(report.monthlyBudgetHigh) : `${formatCurrency(report.monthlyBudgetLow)}–${formatCurrency(report.monthlyBudgetHigh)}`}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Cost per click</span>
                  <span className="text-lg font-mono text-[#e05a4a]">${report.effectiveCPC.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.accent }} />
                <span className="text-xs font-mono uppercase tracking-widest text-[#c8f04a]">Organic Search</span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Monthly clicks</span>
                  <span className="text-xl font-semibold">{report.organic.monthlyClicks.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Keywords</span>
                  <span className="text-xl font-semibold">{report.organic.keywords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Monthly cost</span>
                  <span className="text-xl font-semibold text-[#c8f04a]">$0</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#8a8678] text-sm">Est. click value</span>
                  <span className="text-lg font-mono text-[#8a8678]">{formatCurrency(report.organic.estClickValue)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison bar */}
          <div className="bg-[#141412] border border-[#222220] rounded-xl p-6 mb-6">
            <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-3">Monthly clicks by channel</div>
            <div className="flex gap-3 items-center mb-3">
              <div className="flex-1">
                <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                  <div
                    className="rounded-l-lg flex items-center justify-center text-xs font-mono"
                    style={{
                      width: `${(report.monthlyClicks / (report.monthlyClicks + report.organic.monthlyClicks)) * 100}%`,
                      backgroundColor: colors.red,
                      color: '#fff',
                    }}
                  >
                    {report.monthlyClicks.toLocaleString()}
                  </div>
                  <div
                    className="rounded-r-lg flex items-center justify-center text-xs font-mono"
                    style={{
                      width: `${(report.organic.monthlyClicks / (report.monthlyClicks + report.organic.monthlyClicks)) * 100}%`,
                      backgroundColor: colors.accent,
                      color: '#0c0c0b',
                    }}
                  >
                    {report.organic.monthlyClicks.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.red }} />
                <span className="text-[#8a8678] text-xs">Paid (~{formatCurrency(report.monthlyBudgetHigh)}/mo)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.accent }} />
                <span className="text-[#8a8678] text-xs">Organic ($0/mo)</span>
              </div>
            </div>
          </div>

          {/* Organic keywords breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#141412] border border-[#222220] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#222220]">
                <span className="text-xs font-mono uppercase tracking-widest text-[#4a4840]">Top Organic Keywords</span>
              </div>
              <table className="w-full">
                <tbody>
                  {report.organic.topKeywords.map((kw, i) => (
                    <tr key={i} className="border-b border-[#1a1a18] hover:bg-[#1a1a18] transition-colors">
                      <td className="px-5 py-2.5 text-sm font-mono">{kw.keyword}</td>
                      <td className="px-5 py-2.5 text-sm text-right text-[#8a8678]">{kw.clicks}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          kw.type === 'commercial'
                            ? 'bg-[#5ab87a]/15 text-[#5ab87a]'
                            : 'bg-[#5a9fd4]/15 text-[#5a9fd4]'
                        }`}>
                          {kw.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6 flex flex-col justify-center">
              <div className="space-y-5">
                <div>
                  <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-1">Page 1 Rankings</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">{report.organic.page1Keywords.toLocaleString()}</span>
                    <span className="text-[#8a8678] text-sm">keywords</span>
                  </div>
                </div>
                <div>
                  <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-1">Falling Off Page 1</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-[#e05a4a]">{report.organic.fallingOffPage1}</span>
                    <span className="text-[#8a8678] text-sm">keywords recently dropped</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-[#222220]">
                  <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">Organic Competitors</div>
                  <div className="space-y-1.5">
                    {report.organic.competitors.map((c, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-sm text-[#8a8678]">{c.domain}</span>
                        <span className="text-xs font-mono text-[#4a4840]">{c.keywords} keywords</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key takeaway */}
          <div className="mt-6 rounded-xl p-5 border" style={{ backgroundColor: 'rgba(90,159,212,0.08)', borderColor: 'rgba(90,159,212,0.25)' }}>
            <h3 className="font-semibold text-[#f0ead2] mb-2">Both channels deliver similar traffic — only one costs {formatCurrency(report.monthlyBudgetHigh)}/month</h3>
            <p className="text-[#8a8678] text-sm leading-relaxed">
              Organic search produces ~{report.organic.monthlyClicks.toLocaleString()} monthly clicks at $0. Paid search produces ~{report.monthlyClicks.toLocaleString()} clicks at an estimated ${formatCurrency(report.monthlyBudgetHigh)}/month.
              Most organic traffic comes from informational content (telecommuting, wages definition, what is a freelancer) — top-of-funnel, not buyer intent.
              Paid is where commercial keywords like "employer of record" and "global payroll" compete. But neither channel reveals which traffic actually converts to contracts. That's the attribution gap.
            </p>
          </div>
        </section>

        {/* INDUSTRY BENCHMARKS */}
        <section className="mb-14">
          <SectionHeader title="Industry Benchmarks" subtitle={`HR Tech / HRIS — SaaS Google Ads 2026`} />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Avg CPC" value={`$${report.industryAvgCPC}`} sub="non-brand search" />
            <StatCard label="Avg CTR" value={`${report.industryAvgCTR}%`} sub="search campaigns" />
            <StatCard label="Avg CVR" value={`${report.industryAvgCVR}%`} sub="landing page" />
            <StatCard label="Avg CPL" value={`$${report.industryAvgCPL}`} sub="cost per lead" />
            <StatCard label="Avg Waste" value={`${report.industryAvgWaste}%`} sub="of SaaS ad spend" />
          </div>
        </section>

        {/* THE BRIDGE — CTA */}
        <section className="mb-8">
          <div className="bg-gradient-to-br from-[#141412] to-[#1a1a16] border border-[#2a2a28] rounded-2xl p-8 md:p-10 text-center">
            <div className="text-[#c8f04a] text-xs font-mono uppercase tracking-widest mb-4">The missing piece</div>
            <h2 className="text-2xl md:text-3xl font-semibold mb-4 max-w-2xl mx-auto leading-snug">
              This report shows what the market sees.<br />
              <span className="text-[#8a8678]">It can't show which clicks become customers.</span>
            </h2>
            <p className="text-[#8a8678] max-w-xl mx-auto mb-6 leading-relaxed">
              Public data estimates auction activity — CPCs, keyword counts, competitor overlap.
              But it's blind to what happens after the click. Which of those {report.monthlyClicks.toLocaleString()} monthly
              visits turn into contracts in your CRM? Which $172 clicks generate $50K+ ARR, and which ones are just
              people looking for a job?
            </p>
            <p className="text-2xl md:text-3xl font-semibold text-[#c8f04a] mb-8">
              That's what Juno connects.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://calendly.com/agustinvolantesilva/30min"
                className="inline-flex items-center gap-2 bg-[#c8f04a] text-[#0c0c0b] font-semibold px-6 py-3 rounded-lg hover:bg-[#d4f565] transition-colors"
              >
                See your full keyword-to-revenue picture
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
              <a
                href="/"
                className="text-[#8a8678] hover:text-[#f0ead2] text-sm transition-colors"
              >
                Learn more about Juno
              </a>
            </div>
          </div>
        </section>

        {/* FOOTER DISCLAIMER */}
        <div className="text-center pt-8 border-t border-[#222220]">
          <p className="text-[#4a4840] text-xs leading-relaxed max-w-2xl mx-auto">
            This report was generated using publicly available data from SpyFu, SimilarWeb, and industry benchmark reports.
            All figures are estimates based on auction observation and statistical modeling — they may differ from actual performance data.
            Intended as a market perspective, not a definitive audit. Generated {report.generatedDate} by Juno.
          </p>
          <div className="mt-4">
            <a href="/" className="font-serif text-lg text-[#4a4840] hover:text-[#8a8678] transition-colors">
              jun<span className="text-[#c8f04a]/50">o</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
