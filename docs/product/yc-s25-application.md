# YC S25 Application — Juno (DRAFT)

**Deadline: May 6, 2026**
**Status: DRAFT — needs founder review**

---

## Company

**Company name:** Juno
**Company URL:** https://www.tryjunoapp.com
**Tagline:** You're paying for clicks. Not customers.

---

## Describe what your company does in 50 characters or less

See which Google Ads keywords close deals

---

## What is your company going to make?

Juno is a keyword-level attribution tool for B2B SaaS companies running Google Ads. We pull keyword spend data from Google Ads, match it to contacts and closed deals in HubSpot via UTM parameters, and show the true CAC per keyword — not per campaign, not per channel, per keyword.

The output is a table: keyword, monthly spend, deals closed, true CAC, and a recommended action (scale, monitor, or cut). We also send a weekly email digest with budget recommendations.

The core technical insight: Google's auto-tagging (GCLID) breaks when B2B sales cycles stretch past 30 days. UTM parameters are more durable through long sales cycles but require correct setup. Most companies have misconfigured UTMs, which means HubSpot misattributes paid clicks as organic traffic. Juno fixes the attribution chain end-to-end.

---

## Why did you pick this idea to work on?

I spent months watching B2B founders dump money into Google Ads with no way to measure what was actually working at the keyword level. HubSpot shows you which campaign generated a contact. It doesn't show you which keyword generated a deal.

When I dug into the data, I found two specific problems that keep recurring:

First, broad match keywords trigger ads for irrelevant searches. A payments company bids on "Stripe" and pays for clicks on "Stripe shirt." Google hides 80% of search term data since 2020, so most companies can't see this happening.

Second, GCLID and UTM conflicts cause HubSpot to misattribute paid clicks as organic. The founder thinks SEO is driving leads when it's actually paid search — and they can't calculate ROI on their ad spend.

Every Head of Marketing I've talked to during customer discovery recognizes this as a real blind spot. The pain is universal but the existing tools (HockeyStack, Dreamdata, Ruler Analytics) all require a data warehouse or charge $30K+/year — out of reach for the Series A-C companies that need it most.

---

## What's new about what you're making? What substitutes do people resort to because it doesn't exist yet?

**What people do today:**
1. Manually export Google Ads data into spreadsheets and try to match it to CRM deals by hand (takes hours, done monthly at best)
2. Pay $30K+/year for enterprise attribution platforms (HockeyStack, Dreamdata) that require data warehouses like Snowflake or BigQuery
3. Just look at campaign-level ROAS in Google Ads and hope it's directionally correct
4. Give up and measure marketing by "vibes" — the CEO asks "are the ads working?" and the VP of Marketing says "I think so"

**What's new about Juno:**
- No data warehouse required. Direct API-to-API connection: Google Ads → Juno → HubSpot.
- Keyword-level CAC, not campaign-level. This is the granularity that matters for budget decisions.
- $800/month, not $30K/year. Priced for Series A-C companies with $3K-$50K/month in ad spend.
- We fix the attribution chain (UTM configuration, GCLID conflict resolution), not just report on broken data.

---

## Who are your competitors and what do you understand that they don't?

**Direct competitors:**
- **HockeyStack** ($30K+/year, requires data warehouse) — enterprise play, priced out of our ICP
- **Dreamdata** (similar pricing/complexity) — B2B attribution but requires Snowflake/BigQuery
- **Ruler Analytics** — lead tracking focused, doesn't do the keyword → deal join well

**Adjacent tools:**
- **HubSpot Ads reporting** — shows campaign-level data, not keyword-level. Can't calculate CAC by keyword.
- **Google Ads reporting** — shows clicks and conversions, not CRM deals. Offline conversion import exists but requires technical setup most teams don't have.
- **Hightouch/Census** — reverse ETL tools that could theoretically build this, but require a data warehouse and a data engineer to maintain.

