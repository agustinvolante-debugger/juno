# Next Session Context — Juno (2026-04-30)

## What happened this session

### Migrations applied to Supabase (DONE)
Both SQL migrations were run on the Supabase SQL Editor and are now live:
- `supabase/migrations/001_crm_agnostic.sql` — contacts: `hubspot_id` → `crm_id` + `crm_provider`, deals: `hubspot_deal_id` → `crm_deal_id` + `crm_provider`, oauth_tokens expanded for RD Station
- `supabase/migrations/002_search_terms.sql` — keywords table: added `source_type`, `target_id`, `landing_page`, `headline` columns + updated unique constraint

### Code built (Phases 1-4 of integration plan)
All code is in `/Users/agustinvolante/Downloads/juno/`. Everything compiles and runs locally on localhost:3000.

**New files created:**
- `lib/rd-station/marketing-client.ts` — OAuth token refresh + contact fetch (filters google/cpc, maps UTM fields)
- `lib/rd-station/crm-client.ts` — Deal fetch with email-based contact bridging
- `app/api/rd-station/marketing/connect/route.ts` — OAuth redirect
- `app/api/rd-station/marketing/callback/route.ts` — OAuth token exchange
- `app/api/rd-station/crm/save-token/route.ts` — Static instance token storage
- `app/api/rd-station/sync/route.ts` — Full sync: refresh marketing token, fetch contacts + deals, bridge by email
- `app/api/dev/check/route.ts` — Diagnostic endpoint showing DB state (hit /api/dev/check in browser)

**Modified files:**
- `types/index.ts` — CRM-agnostic types, KeywordCAC has `source_type`
- `lib/hubspot/client.ts` — Returns `crm_id` + `crm_provider: 'hubspot'` instead of `hubspot_id`
- `app/api/hubspot/sync/route.ts` — Updated onConflict strings for new column names
- `lib/google-ads/client.ts` — Added `fetchDSASearchTermReport`, `fetchDSATargetMapping`, `fetchPMAXSearchTermReport`
- `app/api/google-ads/sync/route.ts` — Syncs DSA + PMAX search terms after keywords, stores DSA target map in oauth_tokens.extra
- `lib/attribution/join.ts` — DSA target ID resolution (`dsa-`/`kwl-` prefix), includes `source_type` in results
- `app/dashboard/DashboardClient.tsx` — CRM selector (HubSpot/RD Station), Source column with DSA/PMAX badges, error handling on seed + attribution calls
- `app/api/dev/seed/route.ts` — CRM-agnostic seed data, DSA search term rows, error reporting in response
- `app/demo/page.tsx` — Added `source_type: 'keyword'` to demo data
- `lib/email/digest.tsx` — DSA/PMAX/AG badges in weekly digest email
- `supabase/schema.sql` — Updated canonical schema for fresh installs
- `app/api/attribution/run/route.ts` — Added try/catch error handling

### Bug fixed
Seed + attribution were showing empty results because migrations hadn't been applied to Supabase. Added error handling across all API routes so DB errors surface in the UI toast instead of failing silently.

## What's NOT deployed yet
- All the above changes are LOCAL only — not pushed to GitHub or deployed to Vercel
- Need to add `RD_STATION_MARKETING_CLIENT_ID` and `RD_STATION_MARKETING_CLIENT_SECRET` to Vercel env vars when ready

## Blocked on
1. **Google Ads API approval** — submitted 2026-04-27, expected May 1-2. Currently in TEST MODE.
2. **Artur (Maquinalista)** — email sent requesting read-only Google Ads access + RD Station API credentials. No reply yet.
3. **YC application deadline** — May 6, 2026

## Maquinalista pilot context
- First pilot customer. Brazilian marketplace for used agricultural/construction machinery.
- Stack: Google Ads (DSA + PMAX + broad search) + Meta + TikTok → RD Station CRM
- Key contacts: Artur (Head of Marketing), Martin (internal advocate), Victor (developer with server-side tracking)
- Victor has internal tracking system with full on-site funnel per-user (UTMs, listing views, WhatsApp contacts, offers) — may be more valuable than RD Station for the contact→deal chain
- DSA is their primary ad type (no manual keywords)
- ~700 SKUs, offline sales cycle, high-ticket ($50K-$100K+ machinery)

## Plan file
Full integration plan with all phases: `/Users/agustinvolante/.claude/plans/crystalline-wobbling-globe.md`
- Phases 1-4: DONE (CRM-agnostic DB, RD Station, DSA, Dashboard updates)
- Phase 5 (PMAX polish): Not started — lower priority
- Phase 6 (error states, onboarding checklist, DSA UTM validation): Not started

## Next priorities
1. Push to GitHub + deploy to Vercel (add RD Station env vars)
2. Connect tryjunoapp.com domain (Cloudflare → Vercel)
3. Add production redirect URIs in Google Cloud Console
4. When Artur replies: connect to their Google Ads + RD Station, run first audit
5. YC application (due May 6)
