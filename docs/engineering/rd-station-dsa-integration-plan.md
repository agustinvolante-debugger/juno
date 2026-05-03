# Next Session Prompt — Copy/paste this to start

```
Read these files first before doing anything:
- outreach/maquinsta-call-transcript.md (full call transcript + post-call analysis at the bottom)
- outreach/maquinista-call-prep.md (context on who they are and what we discussed)

Summary: I just had a successful discovery call with Maquinalista, a Brazilian marketplace for used agricultural/construction machinery. They agreed to a free audit. I need to build Juno to work with their stack.

Their setup:
- Google Ads: DSA (Dynamic Search Ads) + PMAX + broad search campaigns
- CRM: RD Station (not HubSpot)
- Sales: offline — leads from website, team closes via phone/WhatsApp, deals recorded in RD Station

Three things I need to build/research:
1. RD Station API integration — pull contacts with UTM fields + deals/opportunities (API docs: developers.rdstation.com)
2. DSA search term attribution — DSA doesn't use manual keywords, Google auto-generates search terms from website URLs. Need to figure out how search terms flow through UTMs and how to pull them from the Google Ads API
3. PMAX search term data — what does the Google Ads API expose for Performance Max campaigns?

The existing Juno codebase is at /Users/agustinvolante/Downloads/juno — it's a Next.js 14 app on Vercel with Supabase, currently wired for Google Ads + HubSpot. I need to add RD Station as a CRM option.

Google Ads API approval is still pending (expected May 1-2).

Start by researching the RD Station API and DSA/PMAX search term behavior, then let's plan the integration.
```