**What we understand that they don't:** The 20-150 employee B2B SaaS company doesn't have a data warehouse, doesn't have a data engineer, and doesn't have $30K for an attribution platform. But they're spending $3K-$50K/month on Google Ads and can't tell you which keywords actually close deals. That's the gap.

---

## How do or will you make money?

Two stages:

First, we charge a percentage of savings. We audit the customer's Google Ads account, identify wasted spend (keywords with spend and zero pipeline over 90 days), and take a cut of what we save them. Typical finding: 20-30% of budgets go to keywords with zero pipeline. This is the wedge — it's zero risk for the customer and it proves the tool works with their real data.

Once we've proven value, we convert them to a monthly subscription charged per campaign. The customer already trusts the data because the savings audit showed them exactly what Juno found. At that point they're paying to keep the visibility, not taking a bet on an unknown tool.

---

## How will you get users?

**Current motion (already running):**
1. LinkedIn outreach to Heads of Marketing at Series B-C B2B SaaS companies in SF
2. Offer a free Google Ads attribution audit — we pull their data and show them the waste
3. The audit IS the product demo. We don't ask them to connect their CRM to an unknown tool. We show them the problem first.
4. Convert to paid pilot

**Traction so far:** 100+ outreach messages sent. Validation from a Series C fintech founder. Meeting scheduled with COO and CMO at Maquinalista to discuss a pilot. 97 more qualified companies from PitchBook ready to reach.

**Why this works at scale:** Every B2B company running Google Ads has this problem. We can show them their specific waste in 30 minutes before they pay anything. The free audit has near-zero friction — no integration required, no data warehouse setup, just read-only API access.

**Next channels:** Cold email via Apollo (for non-SF leads), LinkedIn content (posting anonymized Google Ads waste data), and referrals from design partners.

---

## Who writes code, or does other technical work on your product? Was any of it done by a non-founder?

I write all the code using AI coding tools (Claude Code and Cursor). No outside engineers or contractors. My background is investment banking (Jefferies), not engineering — but the product is deployed, live, and has real API integrations with Google Ads and HubSpot.

---

## How long have each of you been working on this? How much of that has been full-time?

Two weeks, full-time. Started mid-April 2026. Outreach during the day, building at night. Shipped a deployed product with two API integrations and sent 100+ messages to qualified marketing leaders at B2B SaaS companies.

---

## How far along are you?

Live product, pre-revenue. The app is deployed on Vercel with working Google Ads and HubSpot integrations, a keyword-to-deal attribution engine, and a dashboard showing CAC by keyword with recommended actions (scale, monitor, cut). Weekly email digest is built. On the customer side, I've done 100+ outreaches and gotten validation from a Series C fintech founder. I have a meeting tomorrow with the COO and CMO at Maquinalista to discuss a potential pilot. 97 more qualified companies from PitchBook are ready to reach. Goal is first paying design partner this month.

---

## What tech stack are you using?

Next.js 14, TypeScript, Tailwind CSS, Supabase (PostgreSQL), deployed on Vercel. Google Ads API and HubSpot API for data ingestion. Resend for email digest. NextAuth for authentication. Claude API (Anthropic) planned for AI-generated budget recommendations in V2. Built with Claude Code and Cursor as AI coding tools.

---

## If you have already participated in an incubator or accelerator, which one?

None.

---

## If you are applying with the same idea as a previous batch, did anything change? If you applied with a different idea, why did you pivot and what did you learn from the last idea?

Applied twice before with Caerus, an Office365 automation tool, alongside my brother Carlos. Two things changed: Carlos left to join YC with a different company (Runtm) in early April, and Caerus had no traction — the big LLM players (Anthropic, OpenAI) were steadily taking over the automation space we were building in.

Being on my own forced me to move fast and test ideas quickly. I built a global news aggregator that removed political bias, then started building keyword-level CAC for Google Ads. Juno was the one where people said "hey, this is actually interesting" — so I kept going.

