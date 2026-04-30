'use client'

import { KeywordCAC } from '@/types'

const DEMO_KEYWORDS: KeywordCAC[] = [
  { keyword: 'crm software for startups', campaign: 'Brand — CRM', spend_monthly: 4200, deal_count: 6, total_deal_value: 57600, cac: 700, action: 'scale', source_type: 'keyword' },
  { keyword: 'hubspot alternative b2b', campaign: 'Competitor — CRM', spend_monthly: 3100, deal_count: 4, total_deal_value: 38400, cac: 775, action: 'scale', source_type: 'keyword' },
  { keyword: 'sales pipeline software', campaign: 'Generic — Pipeline', spend_monthly: 2800, deal_count: 2, total_deal_value: 19200, cac: 1400, action: 'monitor', source_type: 'keyword' },
  { keyword: 'best crm 2026', campaign: 'Generic — CRM', spend_monthly: 1900, deal_count: 1, total_deal_value: 9600, cac: 1900, action: 'monitor', source_type: 'keyword' },
  { keyword: 'crm free trial', campaign: 'Brand — CRM', spend_monthly: 3400, deal_count: 0, total_deal_value: 0, cac: null, action: 'cut', source_type: 'keyword' },
  { keyword: 'customer management tool', campaign: 'Generic — CRM', spend_monthly: 2600, deal_count: 0, total_deal_value: 0, cac: null, action: 'cut', source_type: 'keyword' },
  { keyword: 'salesforce vs hubspot', campaign: 'Competitor — CRM', spend_monthly: 1800, deal_count: 0, total_deal_value: 0, cac: null, action: 'cut', source_type: 'keyword' },
  { keyword: 'crm pricing comparison', campaign: 'Generic — CRM', spend_monthly: 1500, deal_count: 0, total_deal_value: 0, cac: null, action: 'cut', source_type: 'keyword' },
]

