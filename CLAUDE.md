# Juno — Claude Code Context

## What is Juno

Juno is a B2B SaaS tool that connects Google Ads to HubSpot CRM so founders and marketing leaders can see exactly which keywords are generating pipeline — and which ones are burning budget with zero return.

**Tagline:** You're paying for clicks. Not customers.

**Core output:** CAC (Customer Acquisition Cost) by keyword. A table showing every bidded keyword, total spend, deals closed, true CAC, and a recommended action (scale, monitor, cut).

---

## The Two Core Problems Juno Solves

### Problem 1: Irrelevant keyword spend (negative keyword waste)
Companies bid on broad or phrase match keywords that trigger ads for completely irrelevant searches. Example: a payments company bids on "Stripe" and ends up paying for searches like "Stripe Italy," "Stripe shirt," or "Stripe the band." These clicks cost money and never convert. Google hides 80% of actual search term data since 2020, making this invisible to the advertiser. Juno surfaces which search terms are irrelevant and flags them for negative keyword exclusion.

### Problem 2: UTM/GCLID miscategorization in HubSpot
Google Ads uses auto-tagging (GCLID) by default. When GCLID and UTM parameters conflict, or when UTMs are formatted incorrectly, HubSpot misattributes paid clicks as organic or direct traffic. This means the founder thinks their SEO is working when it's actually paid search — and they can't calculate true ad ROI. Juno fixes the UTM setup and correctly attributes every paid click to the right keyword in HubSpot.

---

## How It Works (Technical Architecture)

```
Google Ads API → UTM Parameters → Landing Page → HubSpot API → Juno Dashboard
```

**Step 1 — Google Ads API**
- Pull keyword spend, impressions, clicks, search term reports
- Identify which bidded keywords are triggering irrelevant searches
- Flag negative keyword candidates automatically

**Step 2 — UTM Parameter Setup**
- Properly format UTM tags on every Google Ads URL:
  `utm_source=google&utm_medium=cpc&utm_campaign={campaign}&utm_term={keyword}`
- Ensure UTM format is compatible with HubSpot's expected schema
- Resolve GCLID vs UTM conflicts (disable auto-tagging or use parallel tracking)

**Step 3 — HubSpot API**
- Connect to HubSpot via OAuth
- Read contact properties: `hs_analytics_source`, `hs_analytics_first_url`, UTM fields
- Match contacts to deals in pipeline
- Pull deal stage, close date, deal value

**Step 4 — Attribution Join**
- Match: keyword (from UTM) → contact (from HubSpot) → deal (from pipeline)
- Attribution model for v1: first touch
- Calculate: spend per keyword ÷ closed deals attributed to that keyword = true CAC

**Step 5 — Dashboard Output**
- Table: keyword | spend/mo | deals | true CAC | action
- Color coded: green (scale), amber (monitor/test), red (cut)
- Weekly recommendation: "These 3 keywords spent $X with zero pipeline in 90 days"
- Monthly summary: total ad spend, pipeline generated, estimated savings from cuts

---

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, Vercel
- **Backend:** Next.js API routes (serverless)
- **Database:** Supabase (PostgreSQL)
- **APIs:** Google Ads API, HubSpot API (OAuth)
- **Auth:** NextAuth.js
- **AI layer:** Anthropic Claude API (for natural language recommendations and weekly summaries)
- **Dev tools:** Cursor, Claude Code

---

## Product Roadmap

### V1 (current focus)
- Google Ads API connection
- UTM parameter validation and fix tool
- HubSpot OAuth integration
- Keyword → contact → deal attribution join
- Dashboard: CAC by keyword table
- Weekly email digest (keyword changes, budget recommendations, savings opportunities)
- First touch attribution model
- HubSpot OAuth for any customer (not just private app)

### V2
- Meta Ads API (fbclid tracking + Conversions API)
- Salesforce CRM integration
- Multi-touch attribution model
- iOS 14 attribution workaround
- Cross-channel view: Google vs Meta spend