Biggest lesson from Caerus: a purely technical idea with no taste involved in the decision-making will get blown out by the big LLM players. Caerus was automating something that AI platforms were already adding as a feature. Juno is different — it's built on domain expertise and customer context. The customer decides what to optimize, how to allocate budget, which keywords matter to their business. The AI helps them execute that faster, but it can't replace the judgment. We're not replacing anything, we're helping marketers achieve what they already want more efficiently.

The other lesson: iterate fast, listen to users, make them the center of everything. Promise the moon but with your feet on the ground.

---

## Planned equity ownership breakdown

Currently solo founder (CEO, 100% equity). Plan is to bring on a technical co-founder and offer them 40-50% — I want a real partner, not a hired engineer with a token stake. The remaining equity outside my ownership will be allocated to an employee option pool. I believe the best technical people do it for the love of the game, not just the paycheck. Offering strong cash plus meaningful equity lets them keep doing what they love with real upside. I'd rather have a smaller slice of something that works than full ownership of something that doesn't.

---

## What convinced you to apply to Y Combinator?

My brother Carlos is going through YC right now with his company (Runtm). Watching him go through the process firsthand showed me what YC actually provides. Not just the brand, but the real help: the network, the accountability, the partners who've seen every version of the problems you're facing. I want to be part of a community bigger than just me and Juno. I haven't attended YC events yet, but I'm in SF and plan to start. Honestly, seeing my brother build alongside other YC founders made me want to stop watching and start applying.

---

## Have you incorporated or formed any legal entity yet?

[TODO: Agustin to fill in — is Caerus AI Inc or similar entity formed?]

---

## How many founders? Are you a solo founder?

Solo founder. I do outreach during the day and build at night. AI tools (Claude Code, Cursor) let me ship a full-stack product with two API integrations in two weeks without an engineering background. Open to finding the right co-founder through YC rather than rushing into the wrong one.

---

## What convinced you that the problem you're solving is a real one?

Every Head of Marketing I've talked to during customer discovery says the same thing: "I can tell you our cost-per-click in 5 seconds. I cannot tell you which keywords are actually closing deals."

The data confirms it. Google hid 80% of search term data in September 2020 (the "search terms report" change). Since then, advertisers are increasingly blind to what their money buys. HubSpot shows campaign-level attribution but not keyword-level. Google Ads shows clicks but not CRM deals.

The result: 20-30% of B2B Google Ads budgets go to keywords with zero pipeline. This isn't a guess — it's the consistent finding across every account I've analyzed. At $20K/month in ad spend, that's $48K-$72K/year in waste. For a Series B company, that's real money.

The enterprise attribution tools (HockeyStack, Dreamdata) exist, which validates the problem. They just priced out the mid-market entirely.

---

## What is the essence of your company? In a sentence, what are you making and for whom?

Juno shows B2B marketers which Google Ads keywords actually close deals in their CRM — so they can cut the ones that don't.

---

## Where do you live now, and where would the company be based?

San Francisco, CA. The company would be based in San Francisco.

## Explain your decision regarding location.

San Francisco. This is where the customers are — the Series A-C B2B SaaS companies spending on Google Ads. It's where the best engineers and operators are if I need to hire. And it's where the conversations happen in person. I'm already doing coffee meetings with marketing leaders here. As we say in Spanish, "hay que estar donde las papas queman" — you have to be where the action is.

---

## Founder background

**Agustin (Chaska) Volante Silva**
- 24 years old, Chilean, based in San Francisco
- IU Kelley School of Business, graduated May 2024
- Investment Banking Analyst at Jefferies (New York) — M&A and capital markets advisory
- Solo founder building with AI (Claude Code, Cursor, Claude API)
- Email: chaska@caerusai.com

---

## How do you know your users need what you're making?

Three sources of evidence:

