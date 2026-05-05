'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { KeywordCAC } from '@/types'
import { DateRangePicker } from '@/components/DateRangePicker'
import { DateRange } from 'react-day-picker'
import { subDays, format } from 'date-fns'

type CrmProvider = 'hubspot' | 'rd_station'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [keywords, setKeywords] = useState<KeywordCAC[]>([])
  const [googleAdsConnected, setGoogleAdsConnected] = useState(false)
  const [crmProvider, setCrmProvider] = useState<CrmProvider>('hubspot')
  const [rdMarketingConnected, setRdMarketingConnected] = useState(false)
  const [rdCrmToken, setRdCrmToken] = useState('')
  const [rdCrmSaved, setRdCrmSaved] = useState(false)
  const [hubspotConnected, setHubspotConnected] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [loading, setLoading] = useState('')
  const [toast, setToast] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined,
  })

  useEffect(() => {
    const saved = localStorage.getItem('juno_crm_provider') as CrmProvider | null
    if (saved) setCrmProvider(saved)
    setDateRange({ from: subDays(new Date(), 90), to: new Date() })

    fetch('/api/connections/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.google_ads) setGoogleAdsConnected(true)
        if (data.hubspot) setHubspotConnected(true)
        if (data.rd_station_marketing) setRdMarketingConnected(true)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  useEffect(() => {
    const connected = searchParams.get('connected')
    if (connected === 'google_ads') {
      setGoogleAdsConnected(true)
      showToast('Google Ads connected')
    }
    if (connected === 'hubspot') {
      setHubspotConnected(true)
      showToast('HubSpot connected')
    }
    if (connected === 'rd_station_marketing') {
      setRdMarketingConnected(true)
      showToast('RD Station Marketing connected')
    }
    const error = searchParams.get('error')
    if (error) showToast(`Error: ${error.replace(/_/g, ' ')}`)
  }, [searchParams])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('juno_crm_provider', crmProvider)
    }
  }, [crmProvider])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  async function syncGoogleAds() {
    if (!customerId) return showToast('Enter your Google Ads customer ID first')
    setLoading('google_ads')
    const res = await fetch('/api/google-ads/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId }),
    })
    const data = await res.json()
    setLoading('')
    if (data.error) return showToast(`Sync failed: ${data.error}${data.detail ? ` — ${data.detail}` : ''}`)
    const total = (data.synced || 0) + (data.dsa_search_terms || 0) + (data.pmax_search_terms || 0)
    if (total === 0) {
      const warning = data.warnings?.length ? ` (${data.warnings[0]})` : ''
      return showToast(`No keyword data found for this account${warning}`)
    }
    const parts = [`${data.synced} keywords`]
    if (data.dsa_search_terms) parts.push(`${data.dsa_search_terms} DSA search terms`)
    if (data.pmax_search_terms) parts.push(`${data.pmax_search_terms} PMAX terms`)
    showToast(`Synced ${parts.join(' · ')} from Google Ads`)
  }

  async function syncCRM() {
    setLoading('crm')
    const endpoint = crmProvider === 'hubspot' ? '/api/hubspot/sync' : '/api/rd-station/sync'
    const res = await fetch(endpoint, { method: 'POST' })
    const data = await res.json()
    setLoading('')
    if (data.error) return showToast(`Sync failed: ${data.error}`)
    if (crmProvider === 'rd_station') {
      showToast(`Synced ${data.contacts} contacts · ${data.deals} deals (${data.linked_deals} linked) from RD Station`)
    } else {
      showToast(`Synced ${data.contacts} contacts · ${data.deals} deals from HubSpot`)
    }
  }

  async function saveRdCrmToken() {
    if (!rdCrmToken) return showToast('Enter your RD Station CRM API token')
    setLoading('rd_crm_save')
    const res = await fetch('/api/rd-station/crm/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rdCrmToken }),
    })
    const data = await res.json()
    setLoading('')
    if (data.error) return showToast(`Failed: ${data.error}`)
    setRdCrmSaved(true)
    showToast('RD Station CRM token saved')
  }

  async function runAttribution() {
    setLoading('attribution')
    try {
      const res = await fetch('/api/attribution/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
          to: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
        }),
      })
      const data = await res.json()
      setLoading('')
      if (data.error) return showToast(`Attribution failed: ${data.error}`)
      setKeywords(data.results ?? [])
      showToast(`Attribution complete — ${(data.results ?? []).length} keywords/search terms`)
    } catch (err: any) {
      setLoading('')
      showToast(`Attribution failed: ${err.message}`)
    }
  }

  const totalSpend = keywords.reduce((s, k) => s + k.spend_monthly, 0)
  const totalDeals = keywords.reduce((s, k) => s + k.deal_count, 0)
  const budgetToCut = keywords
    .filter((k) => k.action === 'cut')
    .reduce((s, k) => s + k.spend_monthly, 0)

  if (status === 'loading') return null

  return (
    <div className="min-h-screen bg-[#0c0c0b] text-[#f0ead2] font-sans">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-14 bg-[#0c0c0b]/90 backdrop-blur border-b border-[#222220]">
        <div className="font-serif text-xl">jun<span className="text-[#c8f04a]">o</span></div>
        <div className="flex items-center gap-6">
          <span className="text-[#8a8678] text-sm">{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="text-[#4a4840] hover:text-[#8a8678] text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="pt-20 px-8 max-w-6xl mx-auto pb-16">
        {/* CRM SELECTOR */}
        <div className="mb-6">
          <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">CRM</div>
          <div className="flex gap-2">
            <button
              onClick={() => setCrmProvider('hubspot')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                crmProvider === 'hubspot'
                  ? 'bg-[#c8f04a] text-[#0c0c0b]'
                  : 'bg-[#2a2a28] text-[#8a8678] hover:bg-[#333330]'
              }`}
            >
              HubSpot
            </button>
            <button
              onClick={() => setCrmProvider('rd_station')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                crmProvider === 'rd_station'
                  ? 'bg-[#c8f04a] text-[#0c0c0b]'
                  : 'bg-[#2a2a28] text-[#8a8678] hover:bg-[#333330]'
              }`}
            >
              RD Station
            </button>
          </div>
        </div>

        {/* CONNECTIONS */}
        <div className="mb-10">
          <h2 className="font-serif text-2xl mb-6">Connections</h2>
          <div className={`grid grid-cols-1 ${crmProvider === 'rd_station' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
            {/* Google Ads */}
            <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-medium">Google Ads</div>
                  <div className="text-[#8a8678] text-sm mt-0.5">
                    {googleAdsConnected ? (
                      <span className="text-[#5ab87a]">● Connected</span>
                    ) : (
                      'Not connected'
                    )}
                  </div>
                </div>
                <a
                  href="/api/google-ads/connect"
                  className="bg-[#c8f04a] text-[#0c0c0b] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  {googleAdsConnected ? 'Reconnect' : 'Connect'}
                </a>
              </div>
              {googleAdsConnected && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Customer ID (e.g. 123-456-7890)"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value.replace(/-/g, ''))}
                    className="flex-1 bg-[#0c0c0b] border border-[#2a2a28] rounded-lg px-3 py-2 text-sm text-[#f0ead2] placeholder-[#4a4840] focus:outline-none focus:border-[#c8f04a]"
                  />
                  <button
                    onClick={syncGoogleAds}
                    disabled={loading === 'google_ads'}
                    className="bg-[#2a2a28] hover:bg-[#333330] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading === 'google_ads' ? 'Syncing…' : 'Sync'}
                  </button>
                </div>
              )}
            </div>

            {/* CRM Card(s) */}
            {crmProvider === 'hubspot' ? (
              <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-medium">HubSpot</div>
                    <div className="text-[#8a8678] text-sm mt-0.5">
                      {hubspotConnected ? (
                        <span className="text-[#5ab87a]">● Connected</span>
                      ) : (
                        'Not connected'
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href="/api/hubspot/connect"
                      className="bg-[#c8f04a] text-[#0c0c0b] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {hubspotConnected ? 'Reconnect' : 'Connect'}
                    </a>
                    {hubspotConnected && (
                      <button
                        onClick={syncCRM}
                        disabled={loading === 'crm'}
                        className="bg-[#2a2a28] hover:bg-[#333330] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loading === 'crm' ? 'Syncing…' : 'Sync'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[#4a4840] text-xs">Pulls all contacts with UTM data and closed-won deals</p>
              </div>
            ) : (
              <>
                {/* RD Station Marketing */}
                <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-medium">RD Station Marketing</div>
                      <div className="text-[#8a8678] text-sm mt-0.5">
                        {rdMarketingConnected ? (
                          <span className="text-[#5ab87a]">● Connected</span>
                        ) : (
                          'Not connected'
                        )}
                      </div>
                    </div>
                    <a
                      href="/api/rd-station/marketing/connect"
                      className="bg-[#c8f04a] text-[#0c0c0b] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {rdMarketingConnected ? 'Reconnect' : 'Connect'}
                    </a>
                  </div>
                  <p className="text-[#4a4840] text-xs">Contacts with UTM/traffic source data</p>
                </div>

                {/* RD Station CRM */}
                <div className="bg-[#141412] border border-[#222220] rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-medium">RD Station CRM</div>
                      <div className="text-[#8a8678] text-sm mt-0.5">
                        {rdCrmSaved ? (
                          <span className="text-[#5ab87a]">● Token saved</span>
                        ) : (
                          'Token required'
                        )}
                      </div>
                    </div>
                    <button
                      onClick={syncCRM}
                      disabled={loading === 'crm' || !rdCrmSaved}
                      className="bg-[#c8f04a] text-[#0c0c0b] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {loading === 'crm' ? 'Syncing…' : 'Sync'}
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="password"
                      placeholder="CRM API instance token"
                      value={rdCrmToken}
                      onChange={(e) => setRdCrmToken(e.target.value)}
                      className="flex-1 bg-[#0c0c0b] border border-[#2a2a28] rounded-lg px-3 py-2 text-sm text-[#f0ead2] placeholder-[#4a4840] focus:outline-none focus:border-[#c8f04a]"
                    />
                    <button
                      onClick={saveRdCrmToken}
                      disabled={loading === 'rd_crm_save'}
                      className="bg-[#2a2a28] hover:bg-[#333330] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading === 'rd_crm_save' ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* SEED TEST DATA */}
        <div className="mb-6 p-4 border border-dashed border-[#2a2a28] rounded-xl flex items-center gap-4">
          <span className="text-[#4a4840] text-xs font-mono uppercase tracking-widest">Dev</span>
          <button
            onClick={async () => {
              setLoading('seed')
              try {
                const res = await fetch('/api/dev/seed', { method: 'POST' })
                const data = await res.json()
                setLoading('')
                const errs = data.errors
                if (errs?.keywords || errs?.contacts || errs?.deals) {
                  showToast(`Seed errors: ${errs.keywords || ''} ${errs.contacts || ''} ${errs.deals || ''}`)
                } else {
                  showToast(`Seeded: ${data.keywords} keywords · ${data.contacts} contacts · ${data.deals} deals`)
                }
              } catch (err: any) {
                setLoading('')
                showToast(`Seed failed: ${err.message}`)
              }
            }}
            disabled={loading === 'seed'}
            className="bg-[#2a2a28] hover:bg-[#333330] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading === 'seed' ? 'Seeding…' : 'Seed test data'}
          </button>
          <span className="text-[#4a4840] text-xs">Inserts mock keywords + contacts + deals so you can test attribution</span>
        </div>

        {/* DATE RANGE + RUN ATTRIBUTION + SEND DIGEST */}
        <div className="mb-4">
          <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">Date range</div>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <div className="mb-10 flex items-center gap-4 flex-wrap">
          <button
            onClick={runAttribution}
            disabled={loading === 'attribution'}
            className="bg-[#c8f04a] text-[#0c0c0b] font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading === 'attribution' ? 'Running attribution…' : 'Run attribution'}
          </button>
          <button
            onClick={async () => {
              setLoading('digest')
              const res = await fetch('/api/digest', { method: 'POST' })
              const data = await res.json()
              setLoading('')
              if (data.error) return showToast(`Failed: ${data.error}`)
              showToast('Weekly digest sent to your email')
            }}
            disabled={loading === 'digest' || keywords.length === 0}
            className="bg-[#2a2a28] hover:bg-[#333330] text-sm font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-40"
          >
            {loading === 'digest' ? 'Sending…' : 'Send digest email'}
          </button>
          <span className="text-[#4a4840] text-sm">
            Run attribution first, then send the weekly digest
          </span>
        </div>

        {/* STATS */}
        {keywords.length > 0 && (
          <>
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
                    <th className="text-left px-4 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Source</th>
                    <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Campaign</th>
                    <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Spend/mo</th>
                    <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Deals</th>
                    <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">True CAC</th>
                    <th className="text-left px-6 py-3 text-[#4a4840] text-xs font-mono uppercase tracking-widest font-normal">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((kw, i) => (
                    <tr key={i} className="border-b border-[#1a1a18] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono text-sm text-[#f0ead2]">{kw.keyword}</td>
                      <td className="px-4 py-4">
                        <SourceBadge sourceType={kw.source_type} />
                      </td>
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
          </>
        )}

        {keywords.length === 0 && (
          <div className="text-center text-[#4a4840] mt-20">
            <p className="text-lg">Connect Google Ads and your CRM to get started</p>
            <p className="text-sm mt-2">Sync both, then run attribution to see your CAC by keyword</p>
          </div>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#222220] text-[#f0ead2] text-sm px-5 py-3 rounded-lg border border-[#2a2a28] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  if (sourceType === 'keyword') return null

  const styles: Record<string, string> = {
    dsa_search_term: 'bg-[#4a9aea]/10 text-[#4a9aea]',
    pmax_search_term: 'bg-[#a855f7]/10 text-[#a855f7]',
    asset_group: 'bg-[#8a8678]/10 text-[#8a8678]',
  }

  const labels: Record<string, string> = {
    dsa_search_term: 'DSA',
    pmax_search_term: 'PMAX',
    asset_group: 'Asset Group',
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${styles[sourceType] ?? ''}`}>
      {labels[sourceType] ?? sourceType}
    </span>
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
