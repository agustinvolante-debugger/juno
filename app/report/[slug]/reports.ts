export interface ReportData {
  company: string
  slug: string
  domain: string
  industry: string
  description: string
  generatedDate: string
  paidKeywords: number
  monthlyClicks: number
  monthlyBudgetLow: number
  monthlyBudgetHigh: number
  effectiveCPC: number
  industryAvgCPC: number
  industryAvgCTR: number
  industryAvgCVR: number
  industryAvgCPL: number
  industryAvgWaste: number
  topKeywords: {
    keyword: string
    volume: string
    cpc: number
    clickShare: number
    intent: 'high' | 'medium' | 'low'
  }[]
  competitors: {
    domain: string
    keywords: string
    monthlyClicks: string
    budget: string
    commonKeywords: number
    overlapPercent: number
  }[]
  insights: {
    title: string
    metric: string
    body: string
    type: 'warning' | 'danger' | 'info'
  }[]
  trafficSplit: { paid: number; organic: number }
  adCopy: { headline: string; description: string; keyword: string }[]
  organic: {
    keywords: number
    monthlyClicks: number
    estClickValue: number
    page1Keywords: number
    fallingOffPage1: number
    topKeywords: { keyword: string; clicks: string; type: 'informational' | 'commercial' }[]
    competitors: { domain: string; keywords: string }[]
  }
}

export const reports: Record<string, ReportData> = {
  remofirst: {
    company: 'RemoFirst',
    slug: 'remofirst',
    domain: 'remofirst.com',
    industry: 'HR Tech / Employer of Record',
    description: 'Global employer of record platform enabling companies to hire in 180+ countries.',
    generatedDate: 'May 2026',
    paidKeywords: 4100,
    monthlyClicks: 8700,
    monthlyBudgetLow: 244000,
    monthlyBudgetHigh: 264000,
    effectiveCPC: 30.34,
    industryAvgCPC: 11.50,
    industryAvgCTR: 3.2,
    industryAvgCVR: 3.5,
    industryAvgCPL: 280,
    industryAvgWaste: 36.1,
    topKeywords: [
      { keyword: 'hr', volume: '61.1K', cpc: 2.19, clickShare: 3.47, intent: 'low' },
      { keyword: 'payroll', volume: '48.2K', cpc: 5.88, clickShare: 17.0, intent: 'low' },
      { keyword: 'outsourcing', volume: '37.2K', cpc: 6.53, clickShare: 2.46, intent: 'medium' },
      { keyword: 'employer', volume: '31.8K', cpc: 0.69, clickShare: 2.12, intent: 'low' },
      { keyword: 'applicant tracking system', volume: '4.3K', cpc: 171.93, clickShare: 1.2, intent: 'low' },
      { keyword: 'payroll services', volume: '4.5K', cpc: 118.48, clickShare: 1.8, intent: 'medium' },
    ],
    competitors: [
      { domain: 'oysterhr.com', keywords: '13.1K', monthlyClicks: '34.9K', budget: '$562K', commonKeywords: 1360, overlapPercent: 33 },
      { domain: 'deel.com', keywords: '14.2K', monthlyClicks: '424K', budget: '$3.96M', commonKeywords: 2880, overlapPercent: 70 },
      { domain: 'atlashxm.com', keywords: '3.3K', monthlyClicks: '109', budget: '$111K', commonKeywords: 760, overlapPercent: 19 },
      { domain: 'globalization-partners.com', keywords: '64.8K', monthlyClicks: '50K', budget: '$1.02M', commonKeywords: 1950, overlapPercent: 48 },
    ],
    insights: [
      {
        title: 'Effective CPC is ~3x the industry average',
        metric: '$30 vs $11.50',
        body: 'Based on estimated auction data, RemoFirst\'s effective cost per click appears to be approximately 2.6x the HR Tech industry benchmark. Deel, bidding on many of the same terms, achieves roughly $9 per click — suggesting higher Quality Scores or better-optimized landing pages that earn a Google discount.',
        type: 'danger',
      },
      {
        title: '~70% keyword overlap with a competitor spending 15x more',
        metric: '2,880 shared keywords with Deel',
        body: 'An estimated 70% of RemoFirst\'s paid keyword portfolio overlaps with Deel, who operates with roughly 15x the ad budget. Competing head-to-head on shared terms against a dramatically larger budget means getting outbid on most auctions. The opportunity: find high-intent keywords where Deel isn\'t competing.',
        type: 'warning',
      },
      {
        title: 'High-CPC keywords with mismatched buyer intent',
        metric: '$172/click on "applicant tracking system"',
        body: 'SpyFu shows bidding activity on "applicant tracking system" at an estimated $172 per click. People searching this term are typically looking for tools like Greenhouse or Lever — not an EOR. This could be a deliberate top-of-funnel play, but it\'s a high-risk bet unless CRM data shows these searchers convert to EOR contracts at an outsized rate.',
        type: 'danger',
      },
      {
        title: 'Highest-exposure keyword attracts mixed intent',
        metric: '"payroll" — est. 17% of paid clicks',
        body: '"Payroll" appears to be the single highest-exposure auction term, capturing an estimated 17% of all paid click activity. But this keyword is massively generic — it attracts people searching for payroll calculators, payroll jobs, ADP login help, and salary tools alongside actual EOR buyers. The signal-to-noise ratio is low.',
        type: 'warning',
      },
      {
        title: 'Brand defense may be inflating costs',
        metric: 'Est. $37 CPC on own brand name',
        body: 'External data suggests RemoFirst\'s own brand keyword carries a ~$37 CPC — significantly above what branded terms typically cost. This usually means competitors are actively bidding on your brand name, forcing you to pay a premium to defend your own search results. Worth auditing which competitors are triggering ads on "remofirst" searches.',
        type: 'info',
      },
    ],
    trafficSplit: { paid: 25.35, organic: 74.65 },
    adCopy: [
      {
        keyword: 'payroll',
        headline: 'Hire global talent with RemoFirst - Global Payroll & Compliance',
        description: 'Use RemoFirst as your Employer of Record to onboard employees anywhere in... Get Pricing · Employer Of Record Payroll Services · EOR Services · Full-Time & Contractor',
      },
      {
        keyword: 'payroll',
        headline: 'Payroll Management Made Easy',
        description: 'World\'s Most Affordable EOR — Hire anywhere without setting up a local entity. Starts at $199 per employee per month. 180+ countries. Book Your Free Demo Today.',
      },
    ],
    organic: {
      keywords: 11020,
      monthlyClicks: 10800,
      estClickValue: 109000,
      page1Keywords: 1806,
      fallingOffPage1: 425,
      topKeywords: [
        { keyword: 'telecommuting', clicks: '1K', type: 'informational' },
        { keyword: 'employee', clicks: '380', type: 'informational' },
        { keyword: 'fisa', clicks: '270', type: 'informational' },
        { keyword: 'eor', clicks: '270', type: 'commercial' },
        { keyword: 'tin', clicks: '210', type: 'informational' },
        { keyword: 'wages definition', clicks: '150', type: 'informational' },
        { keyword: 'independent contractor payment schedule', clicks: '115', type: 'informational' },
        { keyword: 'what is a freelancer', clicks: '95', type: 'informational' },
      ],
      competitors: [
        { domain: 'usemultiplier.com', keywords: '38.4K' },
        { domain: 'asanify.com', keywords: '28K' },
        { domain: 'velocityglobal.com', keywords: '28.3K' },
        { domain: 'rivermate.com', keywords: '18.7K' },
      ],
    },
  },
}