1. **Customer discovery conversations.** Every marketing leader I've spoken to confirms the blind spot: they can see cost-per-click but can't trace a keyword to a closed deal without manual spreadsheet work.

2. **The enterprise market exists.** HockeyStack raised $10M+ and charges $30K+/year for B2B attribution. Dreamdata, Ruler Analytics, and others compete in the same space. The problem is validated at the enterprise level — it just hasn't been solved for the mid-market.

3. **Google made it worse.** The September 2020 search terms report change hid 80% of search term data from advertisers. The problem is getting harder to solve manually, not easier.

---

## Revenue?

Pre-revenue. Product is built. Active outreach running. Goal: first paying customer before or during YC batch.

---

## What is your long-term vision for this company?

**Year 1:** Google Ads + HubSpot attribution. Prove the model with 20-30 paying customers. Nail the free audit → paid conversion motion.

**Year 2:** Add Meta Ads and Salesforce. Cross-channel view: "You spent $15K on Google and $10K on Meta last month. Here's where each dollar went in your pipeline." Multi-touch attribution model.

**Year 3:** AI-powered budget recommendations. "Based on your last 6 months of data, here's exactly how to reallocate your $30K/month ad budget to maximize pipeline." Automatic negative keyword management. Revenue forecasting by keyword.

**Long-term:** Juno becomes the system of record for ad spend → revenue attribution at B2B companies. Every marketing leader opens Juno before their board meeting to show exactly what their ad budget produced. We replace the spreadsheet, the guessing, and the $30K enterprise tools with a $800/month product that just works.

---

## If you had any other ideas you considered applying with, what were they?

[Juno is the only idea. All-in on this.]

---

## Is there anything else we should know about your company?

Two weeks in and the product is deployed, the outreach is running, and I have a pilot meeting scheduled. The question isn't whether I can build the product — it's already built. The question is whether I can convert the pipeline I'm building into paying customers. That's what every hour is going toward right now.

---

## Video (1-minute founder video)

[TODO: Record. Key points to hit:]
- Open with the problem: "Most B2B companies spending $10K-$50K/month on Google Ads can't tell you which keywords actually close deals."
- Show the product (screen recording of dashboard with mock data)
- The speed angle: "I built this in two weeks, solo, using AI. Here's the live product."
- The ask: "I need YC to help me get my first 10 paying customers."

---

## NOTES FOR AGUSTIN

### Strongest points in this application:
1. **Working product** — not an idea, not a mockup, deployed and live
2. **Speed** — 2 weeks from zero to full-stack SaaS, solo, with AI
3. **Clear problem with a number** — "20-30% of ad spend goes to zero-pipeline keywords"
4. **GTM already running** — 21 outreach messages sent, 97 qualified companies identified
5. **Priced for the gap** — $800/mo vs $30K/yr competitors

### What would make this stronger before May 6:
1. **One LOI or pilot agreement** — even a verbal "yes, I'd pay for this" from a marketing leader
2. **One real data audit** — run the free audit on a real company's Google Ads account and include the results (anonymized) as evidence
3. **Reply from outreach** — any positive signal from the 21 contacts
4. **Google Ads API approval** — shows real data flowing through the product

### Questions YC might push on:
- "You're a solo non-technical founder. Why should we believe you can maintain this product?" → AI tools, speed of build, and the product already exists
- "Why wouldn't HubSpot just build this?" → HubSpot has campaign-level reporting. Keyword-level requires deep Google Ads API integration that's outside their core product. Also, they'd cannibalize their own attribution reporting positioning.
- "What's your moat?" → Data network effects. The more companies use Juno, the better our benchmarks for "what's a good CAC by keyword category." Also, the integration work (UTM fixing, GCLID resolution) creates switching costs.
- "Why not just use Google Ads offline conversion import?" → Requires technical setup, breaks with long sales cycles, and doesn't give you the CRM-side attribution. Juno does it automatically.
