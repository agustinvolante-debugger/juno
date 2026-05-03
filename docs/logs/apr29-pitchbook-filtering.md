# Session Log — April 29, 2026 (PitchBook Filter & Outreach Strategy)

## What happened this session

### 1. Re-screened PitchBook with precision ICP filters
- Original screen: "B2B SaaS in SF, Series B-C" → too broad, included PLG/developer companies that don't use Google Ads
- New logic: **target companies in crowded, high-CPC categories where Google Ads is a primary growth channel**
- Added max raised cap of $80M to filter out companies too large/well-resourced (e.g., Upwind at $430M raised)
- PitchBook filters: Series A-C, $10M-$80M raised, 30-250 employees, US, generating revenue

### 2. Filtered 354 companies → 63 qualified (82% cut)
- Full filtered list saved to: `pb data/pitchbook_filtered.md`
- Companies vetted individually: StreamSets (SKIP — acquired by IBM, developer-led), Upwind (SKIP — too big, $1.5B valuation)

### 3. Five target verticals identified (by CPC range)

| Vertical | Avg CPC | Why Google Ads waste is worst here |
|----------|---------|-----------------------------------|
| Insurtech | $30-55 | Highest CPCs in SaaS. "Business insurance" triggers personal insurance searches |
| Cybersecurity/Compliance | $20-45 | "SOC 2 compliance," "endpoint security" — crowded, every Series B bidding aggressively |
| HR/Payroll/Recruiting | $15-35 | "Payroll software" triggers "payroll calculator," "payroll jobs near me" |
| Legal Tech/Contracts | $15-40 | "Contract management" triggers "contract jobs," "free template" |
| Sales Tools/Engagement | $8-20 | Most crowded SaaS category, competitors bid on each other's brands |

### 4. Council strategy recommendation (Gemini + Claude synthesis)

**Key shift: Hybrid approach by company size, not one-size-fits-all**

| Company Size | Approach | Target Titles |
|-------------|----------|---------------|
| 30-60 employees | Go direct to CEO/CMO | Founder, CEO, CMO, VP Marketing |
| 60-150 employees | Multi-thread (2 contacts per company) | Paid Ads Specialist + VP Marketing |
| 150-250 employees | Champion method | Performance Marketing Mgr, Head of Demand Gen |

**Multi-threading is non-negotiable** — with only 28 Tier 1 targets, single-threading is too risky. Contact 2 people per company: one tactical (runs ads), one strategic (owns budget).

**Updated title priority:**
1. Performance Marketing Manager / Paid Ads Specialist — lives in Google Ads daily
2. Head of Growth / Growth Marketing Manager — owns pipeline metrics, judged on CAC
3. Head of Demand Gen / Director Demand Gen — owns the funnel
4. Revenue Ops / GTM Engineer / Marketing Ops — technical evaluator
5. VP Marketing / CMO (at companies <60 emp only)
6. Founder/CEO (at companies <40 emp only)

**Vary the "villain" by vertical:**
- Cybersecurity: "Your CPCs are $30-50. Each wasted click hurts 10x more."
- HR/Payroll: "'Payroll software' triggers junk clicks like 'payroll calculator.'"
- Insurtech: "Highest CPCs in SaaS. One irrelevant click costs more than a month of Juno."
- Sales Tools: "Most crowded category. Efficiency over volume — beat competitors on CAC."

**Replace "coffee" with "Leakage Report"** — more specific, more urgent, less time-sink.

---

## Tier 1 Companies (28) — ready for Apollo lookup

### Cybersecurity / Compliance (8 companies)
| Company | Employees | Raised ($M) | Website |
|---------|-----------|-------------|---------|
| Riot Security | 140 | 30.0 | tryriot.com |
| Conveyor | 50 | 21.0 | conveyor.com |
| SecurityPal | 232 | 21.0 | securitypalq.com |
| Fable Security | 49 | 24.5 | fablesecurity.com |
| RAD Security | 40 | 14.0 | radsecurity.ai |
| BreachRx | 35 | 15.0 | breachrx.com |
| Paubox | 54 | 10.0 | paubox.com |
| Process Street | 55 | 12.2 | process.st |

### HR / Payroll / Recruiting (5 companies)
| Company | Employees | Raised ($M) | Website |
|---------|-----------|-------------|---------|
| Remofirst | 187 | 25.0 | remofirst.com |
| Miter | 96 | 23.0 | miter.com |
| BetterComp | 78 | 31.0 | bettercomp.com |
| KarmaCheck | 95 | 45.0 | karmacheck.com |
| Censia | 98 | 37.0 | censia.com |

### Insurtech (7 companies)
| Company | Employees | Raised ($M) | Website |
|---------|-----------|-------------|---------|
| Harper Insurance | 32 | 47.0 | harperinsure.com |
| MGT Insurance | 44 | 21.6 | mgtinsurance.com |
| SafetyWing | 148 | 35.0 | safetywing.com |
| Ascend | 67 | 31.0 | useascend.com |
| Foresight | 44 | — | getforesight.com |
| Tint | 47 | — | tint.ai |
| Delos Insurance | 40 | — | getdelos.com |

