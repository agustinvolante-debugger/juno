export interface DocItem {
  slug: string
  title: string
  file: string
}

export interface DocCategory {
  name: string
  slug: string
  items?: DocItem[]
  subcategories?: DocCategory[]
}

export const docsManifest: DocCategory[] = [
  {
    name: 'Product',
    slug: 'product',
    items: [
      { slug: 'company-overview', title: 'Company Overview — What Juno Is and How It Works', file: 'product/company-overview.md' },
      { slug: 'yc-s25-application', title: 'YC S25 Application Draft (Due May 6)', file: 'product/yc-s25-application.md' },
    ],
  },
  {
    name: 'Engineering',
    slug: 'engineering',
    items: [
      { slug: 'session-handoff-apr30', title: 'Session Handoff — April 30 (Migrations, RD Station, DSA)', file: 'engineering/session-handoff-apr30.md' },
      { slug: 'rd-station-dsa-integration-plan', title: 'RD Station & DSA/PMAX Integration Plan', file: 'engineering/rd-station-dsa-integration-plan.md' },
      { slug: 'outreach-skill-system', title: 'Outreach Skill System Architecture', file: 'engineering/outreach-skill-system.md' },
    ],
  },
  {
    name: 'Sales & Outreach',
    slug: 'sales',
    subcategories: [
      {
        name: 'Strategy',
        slug: 'strategy',
        items: [
          { slug: 'gtm-strategy-and-icp', title: 'GTM Strategy, ICP Definition & Champion Theory', file: 'sales/strategy/gtm-strategy-and-icp.md' },
          { slug: 'brand-voice-guide', title: 'Brand Voice Guide — Tone, Rules & Examples', file: 'sales/strategy/brand-voice-guide.md' },
          { slug: 'lead-data-contract', title: 'Lead Artifact Data Contract (Filter → Drafter)', file: 'sales/strategy/lead-data-contract.md' },
          { slug: 'pitchbook-qualified-targets', title: 'PitchBook Qualified Targets — 63 Companies by Vertical', file: 'sales/strategy/pitchbook-qualified-targets.md' },
        ],
      },
      {
        name: 'Active Prospects — Maquinalista',
        slug: 'prospects',
        items: [
          { slug: 'maquinalista-discovery-call-prep', title: 'Discovery Call Prep — Attendees, Script & Questions', file: 'sales/prospects/maquinalista-discovery-call-prep.md' },
          { slug: 'maquinalista-discovery-call-transcript', title: 'Discovery Call Transcript & Post-Call Analysis', file: 'sales/prospects/maquinalista-discovery-call-transcript.md' },
          { slug: 'maquinalista-whatsapp-thread-martin', title: 'WhatsApp Thread with Martin — Meeting Setup (Spanish)', file: 'sales/prospects/maquinalista-whatsapp-thread-martin.md' },
          { slug: 'maquinalista-post-call-debrief-martin', title: 'Post-Call Debrief with Martin — Next Steps (Spanish)', file: 'sales/prospects/maquinalista-post-call-debrief-martin.md' },
        ],
      },
      {
        name: 'Outreach Drafts',
        slug: 'drafts',
        items: [
          { slug: 'cybersecurity-compliance-outreach', title: 'Cybersecurity & Compliance — 6 Company Drafts', file: 'sales/drafts/cybersecurity-compliance-outreach.md' },
          { slug: 'hr-payroll-outreach', title: 'HR & Payroll — 5 Company Drafts', file: 'sales/drafts/hr-payroll-outreach.md' },
          { slug: 'hr-payroll-apollo-contacts', title: 'HR & Payroll — Apollo Contact List', file: 'sales/drafts/hr-payroll-apollo-contacts.md' },
        ],
      },
    ],
  },
  {
    name: 'Session Logs',
    slug: 'logs',
    items: [
      { slug: 'apr29-google-ads-rejection-and-linkedin', title: 'April 29 — Google Ads API Rejection & LinkedIn Outreach', file: 'logs/apr29-google-ads-rejection-and-linkedin.md' },
      { slug: 'apr29-outreach-drafts-cyber-and-hr', title: 'April 29 — Outreach Drafts (Cybersecurity & HR Verticals)', file: 'logs/apr29-outreach-drafts-cyber-and-hr.md' },
      { slug: 'apr29-pitchbook-filtering', title: 'April 29 — PitchBook Filtering (354 → 63 Qualified Companies)', file: 'logs/apr29-pitchbook-filtering.md' },
      { slug: 'apr29-yc-application-and-demo', title: 'April 29 — YC Application Draft & Demo Page Deploy', file: 'logs/apr29-yc-application-and-demo.md' },
    ],
  },
]
