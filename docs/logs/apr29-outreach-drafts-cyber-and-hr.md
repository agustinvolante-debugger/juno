# Session Log — April 29, 2026 (Outreach Drafts: Cyber + HR/Payroll)

## What happened this session

### 1. Apollo Prompt 1 — Cybersecurity/Compliance
- Ran Apollo search for 8 companies. Got 25 contacts back.
- Riot Security SKIPPED (all contacts Paris-based, not US ICP)
- SecurityPal SKIPPED (zero contacts returned from Apollo)
- Selected 10 contacts across 6 companies: Conveyor, Paubox, Process Street, BreachRx, RAD Security, Fable Security
- Drafted emails + LinkedIn connection messages for all 10
- File: `outreach/cybersecurity-compliance/prompt1-drafts.md`
- 6 cybersecurity emails scheduled for Wed Apr 30 AM via Gmail Schedule Send
- 4 contacts still need Apollo unlock (Brooke M at RAD, Emily M at BreachRx, Katy G + Sanny L at Fable)

### 2. Council validated email-first channel strategy
- Gemini recommended: email Day 1, LinkedIn connection Day 2 (references email), InMail Day 7+
- Rationale: with 28 Tier 1 targets, burning LinkedIn on cold first touch is risky
- Email establishes context. LinkedIn becomes warm follow-up.
- ChatGPT API returning HTTP 400 — only Gemini responding. Check .env / API key.

### 3. Apollo Prompt 2 — HR/Payroll/Recruiting
- Ran Apollo search for 5 companies. Got 27 contacts back.
- Selected 10 contacts across all 5 companies: RemoFirst, BetterComp, KarmaCheck, Miter, Censia AI
- Council insight: "If no Marketing title exists, CEO = CMO, CRO = VP Demand Gen"
- Tobin P (CRO at Miter) validated as target — feels lead quality pain directly
- Censia AI (content-led) NOT a red flag — content companies use Google Ads for lead magnets
- File: `outreach/hr-payroll/prompt2-drafts.md`
- 7 contacts need Apollo unlock before sending

### 4. Key decisions made this session
- **Email signature:** "Agustin Volante / Founder, Juno / tryjuno.com" — no pipes, no phone, no tagline
- **Gmail is fine** for current volume. Switch to @tryjuno.com when exceeding 20-30/week.
- **Founder emails must seek guidance, not pitch Juno.** Agustin rejected the cybersecurity founder drafts as "too fake." New rule: don't mention Juno or "I built a tool" in founder-to-founder emails. Let the email signature do the product awareness passively.
- **Send timing:** 8:30 AM in recipient's local timezone. Use Gmail Schedule Send. Best days: Tue-Thu.
- **Cybersecurity founder emails (Hoala, Vinay, Brooke, Sanny) still need redrafting** with guidance-seeking tone. The tactical/strategic emails were approved and scheduled.

### 5. Numbers as of end of session
- Total drafted: 36 (16 prior + 10 cyber + 10 HR)
- Total contacted: 16 (all from Apr 27-28 LinkedIn batch)
- Replies: 0
- Apollo unlocks needed: 11 (4 cyber + 7 HR)

---

## Files created/modified this session
- `outreach/cybersecurity-compliance/prompt1-drafts.md` — NEW
- `outreach/hr-payroll/prompt2-drafts.md` — NEW
- `outreach/names-payroll.md` — NEW (raw Apollo paste, 27 contacts)
- `state/linkedin-system-state.json` — UPDATED (26 new draft entries)
- `Notes/session-log-apr29-outreach-drafts.md` — this file

---

## Next session priorities (Apr 30)

### IMMEDIATE: Insurtech vertical (Apollo Prompt 3)
1. Run Apollo Prompt 3 in Apollo (copy from session-log-apr29-pitchbook-filter.md):
   ```
   Find people with titles including "Performance Marketing", "Growth Marketing",
   "Demand Generation", "Head of Marketing", "VP Marketing", "CMO", "Founder",
   "CEO", "Marketing Ops", or "Paid Media" at these companies: Harper Insurance,
   MGT Insurance, SafetyWing, Ascend, Foresight Insurance, Tint, Delos Insurance
   ```
2. Paste Apollo results into Claude Code
3. Ask council for contact selection + channel strategy
4. Generate `outreach/insurtech/prompt3-drafts.md` with emails + LinkedIn messages
5. Insurtech villain: Highest CPCs in SaaS ($30-55). "Business insurance" triggers personal insurance searches. One irrelevant click costs more than a month of Juno.
6. Most insurtech companies are small (32-67 emp) — expect more founder-direct approach
7. Remember: founder emails seek guidance, not pitch

### ALSO DO
8. Redraft 4 cybersecurity founder emails (Hoala/Paubox, Vinay/Process Street, Brooke/RAD, Sanny/Fable) with guidance-seeking tone — update prompt1-drafts.md
9. Run Apollo Prompt 4 (Sales Tools) if time allows
10. Unlock the 11 paywalled contacts in Apollo and get email addresses
11. Send LinkedIn connection requests (Day 2) for the 6 cyber emails that went out Wed AM
12. Monitor LinkedIn for replies from 16 prior contacts
13. Check Google Ads API approval status (expected by May 1-2)
14. YC application — deadline May 6

### START TOMORROW'S SESSION WITH:
```
Check Notes/session-log-apr29-outreach-drafts.md — we're running Apollo Prompt 3
(Insurtech) and drafting messages for those contacts. Also need to redraft the 4
cybersecurity founder emails in outreach/cybersecurity-compliance/prompt1-drafts.md
with guidance-seeking tone (not pitching Juno). Insurtech companies: Harper Insurance,
MGT Insurance, SafetyWing, Ascend, Foresight, Tint, Delos Insurance.
```