### Sales Tools / Engagement (8 companies)
| Company | Employees | Raised ($M) | Website |
|---------|-----------|-------------|---------|
| Regie.ai | 99 | 30.0 | regie.ai |
| Demostack | 57 | 34.0 | demostack.com |
| UserGems | 100 | 20.0 | usergems.com |
| Amplemarket | 110 | 12.0 | amplemarket.com |
| GetAccept | 200 | — | getaccept.com |
| Mixmax | 124 | — | mixmax.com |
| LeadIQ | 102 | — | leadiq.com |
| Artisan AI | 40 | 25.0 | artisan.co |

---

## Tier 2 Companies (23) — Apollo lookup after Tier 1

**Tax/Accounting:** Numeral Two, Kintsugi, Quanta, Maxima, Truewind, Tesorio
**Marketing Tools:** Mutiny, Haus, Singular, EZ Texting, Freshpaint
**Payments/Billing:** Collectly, Siteline, PayEm
**Procurement:** Spendflo, Arkestro, BRM
**Other:** Qualio, Newo.ai, Rattle, Landbase, Pulsora, Comulate

---

## Apollo AI Search Prompts (copy-paste ready)

### Prompt 1: Cybersecurity / Compliance
```
Find people with titles including "Performance Marketing", "Growth Marketing", "Demand Generation", "Head of Marketing", "VP Marketing", "Marketing Ops", "Revenue Operations", "GTM Engineer", or "Paid Media" at these companies: Riot Security, Conveyor, SecurityPal, Fable Security, RAD Security, BreachRx, Paubox, Process Street
```

### Prompt 2: HR / Payroll / Recruiting
```
Find people with titles including "Performance Marketing", "Growth Marketing", "Demand Generation", "Head of Marketing", "VP Marketing", "CMO", "Marketing Ops", "Revenue Operations", or "Paid Media" at these companies: Remofirst, Miter, BetterComp, KarmaCheck, Censia
```

### Prompt 3: Insurtech
```
Find people with titles including "Performance Marketing", "Growth Marketing", "Demand Generation", "Head of Marketing", "VP Marketing", "CMO", "Founder", "CEO", "Marketing Ops", or "Paid Media" at these companies: Harper Insurance, MGT Insurance, SafetyWing, Ascend, Foresight Insurance, Tint, Delos Insurance
```

### Prompt 4: Sales Tools / Engagement
```
Find people with titles including "Performance Marketing", "Growth Marketing", "Demand Generation", "Head of Marketing", "VP Marketing", "Marketing Ops", "Revenue Operations", "GTM Engineer", or "Paid Media" at these companies: Regie.ai, Demostack, UserGems, Amplemarket, GetAccept, Mixmax, LeadIQ, Artisan AI
```

### Prompt 5: Tier 2 Batch
```
Find people with titles including "Performance Marketing", "Growth Marketing", "Demand Generation", "Head of Marketing", "VP Marketing", "CMO", "Marketing Ops", "Revenue Operations", or "Paid Media" at these companies: Numeral Two, Kintsugi, Quanta, Maxima, Truewind, Tesorio, Mutiny, Haus, Singular, EZ Texting, Freshpaint, Collectly, Siteline, PayEm, Spendflo, Arkestro, BRM, Qualio, Newo.ai, Rattle, Landbase, Pulsora, Comulate
```

---

## Outreach message modes for next session

**Mode: Direct (for small companies, CEO/CMO):**
Lead with the vertical-specific pain + "20-30% of spend" number. No coffee, no fluff. Offer a leakage report.

**Mode: Multi-thread tactical (for Paid Ads / Performance Mktg person):**
"I built a tool that traces your Google Ads keywords to closed deals in the CRM. Curious how [Company] handles that today."

**Mode: Multi-thread strategic (for VP Marketing / budget holder):**
"Most [vertical] teams we look at have 20-30% of Google Ads spend going to keywords with zero pipeline. Building in this space. Curious if that matches what you're seeing."

---

## Next session priorities
1. Run Apollo Prompt 1 (Cybersecurity/Compliance) — screenshot results and bring to Claude
2. Draft messages for cybersecurity contacts using vertical-specific angle
3. Run Apollo Prompts 2-4 for remaining Tier 1 verticals
4. Goal: 56 messages drafted (2 per company × 28 companies)
5. Continue monitoring LinkedIn for replies from the 21 already contacted
6. Check Google Ads API approval status (expected by May 1-2)
7. YC application finalization — deadline May 6

## Files created this session
- `pb data/juno_pitchbook_354.csv` — raw PitchBook export (354 companies)
- `pb data/pitchbook_filtered.md` — filtered list with tiers and skip reasons
- This file (`Notes/session-log-apr29-pitchbook-filter.md`)
