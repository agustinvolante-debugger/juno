'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { KeywordCAC, AdvisorReport } from '@/types'
import { DateRangePicker } from '@/components/DateRangePicker'
import { DateRange } from 'react-day-picker'
import { subDays, format } from 'date-fns'
import ReactMarkdown from 'react-markdown'

type CrmProvider = 'hubspot' | 'rd_station'
type ActiveSection = 'connections' | 'attribution' | 'advisor' | 'lab'
type AdvisorMode = 'guardrail' | 'scale' | 'aggressive'
type SelectedCrm = 'hubspot' | 'salesforce' | 'rd_station' | null

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [keywords, setKeywords] = useState<KeywordCAC[]>([])
  const [report, setReport] = useState<AdvisorReport | null>(null)
  const [googleAdsConnected, setGoogleAdsConnected] = useState(false)
  const [crmProvider, setCrmProvider] = useState<CrmProvider>('hubspot')
  const [rdMarketingConnected, setRdMarketingConnected] = useState(false)
  const [rdCrmToken, setRdCrmToken] = useState('')
  const [rdCrmSaved, setRdCrmSaved] = useState(false)
  const [hubspotConnected, setHubspotConnected] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [syncDays, setSyncDays] = useState(90)
  const [loading, setLoading] = useState('')
  const [toast, setToast] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined,
  })
  const [activeSection, setActiveSection] = useState<ActiveSection>('attribution')
  const [advisorMode, setAdvisorMode] = useState<AdvisorMode>('scale')

  // CHANGE 1: Collapsible sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Light/dark mode toggle — light is default
  const [lightMode, setLightMode] = useState(true)

  // CHANGE 3: CRM picker state
  const [selectedCrm, setSelectedCrm] = useState<SelectedCrm>(null)
  const [showCrmPicker, setShowCrmPicker] = useState(false)

  // CHANGE 4: Waste alert accordion (replaces modal)
  const [expandedWasteKey, setExpandedWasteKey] = useState<string | null>(null)

  useEffect(() => {
    const savedTheme = localStorage.getItem('juno_theme')
    if (savedTheme !== null) setLightMode(savedTheme === 'light')

    const saved = localStorage.getItem('juno_crm_provider') as CrmProvider | null
    if (saved) {
      setCrmProvider(saved)
      setSelectedCrm(saved === 'rd_station' ? 'rd_station' : 'hubspot')
    }
    setDateRange({ from: subDays(new Date(), 90), to: new Date() })

    fetch('/api/connections/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.google_ads) setGoogleAdsConnected(true)
        if (data.google_ads_customer_id) setCustomerId(data.google_ads_customer_id)
        if (data.hubspot) {
          setHubspotConnected(true)
          setSelectedCrm((prev) => prev ?? 'hubspot')
        }
        if (data.rd_station_marketing) {
          setRdMarketingConnected(true)
        }
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

  // Sync selectedCrm → crmProvider for API calls
  useEffect(() => {
    if (selectedCrm === 'hubspot') setCrmProvider('hubspot')
    else if (selectedCrm === 'rd_station') setCrmProvider('rd_station')
  }, [selectedCrm])

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
      body: JSON.stringify({ customer_id: customerId, days: syncDays }),
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

  async function getInsights() {
    setLoading('insights')
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
          to: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
          mode: advisorMode,
        }),
      })
      const data = await res.json()
      setLoading('')
      if (data.error) return showToast(`Insights failed: ${data.error}`)
      setKeywords(data.keywords ?? [])
      setReport(data.report ?? null)
    } catch (err: any) {
      setLoading('')
      showToast(`Insights failed: ${err.message}`)
    }
  }

  const totalSpend = keywords.reduce((s, k) => s + k.spend_monthly, 0)
  const totalDeals = keywords.reduce((s, k) => s + k.deal_count, 0)
  const budgetToCut = keywords
    .filter((k) => k.action === 'cut')
    .reduce((s, k) => s + k.spend_monthly, 0)

  if (status === 'loading') return null

  const navItems: { key: ActiveSection; label: string; icon: React.ReactNode }[] = [
    {
      key: 'connections',
      label: 'Connections',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="3" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="13" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="13" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 7.2L11 4.8M5 8.8L11 11.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: 'attribution',
      label: 'Attribution',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 12L5.5 8.5L8 11L12 6L14 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 4H14V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      key: 'advisor',
      label: 'Advisor',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2C5.24 2 3 4.02 3 6.5C3 8.1 3.9 9.5 5.25 10.32V12.5L8 11.5L10.75 12.5V10.32C12.1 9.5 13 8.1 13 6.5C13 4.02 10.76 2 8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6 6.5H10M8 5V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: 'lab',
      label: 'The Lab',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 3h6M9 3v8l-4 9h14l-4-9V3M9 3H7M15 3h2"/>
        </svg>
      ),
    },
  ]

  return (
    <div className={`min-h-screen flex font-sans ${lightMode ? 'light' : ''}`} style={{background: 'var(--bg)', color: 'var(--text)'}}>
      {/* SIDEBAR */}
      <aside
        className="fixed top-0 left-0 h-full bg-[var(--sidebar-bg)] border-r border-[var(--border)] flex flex-col z-50 overflow-hidden"
        style={{
          width: sidebarCollapsed ? '60px' : '220px',
          minWidth: sidebarCollapsed ? '60px' : '220px',
          transition: 'width 200ms ease',
        }}
      >
        {/* Logo */}
        <div className={`pt-6 pb-5 ${sidebarCollapsed ? 'px-0 flex justify-center' : 'px-6'}`}>
          {sidebarCollapsed ? (
            <div className="flex items-center justify-center h-8">
              <Image src="/juno_logo.png" alt="Juno" width={28} height={28} className="object-contain" />
            </div>
          ) : (
            <div className="font-serif text-xl text-[var(--text)]">
              jun<span className="text-[var(--accent)]">o</span>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ key, label, icon }) => {
            const isActive = activeSection === key
            return (
              <button
                key={key}
                onClick={() => setActiveSection(key as ActiveSection)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  sidebarCollapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-[var(--accent-10)] text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'
                }`}
              >
                <span className="shrink-0">{icon}</span>
                {!sidebarCollapsed && label}
              </button>
            )
          })}
        </nav>

        {/* Collapse toggle + light/dark toggle (stacked) */}
        <div className="px-3 pb-1 flex flex-col gap-1">
          <button
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="flex items-center justify-center py-2 text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed
                ? <path d="M9 18l6-6-6-6"/>
                : <path d="M15 18l-6-6 6-6"/>
              }
            </svg>
            {!sidebarCollapsed && <span className="ml-2 text-xs">Collapse</span>}
          </button>
          <button
            onClick={() => setLightMode(prev => { const next = !prev; localStorage.setItem('juno_theme', next ? 'light' : 'dark'); return next })}
            title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors self-center"
          >
            {lightMode ? (
              // Moon icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              // Sun icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>
        </div>

        {/* User + sign out */}
        <div className={`py-5 border-t border-[var(--border)] ${sidebarCollapsed ? 'px-0 flex flex-col items-center' : 'px-4'}`}>
          {!sidebarCollapsed && (
            <div className="text-[var(--text-faint)] text-xs truncate mb-2">{session?.user?.email}</div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-xs transition-colors flex items-center gap-1.5"
            title="Sign out"
          >
            {/* Door/exit icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {!sidebarCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT — CHANGE 2: full-width, no max-w constraint */}
      <main
        className="flex-1 px-10 py-8 w-full"
        style={{
          marginLeft: sidebarCollapsed ? '60px' : '220px',
          transition: 'margin-left 200ms ease',
        }}
      >

        {/* ── CONNECTIONS SECTION ── */}
        {activeSection === 'connections' && (
          <div>
            <h1 className="font-serif text-3xl mb-7">Connections</h1>

            {/* GOOGLE ADS CARD */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Google Ads logo */}
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center overflow-hidden">
                    <Image src="/GoogleAdsLogo.avif" alt="Google Ads" width={36} height={36} className="object-contain" />
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--text)]">Google Ads</div>
                    <div className="text-sm mt-0.5">
                      {googleAdsConnected
                        ? <span className="text-[var(--color-scale)]">● Connected</span>
                        : <span className="text-[var(--text-faint)]">Not connected</span>
                      }
                    </div>
                  </div>
                </div>
                <a
                  href="/api/google-ads/connect"
                  className="bg-[var(--accent)] text-[var(--accent-text)] text-sm font-semibold px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                >
                  {googleAdsConnected ? 'Reconnect' : 'Connect'}
                </a>
              </div>
              {googleAdsConnected && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                  <input
                    type="text"
                    placeholder="Customer ID (e.g. 123-456-7890)"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value.replace(/-/g, ''))}
                    className="flex-1 bg-[var(--bg)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <select
                    value={syncDays}
                    onChange={(e) => setSyncDays(Number(e.target.value))}
                    className="bg-[var(--bg)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>365 days</option>
                  </select>
                  <button
                    onClick={syncGoogleAds}
                    disabled={loading === 'google_ads'}
                    className="bg-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading === 'google_ads' ? 'Syncing…' : 'Sync'}
                  </button>
                </div>
              )}
            </div>

            {/* CRM LOGO CARDS */}
            <div className="mb-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest">Connect your CRM</div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              {/* HubSpot */}
              <button
                onClick={() => setSelectedCrm('hubspot')}
                className={`relative bg-[var(--surface)] border rounded-xl p-5 text-left transition-all ${
                  selectedCrm === 'hubspot'
                    ? 'border-[#FF7A59]/50 shadow-[0_0_24px_rgba(255,122,89,0.2)]'
                    : 'border-[var(--border)] hover:border-[#333330]'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden mb-3">
                  <Image src="/HubspotLogo.png" alt="HubSpot" width={32} height={32} className="object-contain" />
                </div>
                <div className="font-medium text-[var(--text)] text-sm">HubSpot</div>
                <div className="text-xs text-[var(--text-faint)] mt-0.5">
                  {hubspotConnected ? <span className="text-[var(--color-scale)]">● Connected</span> : 'CRM'}
                </div>
              </button>

              {/* Salesforce */}
              <button
                onClick={() => setSelectedCrm('salesforce')}
                className={`relative bg-[var(--surface)] border rounded-xl p-5 text-left transition-all ${
                  selectedCrm === 'salesforce'
                    ? 'border-[#00A1E0]/50 shadow-[0_0_24px_rgba(0,161,224,0.2)]'
                    : 'border-[var(--border)] hover:border-[#333330]'
                }`}
              >
                <div className="absolute top-3 right-3">
                  <span className="text-[10px] font-mono bg-[var(--border-subtle)] text-[var(--text-faint)] px-1.5 py-0.5 rounded">Soon</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden mb-3">
                  <Image src="/SalesforceLogo.png" alt="Salesforce" width={32} height={32} className="object-contain" />
                </div>
                <div className="font-medium text-[var(--text)] text-sm">Salesforce</div>
                <div className="text-xs text-[var(--text-faint)] mt-0.5">CRM</div>
              </button>

              {/* RD Station */}
              <button
                onClick={() => setSelectedCrm('rd_station')}
                className={`relative bg-[var(--surface)] border rounded-xl p-5 text-left transition-all ${
                  selectedCrm === 'rd_station'
                    ? 'border-[#00BFA5]/50 shadow-[0_0_24px_rgba(0,191,165,0.2)]'
                    : 'border-[var(--border)] hover:border-[#333330]'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden mb-3">
                  <Image src="/RDStationLogo.svg" alt="RD Station" width={32} height={32} className="object-contain" />
                </div>
                <div className="font-medium text-[var(--text)] text-sm">RD Station</div>
                <div className="text-xs text-[var(--text-faint)] mt-0.5">
                  {rdMarketingConnected ? <span className="text-[var(--color-scale)]">● Connected</span> : 'CRM'}
                </div>
              </button>

              {/* Plus / Add CRM */}
              <div className="relative">
                <button
                  onClick={() => setShowCrmPicker((prev) => !prev)}
                  className="w-full h-full bg-[var(--surface)] border border-dashed border-[var(--border-subtle)] rounded-xl p-5 flex flex-col items-center justify-center hover:border-[#444440] transition-colors min-h-[112px]"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--border-subtle)] flex items-center justify-center mb-3">
                    <span className="text-[var(--text-faint)] text-2xl font-light">+</span>
                  </div>
                  <div className="text-xs text-[var(--text-faint)]">Add CRM</div>
                </button>
                {showCrmPicker && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[var(--border)]">
                      <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest">Request integration</div>
                    </div>
                    {['Pipedrive', 'Zoho CRM', 'Microsoft Dynamics', 'Close.com', 'Copper', 'Streak'].map((crm) => (
                      <button key={crm} className="w-full px-4 py-2.5 text-left text-sm text-[var(--text-muted)] hover:bg-[#222220] hover:text-[var(--text)] transition-colors">
                        {crm}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* SELECTED CRM CONTROLS */}
            {selectedCrm === 'hubspot' && (
              <div className="bg-[var(--surface)] border border-[#FF7A59]/20 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-[var(--text)] mb-0.5">HubSpot</div>
                    <div className="text-sm text-[var(--text-faint)]">Pulls contacts with UTM data and closed-won deals</div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href="/api/hubspot/connect"
                      className="bg-[#FF7A59] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {hubspotConnected ? 'Reconnect' : 'Connect'}
                    </a>
                    {hubspotConnected && (
                      <button
                        onClick={syncCRM}
                        disabled={loading === 'crm'}
                        className="bg-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loading === 'crm' ? 'Syncing…' : 'Sync'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedCrm === 'salesforce' && (
              <div className="bg-[var(--surface)] border border-[#00A1E0]/20 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-[var(--text)] mb-0.5">Salesforce</div>
                    <div className="text-sm text-[var(--text-faint)]">Salesforce integration coming in V2. Join the waitlist.</div>
                  </div>
                  <button className="bg-[var(--border-subtle)] text-[var(--text-muted)] text-sm font-semibold px-4 py-2 rounded-lg cursor-not-allowed opacity-50">
                    Coming soon
                  </button>
                </div>
              </div>
            )}

            {selectedCrm === 'rd_station' && (
              <div className="bg-[var(--surface)] border border-[#00BFA5]/20 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-medium text-[var(--text)] mb-0.5">RD Station Marketing</div>
                    <div className="text-sm text-[var(--text-faint)]">Contacts with UTM/traffic source data</div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href="/api/rd-station/marketing/connect"
                      className="bg-[#00BFA5] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {rdMarketingConnected ? 'Reconnect' : 'Connect'}
                    </a>
                  </div>
                </div>
                <div className="flex gap-2 pt-4 border-t border-[var(--border)]">
                  <input
                    type="password"
                    placeholder="RD Station CRM API instance token"
                    value={rdCrmToken}
                    onChange={(e) => setRdCrmToken(e.target.value)}
                    className="flex-1 bg-[var(--bg)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[#00BFA5]"
                  />
                  <button
                    onClick={saveRdCrmToken}
                    disabled={loading === 'rd_crm_save'}
                    className="bg-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading === 'rd_crm_save' ? 'Saving…' : 'Save token'}
                  </button>
                  <button
                    onClick={syncCRM}
                    disabled={loading === 'crm' || !rdCrmSaved}
                    className="bg-[#00BFA5] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {loading === 'crm' ? 'Syncing…' : 'Sync'}
                  </button>
                </div>
              </div>
            )}

            {/* DEV SEED BUTTON — subtle, at bottom of connections */}
            <div className="mt-8 pt-6 border-t border-[#1a1a18] flex items-center gap-4">
              <span className="text-[#2a2a28] text-xs font-mono uppercase tracking-widest">Dev</span>
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
                className="bg-[var(--surface-raised)] hover:bg-[#222220] text-[var(--text-faint)] text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading === 'seed' ? 'Seeding…' : 'Seed test data'}
              </button>
            </div>
          </div>
        )}

        {/* ── ATTRIBUTION SECTION ── */}
        {activeSection === 'attribution' && (
          <div>
            <h1 className="font-serif text-3xl mb-7">Attribution</h1>

            {/* SEED TEST DATA */}
            <div className="mb-6 p-4 border border-dashed border-[var(--border-subtle)] rounded-xl flex items-center gap-4">
              <span className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest">Dev</span>
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
                className="bg-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading === 'seed' ? 'Seeding…' : 'Seed test data'}
              </button>
              <span className="text-[var(--text-faint)] text-xs">Inserts mock keywords + contacts + deals so you can test attribution</span>
            </div>

            {/* DATE RANGE */}
            <div className="mb-4">
              <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-2">Date range</div>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            {/* ACTION BUTTONS */}
            <div className="mb-10 flex items-center gap-4 flex-wrap">
              <button
                onClick={runAttribution}
                disabled={loading === 'attribution'}
                className="bg-[var(--accent)] text-[var(--accent-text)] font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
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
                className="bg-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-sm font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-40"
              >
                {loading === 'digest' ? 'Sending…' : 'Send digest email'}
              </button>
            </div>

            {/* STATS */}
            {keywords.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-2">Total ad spend / mo</div>
                    <div className="text-3xl font-semibold">${totalSpend.toLocaleString()}</div>
                  </div>
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-2">Deals attributed</div>
                    <div className="text-3xl font-semibold text-[var(--accent)]">{totalDeals}</div>
                  </div>
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-2">Budget to cut</div>
                    <div className="text-3xl font-semibold text-[var(--color-cut)]">${budgetToCut.toLocaleString()}</div>
                  </div>
                </div>

                {/* KEYWORD TABLE */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-[var(--border)]">
                    <h2 className="font-serif text-xl">CAC by keyword</h2>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-6 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">Keyword</th>
                        <th className="text-left px-4 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">Source</th>
                        <th className="text-left px-6 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">Campaign</th>
                        <th className="text-left px-6 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">Spend/mo</th>
                        <th className="text-left px-6 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">Deals</th>
                        <th className="text-left px-6 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">Pipeline</th>
                        <th className="text-left px-6 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">True CAC</th>
                        <th className="text-left px-6 py-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest font-normal">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywords.map((kw, i) => (
                        <tr key={i} className="border-b border-[#1a1a18] hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 font-mono text-sm text-[var(--text)]">{kw.keyword}</td>
                          <td className="px-4 py-4">
                            <SourceBadge sourceType={kw.source_type} />
                          </td>
                          <td className="px-6 py-4 text-sm text-[var(--text-muted)]">{kw.campaign}</td>
                          <td className="px-6 py-4 text-sm text-[var(--text-muted)]">${kw.spend_monthly.toLocaleString()}</td>
                          <td className={`px-6 py-4 text-sm font-semibold ${kw.deal_count > 0 ? 'text-[var(--color-scale)]' : 'text-[var(--color-cut)]'}`}>
                            {kw.deal_count}
                          </td>
                          <td className={`px-6 py-4 text-sm font-semibold ${kw.pipeline_leads > 0 ? 'text-[var(--color-monitor)]' : 'text-[var(--text-faint)]'}`}>
                            {kw.pipeline_leads > 0 ? kw.pipeline_leads : '—'}
                          </td>
                          <td className={`px-6 py-4 text-sm font-medium ${
                            kw.cac === null ? 'text-[var(--color-cut)]' :
                            kw.action === 'scale' ? 'text-[var(--color-scale)]' :
                            kw.action === 'monitor' ? 'text-[var(--color-monitor)]' : 'text-[var(--color-cut)]'
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
              <div className="text-center text-[var(--text-faint)] mt-20">
                <p className="text-lg">Connect Google Ads and your CRM to get started</p>
                <p className="text-sm mt-2">Sync both, then run attribution to see your CAC by keyword</p>
              </div>
            )}
          </div>
        )}

        {/* ── ADVISOR SECTION ── */}
        {activeSection === 'advisor' && (
          <div>
            <h1 className="font-serif text-3xl mb-7">Advisor</h1>

            {/* MODE SELECTOR */}
            <div className="mb-6">
              <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-3">Mode</div>
              <div className="grid grid-cols-3 gap-3">
                {/* Guardrail */}
                <button
                  onClick={() => setAdvisorMode('guardrail')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    advisorMode === 'guardrail'
                      ? 'border-[var(--accent)] bg-[var(--accent-5)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  <div className={`text-sm font-semibold mb-1.5 ${advisorMode === 'guardrail' ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                    Guardrail
                  </div>
                  <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Protect ROI. Only cut mathematically certain waste.
                  </div>
                </button>

                {/* Scale */}
                <button
                  onClick={() => setAdvisorMode('scale')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    advisorMode === 'scale'
                      ? 'border-[var(--accent)] bg-[var(--accent-5)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  <div className={`text-sm font-semibold mb-1.5 ${advisorMode === 'scale' ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                    Scale
                  </div>
                  <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Optimize CAC. Reallocate to proven winners.
                  </div>
                </button>

                {/* Aggressive */}
                <button
                  onClick={() => setAdvisorMode('aggressive')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    advisorMode === 'aggressive'
                      ? 'border-[var(--accent)] bg-[var(--accent-5)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  <div className={`text-sm font-semibold mb-1.5 ${advisorMode === 'aggressive' ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                    Aggressive
                    <span className="ml-2 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[var(--monitor-10)] text-[var(--color-monitor)] align-middle">
                      Attribution trap risk
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Scale at all costs. Cut fast, go big.
                  </div>
                </button>
              </div>
            </div>

            {/* GENERATE BUTTON */}
            <div className="mb-8">
              <button
                onClick={getInsights}
                disabled={loading === 'insights'}
                className="bg-[var(--advisor-btn-bg)] hover:bg-[var(--advisor-btn-hover)] border border-[var(--accent-30)] text-[var(--accent)] font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading === 'insights' ? 'Analyzing…' : 'Generate insights'}
              </button>
            </div>

            {/* ADVISOR PANEL */}
            {report && (
              <div className="bg-[var(--surface)] border border-[var(--accent-20)] rounded-xl p-6 mb-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="text-[var(--accent)] text-xs font-mono uppercase tracking-widest">Juno Advisor</div>
                  <div className="flex-1 h-px bg-[#222220]" />
                  <div className="text-xs text-[var(--text-faint)]">Powered by Claude</div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-[var(--bg)] rounded-lg p-4">
                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-1">Waste detected</div>
                    <div className="text-2xl font-semibold text-[var(--color-cut)]">
                      ${report.total_waste.toLocaleString()}
                      <span className="text-sm text-[var(--text-faint)] font-normal">/mo</span>
                    </div>
                  </div>
                  <div className="bg-[var(--bg)] rounded-lg p-4">
                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-1">% of budget</div>
                    <div className="text-2xl font-semibold text-[var(--color-cut)]">{report.waste_pct}%</div>
                  </div>
                  <div className="bg-[var(--bg)] rounded-lg p-4">
                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-1">Keywords to cut</div>
                    <div className="text-2xl font-semibold text-[var(--color-cut)]">{report.keywords_to_cut}</div>
                  </div>
                </div>

                <div className="text-[var(--text)] text-sm leading-relaxed [&_strong]:text-[var(--accent)] [&_strong]:font-semibold [&_ol]:mt-2 [&_ol]:pl-5 [&_li]:mt-1 [&_p]:mt-3 first:[&_p]:mt-0">
                  <ReactMarkdown>{report.narrative}</ReactMarkdown>
                </div>

                {report.waste_alerts.length > 0 && (
                  <div className="mt-6 border-t border-[var(--border)] pt-5">
                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-3">Waste breakdown</div>
                    <div>
                      {report.waste_alerts.map((alert, i) => {
                        const alertKey = `${alert.keyword}-${alert.campaign}`
                        const isExpanded = expandedWasteKey === alertKey
                        return (
                          <div key={i} className="border-b border-[var(--border)] last:border-0">
                            <div
                              onClick={() => setExpandedWasteKey(isExpanded ? null : alertKey)}
                              className="flex items-center gap-3 py-3 cursor-pointer hover:bg-white/[0.02] px-2 -mx-2 rounded-lg transition-colors"
                            >
                              <span className={`shrink-0 text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                                alert.severity === 'critical' ? 'bg-[var(--cut-10)] text-[var(--color-cut)]' : 'bg-[var(--monitor-10)] text-[var(--color-monitor)]'
                              }`}>
                                {alert.severity === 'critical' ? 'Critical' : 'Warning'}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-sm text-[var(--text)] truncate">"{alert.keyword}"</div>
                                <div className="text-xs text-[var(--text-muted)] mt-0.5">{alert.reason}</div>
                              </div>
                              <div className="shrink-0 text-sm font-semibold text-[var(--color-cut)]">${alert.spend_monthly.toLocaleString()}/mo</div>
                              <svg
                                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                className={`shrink-0 text-[var(--text-faint)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              >
                                <path d="M6 9l6 6 6-6"/>
                              </svg>
                            </div>
                            {isExpanded && (
                              <div className="px-2 pb-3">
                                <div className="bg-[var(--bg)] rounded-lg p-4 space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-wider mb-1">Campaign</div>
                                      <div className="text-sm font-mono text-[var(--text)]">{alert.campaign}</div>
                                    </div>
                                    <div>
                                      <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-wider mb-1">Monthly spend</div>
                                      <div className="text-sm font-semibold text-[var(--color-cut)]">${alert.spend_monthly.toLocaleString()}</div>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-wider mb-1">Why Juno flagged this</div>
                                    <div className="text-sm text-[var(--text-muted)]">{alert.reason}</div>
                                  </div>
                                  <a
                                    href={`https://ads.google.com/aw/keywords${customerId ? `?ocid=${customerId}` : ''}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:opacity-80 transition-opacity"
                                  >
                                    Open in Google Ads ↗
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── LAB SECTION ── */}
        {activeSection === 'lab' && <LabSection />}
      </main>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#222220] text-[var(--text)] text-sm px-5 py-3 rounded-lg border border-[var(--border-subtle)] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}

function LabSection() {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [experiments, setExperiments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  useEffect(() => {
    fetch('/api/lab/experiments')
      .then((r) => r.json())
      .then((data) => setExperiments(data.experiments ?? []))
      .catch(() => {})
  }, [])

  async function loadSuggestions() {
    setLoading(true)
    try {
      const res = await fetch('/api/lab/suggestions', { method: 'POST' })
      const data = await res.json()
      setLoading(false)
      if (data.error) { showToast(`Error: ${data.error}`); return }
      setSuggestions(data.suggestions ?? [])
      setLoaded(true)
    } catch (err: any) {
      setLoading(false)
      showToast(`Failed to generate suggestions: ${err.message}`)
    }
  }

  async function launchExperiment(s: any) {
    setLaunching(s.id)
    try {
      const res = await fetch('/api/lab/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const data = await res.json()
      setLaunching(null)
      if (data.error) { showToast(`Failed: ${data.error}`); return }
      setExperiments((prev) => [data.experiment, ...prev])
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id))
      showToast(`Experiment launched: ${s.title}`)
    } catch (err: any) {
      setLaunching(null)
      showToast(`Failed: ${err.message}`)
    }
  }

  async function dismissExperiment(id: string) {
    await fetch('/api/lab/experiments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'dismissed' }),
    })
    setExperiments((prev) => prev.filter((e) => e.id !== id))
  }

  const typeColors: Record<string, string> = {
    cut_waste: 'text-[var(--color-cut)] bg-[var(--cut-10)]',
    double_down: 'text-[var(--color-scale)] bg-[var(--scale-10)]',
    investigate: 'text-[var(--color-monitor)] bg-[var(--monitor-10)]',
  }
  const typeLabels: Record<string, string> = {
    cut_waste: 'Cut waste',
    double_down: 'Double down',
    investigate: 'Investigate',
  }

  const daysLeft = (endDate: string) => {
    const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diff > 0 ? `${diff}d left` : 'Ended'
  }

  return (
    <div>
      <div className="mb-8">
        <div className="text-[var(--accent)] text-xs font-mono uppercase tracking-widest mb-1">The Lab</div>
        <h1 className="text-3xl font-serif text-[var(--text)] mb-2">The Lab for Demand Gen</h1>
        <p className="text-[var(--text-muted)] text-sm max-w-xl">Stop guessing if your changes are working. Every major tactical shift becomes a Juno Hypothesis — and the CRM data proves you right or saves you money.</p>
      </div>

      {/* ACTIVE EXPERIMENTS */}
      {experiments.length > 0 && (
        <div className="mb-10">
          <div className="mb-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest">Active experiments</div>
          <div className="space-y-3">
            {experiments.map((e) => (
              <div key={e.id} className="bg-[var(--surface)] border border-[var(--accent-20)] rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${typeColors[e.type] ?? ''}`}>
                        {typeLabels[e.type] ?? e.type}
                      </span>
                      <span className="text-[var(--text-faint)] text-xs font-mono">{daysLeft(e.end_date)}</span>
                    </div>
                    <div className="font-semibold text-[var(--text)]">{e.title}</div>
                    <div className="text-sm text-[var(--text-muted)] mt-1">{e.if_action}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[var(--accent)] font-semibold text-sm mb-2">{e.expected_impact}</div>
                    <button
                      onClick={() => dismissExperiment(e.id)}
                      className="text-[var(--text-faint)] hover:text-[var(--color-cut)] text-xs transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[var(--text-faint)] font-mono uppercase tracking-wider">Then</span>
                    <div className="text-[var(--text-muted)] mt-0.5">{e.then_statement}</div>
                  </div>
                  <div>
                    <span className="text-[var(--text-faint)] font-mono uppercase tracking-wider">Because</span>
                    <div className="text-[var(--text-muted)] mt-0.5">{e.because_reason}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUGGESTIONS */}
      {!loaded ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center mb-8">
          <div className="text-[var(--text-faint)] text-sm mb-2">Generate experiment ideas based on your attribution data.</div>
          <div className="text-[var(--text-faint)] text-xs mb-4">Requires attribution data and Anthropic API key</div>
          <button
            onClick={loadSuggestions}
            disabled={loading}
            className="bg-[var(--accent)] text-[var(--accent-text)] font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Generating suggestions…' : 'Generate experiment ideas'}
          </button>
        </div>
      ) : suggestions.length > 0 ? (
        <>
          <div className="mb-3 text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest">Suggested experiments</div>
          <div className="space-y-4 mb-8">
            {suggestions.map((s, i) => (
              <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 hover:border-[var(--border-subtle)] transition-colors">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${typeColors[s.type] ?? ''}`}>
                        {typeLabels[s.type] ?? s.type}
                      </span>
                      <span className="text-[var(--text-faint)] text-xs font-mono">{s.window_days} days</span>
                    </div>
                    <div className="font-semibold text-[var(--text)] text-lg">{s.title}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[var(--accent)] font-semibold text-sm">{s.expected_impact}</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm mb-4">
                  <div><span className="text-[var(--text-faint)] font-mono text-xs uppercase tracking-wider mr-2">If</span><span className="text-[var(--text)]">{s.if_action}</span></div>
                  <div><span className="text-[var(--text-faint)] font-mono text-xs uppercase tracking-wider mr-2">Then</span><span className="text-[var(--text)]">{s.then_statement}</span></div>
                  <div><span className="text-[var(--text-faint)] font-mono text-xs uppercase tracking-wider mr-2">Because</span><span className="text-[var(--text-muted)]">{s.because_reason}</span></div>
                </div>
                {s.keywords_affected?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {s.keywords_affected.map((kw: string, j: number) => (
                      <span key={j} className="font-mono text-xs bg-[var(--surface-raised)] text-[var(--text-muted)] px-2 py-0.5 rounded">"{kw}"</span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => launchExperiment(s)}
                  disabled={launching === s.id}
                  className="bg-[var(--accent)] text-[var(--accent-text)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {launching === s.id ? 'Launching…' : 'Launch experiment'}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center mb-8">
          <div className="text-[var(--text-faint)] text-sm mb-4">All suggestions launched! Generate new ones anytime.</div>
          <button
            onClick={loadSuggestions}
            disabled={loading}
            className="bg-[var(--accent)] text-[var(--accent-text)] font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate more ideas'}
          </button>
        </div>
      )}

      {experiments.length === 0 && !loaded && (
        <div className="bg-[var(--surface)] border border-dashed border-[var(--border-subtle)] rounded-xl p-8 text-center">
          <div className="text-[var(--text-faint)] text-xs font-mono uppercase tracking-widest mb-2">Active experiments</div>
          <div className="text-[var(--text-faint)] text-sm">No active experiments yet. Generate ideas above to start tracking.</div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#222220] text-[var(--text)] text-sm px-5 py-3 rounded-lg border border-[var(--border-subtle)] shadow-xl">
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
    asset_group: 'bg-[#8a8678]/10 text-[var(--text-muted)]',
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
    scale: 'bg-[var(--scale-10)] text-[var(--color-scale)]',
    monitor: 'bg-[var(--monitor-10)] text-[var(--color-monitor)]',
    cut: 'bg-[var(--cut-10)] text-[var(--color-cut)]',
  }
  const labels = { scale: 'Scale', monitor: 'Monitor', cut: 'Cut now' }
  return (
    <span className={`inline-block px-2.5 py-1 rounded text-xs font-mono font-semibold ${styles[action]}`}>
      {labels[action]}
    </span>
  )
}