const totalSpend = DEMO_KEYWORDS.reduce((s, k) => s + k.spend_monthly, 0)
const totalDeals = DEMO_KEYWORDS.reduce((s, k) => s + k.deal_count, 0)
const budgetToCut = DEMO_KEYWORDS.filter((k) => k.action === 'cut').reduce((s, k) => s + k.spend_monthly, 0)

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#0c0c0b] text-[#f0ead2] font-sans">
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-14 bg-[#0c0c0b]/90 backdrop-blur border-b border-[#222220]">
        <div className="font-serif text-xl">jun<span className="text-[#c8f04a]">o</span></div>
        <div className="flex items-center gap-4">
          <span className="inline-block px-2.5 py-1 rounded text-xs font-mono font-semibold bg-[#c8f04a]/10 text-[#c8f04a]">Live demo</span>
          <span className="text-[#8a8678] text-sm">demo@tryjunoapp.com</span>
        </div>
      </nav>

      <div className="pt-20 px-8 max-w-6xl mx-auto pb-16">
        {/* CONNECTIONS */}
        <div className="mb-10">
          <h2 className="font-serif text-2xl mb-6">Connections</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Google Ads</div>
                  <div className="text-sm mt-0.5"><span className="text-[#5ab87a]">● Connected</span></div>
                </div>
                <span className="text-[#4a4840] text-xs font-mono">Last synced: Apr 29</span>
              </div>
            </div>
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">HubSpot</div>
                  <div className="text-sm mt-0.5"><span className="text-[#5ab87a]">● Connected</span></div>
                </div>
                <span className="text-[#4a4840] text-xs font-mono">Last synced: Apr 29</span>
              </div>
            </div>
          </div>
        </div>

        {/* DATE RANGE */}
        <div className="mb-4">
          <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">Date range</div>
          <div className="inline-block bg-[#141412] border border-[#222220] rounded-lg px-4 py-2 text-sm text-[#8a8678]">
            Jan 29, 2026 — Apr 29, 2026 (90 days)
          </div>
        </div>
        <div className="mb-10 flex items-center gap-4">
          <div className="bg-[#c8f04a] text-[#0c0c0b] font-semibold px-6 py-3 rounded-lg opacity-90">
            Attribution complete
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#141412] border border-[#222220] rounded-xl p-5">
            <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">Total ad spend / mo</div>
            <div className="text-3xl font-semibold">${totalSpend.toLocaleString()}</div>
          </div>
          <div className="bg-[#141412] border border-[#222220] rounded-xl p-5">
            <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">Deals attributed</div>
            <div className="text-3xl font-semibold text-[#c8f04a]">{totalDeals}</div>
          </div>
          <div className="bg-[#141412] border border-[#222220] rounded-xl p-5">
            <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">Budget to cut</div>
            <div className="text-3xl font-semibold text-[#e05a4a]">${budgetToCut.toLocaleString()}</div>
          </div>
        </div>

        {/* KEYWORD TABLE */}
        <div className="bg-[#141412] border border-[#222220] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#222220]">
            <h2 className="font-serif text-xl">CAC by keyword</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#222220]">
                <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Keyword</th>
                <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Campaign</th>
                <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Spend/mo</th>
                <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Deals</th>
                <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">True CAC</th>
                <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_KEYWORDS.map((kw, i) => (
                <tr key={i} className="border-b border-[#1a1a18] hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-sm text-[#f0ead2]">{kw.keyword}</td>
                  <td className="px-6 py-4 text-sm text-[#8a8678]">{kw.campaign}</td>
                  <td className="px-6 py-4 text-sm text-[#8a8678]">${kw.spend_monthly.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-sm font-semibold ${kw.deal_count > 0 ? 'text-[#5ab87a]' : 'text-[#e05a4a]'}`}>
                    {kw.deal_count}
                  </td>
                  <td className={`px-6 py-4 text-sm font-medium ${
                    kw.cac === null ? 'text-[#e05a4a]' :
                    kw.action === 'scale' ? 'text-[#5ab87a]' :
                    kw.action === 'monitor' ? 'text-[#e09a30]' : 'text-[#e05a4a]'
                  }`}>
                    {kw.cac !== null ? `$${kw.cac.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <ActionTag action={kw.action} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* SUMMARY */}
        <div className="mt-8 bg-[#141412] border border-[#222220] rounded-xl p-6">
          <h3 className="font-serif text-lg mb-3">Weekly recommendation</h3>
          <p className="text-[#8a8678] text-sm leading-relaxed">
            <span className="text-[#e05a4a] font-semibold">4 keywords</span> spent <span className="text-[#e05a4a] font-semibold">${budgetToCut.toLocaleString()}/mo</span> with zero pipeline in the last 90 days.
            Cutting them would save <span className="text-[#5ab87a] font-semibold">${(budgetToCut * 12).toLocaleString()}/year</span> and
            redirect budget to <span className="text-[#5ab87a]">&quot;crm software for startups&quot;</span> and <span className="text-[#5ab87a]">&quot;hubspot alternative b2b&quot;</span> which
            are generating deals at $700-$775 CAC.
          </p>
        </div>

        {/* FOOTER */}
        <div className="mt-12 text-center text-[#4a4840] text-xs">
          This is a live demo with sample data. <a href="/" className="text-[#c8f04a] hover:underline">Learn more about Juno</a>
        </div>
      </div>
    </div>
  )
}

function ActionTag({ action }: { action: 'scale' | 'monitor' | 'cut' }) {
  const styles = {
    scale: 'bg-[#5ab87a]/10 text-[#5ab87a]',
    monitor: 'bg-[#e09a30]/10 text-[#e09a30]',
    cut: 'bg-[#e05a4a]/10 text-[#e05a4a]',
  }
  const labels = { scale: 'Scale', monitor: 'Monitor', cut: 'Cut now' }
  return (
    <span className={`inline-block px-2.5 py-1 rounded text-xs font-mono font-semibold ${styles[action]}`}>
      {labels[action]}
    </span>
  )
}