### V3
- AI-powered budget recommendations (Claude)
- Automatic negative keyword suggestions
- ICP matching (which keywords attract best-fit customers)
- LinkedIn Ads integration
- Revenue forecasting by keyword

---

## Business Model

**Primary:** Percentage of money saved on Google Ads spend
- Identify wasted spend (irrelevant keywords, zero-pipeline keywords)
- Charge a percentage of the documented savings
- Typical finding: 20-30% of Google Ads budgets go to keywords with zero pipeline

**Secondary:** Monthly subscription
- $800/month flat fee for companies that prefer predictable pricing
- Starter: up to 30 employees
- Growth: 30-80 employees

---

## Target Customer (ICP)

- **Who:** Founder or Head of Marketing / VP Marketing at a B2B SaaS company
- **Stage:** Series A to C
- **Ad spend:** $3K to $50K/month on Google Ads
- **CRM:** HubSpot (v1) or Salesforce (v2)
- **Pain:** Bleeding money on Google Ads with no visibility into what's actually working
- **Size:** 20-150 employees, no dedicated marketing ops team
- **Geography:** SF Bay Area first, then national

**Example target companies:** Rattle, Scribe, AirOps, Pylon, Regie.ai, PostHog, WorkOS, Linear

---

## Go To Market

**Outreach motion:**
1. Find Head of Marketing or founder via PitchBook + Apollo
2. LinkedIn DM or email with specific pain point question — not a pitch
3. Offer a free attribution audit: pull their Google Ads + HubSpot data and show them exactly how much they're spending on irrelevant or zero-pipeline keywords
4. Convert to paid pilot at $800/month (or % of savings model)

**Outreach message (current version):**
```
Hey [Name],

Quick question. Do you know which Google Ads keywords are actually turning into pipeline, or just which ones get clicks?

Doing customer discovery on this and keep hearing it's a real blind spot for growth teams. Would love to grab coffee in SF (on me) and hear your take if it resonates.

Worth 20 minutes?

Agustin
```

**Key differentiator vs HubSpot:**
"HubSpot shows you which campaign generated a contact. We show you which keyword generated a deal."

---

## Key Technical Decisions Made

- **First touch attribution for v1** — simpler to build, gets 80% of the value
- **UTM over GCLID** — more durable through long B2B sales cycles
- **HubSpot first** — most common CRM at Series A/B, fastest to validate
- **No data warehouse required** — unlike Hightouch, works without Snowflake/BigQuery
- **Google Ads only for v1** — Meta is v2 after first paying customer

---

## Known Technical Challenges

1. **GCLID conflict resolution** — need to either disable Google auto-tagging or use parallel tracking to let UTMs and GCLID coexist
2. **Long sales cycle attribution** — B2B deals take weeks or months; need to preserve UTM from first click through to deal close without it being overwritten
3. **HubSpot UTM field mapping** — HubSpot stores UTMs in specific contact properties; need to ensure `utm_term` maps correctly and isn't overwritten by subsequent visits
4. **Minimum data requirements** — need enough deal volume to make keyword-level CAC meaningful; need to handle edge cases where a keyword has spend but zero deals

---

## Founder

**Chaska Volante** (legal name: Agustin Volante Silva)
- 24-year-old Chilean founder based in San Francisco
- IU Kelley grad (May 2024), former IB analyst at Jefferies NY
- Solo founder — building with AI tools (Cursor, Claude Code, Claude API)
- Contact: chaska@caerusai.com

---

## Files In This Project

- `juno_landing.html` — public-facing landing page
- `project_juno_v2.html` — internal strategy document with diagrams
- `juno_pitch.pptx` — pitch deck (8 slides)
- `CLAUDE.md` — this file

---

## What To Build Next (V1 MVP Priority Order)

1. Next.js project setup with Supabase and auth
2. Google Ads API OAuth connection + keyword data pull
3. UTM validation tool — check if UTMs are correctly formatted and not conflicting with GCLID
4. HubSpot OAuth connection + contact/deal data pull
5. Attribution join logic — keyword → contact → deal
6. Dashboard UI — CAC by keyword table with actions
7. Weekly email summary with budget recommendations
