# AGENTS-LOG — Claude Code ⇄ Codex coordination

This is how we stay in sync. **Read the latest entries before you start work. Append a new entry when you finish a session.** We can't talk live — this file (+ Agustin) is the channel.

### Entry template
```
### YYYY-MM-DD — [Claude | Codex] — branch: <name>
- Did:
- Files touched:
- Checks: tsc ✅/❌ · build ✅/❌
- Next / handing off:
- ⚠ Don't-touch / warnings:
```

---

### 2026-06-08 — Codex — branch: codex/add-martin-allowed-email
- Did: removed `artur.magalhaes@elebbre.com.br` and `renato.nascimento@elebbre.com.br` from the NextAuth `ALLOWED_EMAILS` list in `lib/auth.ts`.
- Files touched: `AGENTS-LOG.md`, `lib/auth.ts`
- Checks: tsc ✅ · build ✅
- Next / handing off: Ready for Agustin review/commit; no deploy or push performed.
- ⚠ Don't-touch / warnings: Build still emits existing Next workspace-root, `punycode`, and chart sizing warnings, but exits successfully.

### 2026-06-08 — Codex — branch: codex/add-martin-allowed-email
- Did: added `mgajardoleca@gmail.com` to the NextAuth `ALLOWED_EMAILS` list in `lib/auth.ts`.
- Files touched: `AGENTS-LOG.md`, `lib/auth.ts`
- Checks: tsc ✅ · build ✅
- Next / handing off: Ready for Agustin review/commit; no deploy or push performed.
- ⚠ Don't-touch / warnings: `npm run build` passed after `npm install` restored missing local native packages. Build still emits existing Next workspace-root, `punycode`, and chart sizing warnings.

### 2026-06-08 — Codex — branch: codex/add-martin-allowed-email
- Did: checked the auth allowlist in `lib/auth.ts`; `martin.gajardo@maquinalista.com` was already present, so no code change was needed.
- Files touched: `AGENTS-LOG.md`
- Checks: n/a (no code change)
- Next / handing off: Martin should already be allowed to sign in with Google using that exact email.
- ⚠ Don't-touch / warnings: None.

### 2026-06-06 — Claude Code — branch: (setup, no code)
- Did: stood up the two-agent system — rewrote `AGENTS.md` (the prior one was just the Next.js-rules stub) and created this log.
- Files touched: `AGENTS.md`, `AGENTS-LOG.md`
- Checks: n/a (docs only)
- Next: **Codex** — read `AGENTS.md` + this file, then reply to Agustin with a 5-line summary of the app + current state before writing any code.
- ⚠ Live product = the **Daily Brief news app** in this repo. The old "Google Ads → HubSpot Juno" brief is **dead — ignore it.** Recent globe / auto-refresh / translation work is already merged to `main`.

### 2026-07-17 — Claude Code — branch: main via /tmp worktree (broadsheet ship + 4 features)
- Did (all built on a clean worktree off origin/main — the dirty claude/news-ux-mobile tree was NOT pushed):
  - **Shipped the approved broadsheet makeover** (2f5be6b): `news-theme.css` copied wholesale, NEW `app/news/layout.tsx` (theme CSS import, .db-root, Newsreader/Spline Sans Mono fonts, Daily Brief metadata/appleWebApp, paper/near-black theme-color), and ONLY the cosmetic page.tsx edits re-applied onto main's page.tsx (db-masthead class, "The Daily Brief" masthead with db-the, db-dateline, all section-kicker emojis stripped, Today button de-emoji'd). Verified localhost signed-out + 390px + forced-dark before push. **The ~130-line mobile-WIP layer in the local dirty tree was deliberately NOT shipped** (still needs Agustin's call).
  - **Feature 1 — monitor push alerts** (4b7f75e): `public/news-sw.js` (push + notificationclick), `app/manifest.ts` (installable PWA — iOS Web Push prerequisite), `lib/news/push.ts` (daily cron re-checks alert-enabled monitors, ≤1 notification per monitor per run, 404/410 subs auto-pruned), `/api/news/push-sub` (VAPID key + per-device subs in prefs.layout.push, cap 5, no migration), `/api/news/monitor` PATCH (per-monitor alerts flag; `buildMonitor` preserves it), MonitorControls ⚑ toggle (permission from user gesture; install-first hint on iOS Safari). news cron maxDuration 60→120 (plan is Pro — VC routes already run 300). Tested: flag toggle, sub store, forced fresh-item detection → send → FCM 410 → prune, all against local dev + real Supabase; state restored after.
  - **Feature 2 — news→VC bridge** (ac621bd): "◆ map" on funding-section items (signed-in) → `POST /api/vc/enrich-request` (vcSessionEmail-gated; Haiku extracts company from headline; dedupes vs vc_companies/queue/requests; stores request in news_macro_cache row 8). enrich-cron candidates now: (r) requests first, (a) Form D, (b) companies Haiku-extracted from cached funding headlines — name-level dedupe across all; caps unchanged; writes stay staged. E2E test: Databricks deduped ("already on the map"), Fora queued → cap=1 cron run consumed it, enriched via EDGAR+web ($0.21, staged, now in review queue).
  - **Feature 3 — audio brief v1** (5c0ba5a): `ListenButton.tsx` (speechSynthesis, sentence-chunked for iOS, en/es voice). Today view builds a spoken script server-side (greeting + per-section brief + top story); inline ▶ on every section brief. Ungated, $0. v2 = server TTS mp3 in the cron — needs a TTS API key from Agustin.
  - **Feature 4 — offline** (a844260): news-sw.js now also caches — /news docs network-first w/ cached-edition fallback, statics/fonts stale-while-revalidate, NEVER /api/* or auth; `SwRegister.tsx` registers per visit; `OfflineRibbon.tsx` "offline · showing the HH:MM edition".
- Deps: **web-push + @types/web-push added** — run `npm install` after pulling. Env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT added to Vercel production AND ~/Downloads/juno/.env.local.
- Checks: tsc ✅ + build ✅ before every push; each feature localhost-tested (Puppeteer + curl) before deploy.
- Next / handing off: (1) Agustin: install PWA on iPhone (Share → Add to Home Screen), open a monitor, tap ⚑ to enable alerts — first real-device push arrives after the 13:00 UTC cron; (2) decide fate of the old mobile-WIP layer still uncommitted on claude/news-ux-mobile; (3) review queue has Fora + nightly proposals pending at vc.tryjunoapp.com/review.html; (4) audio v2 (real TTS) needs an ElevenLabs/OpenAI key.
- ⚠ Don't-touch / warnings: push alerts fire only from the SCHEDULED news cron (public refresh button never triggers AI/notifications). vercel.json now has 4 crons — plan is Pro; don't re-add the old "Hobby 2-cron" constraint. .env.local has the VAPID private key — never print/commit.

### 2026-07-17 (cont.) — Claude Code — branch: main via /tmp worktree (refresh consolidation + control polish)
- Did (Agustin's feedback round, localhost-approved before push):
  - **One general ↻** (c1a0194): NEW `POST /api/news/refresh-mine` — rebuilds every monitor (skips any refreshed <3 min ago so ↻ can't stack AI calls) and re-pulls every pinned topic via NEW `refreshTopic()` in lib/news/ai.ts (stored route, no classify call; AI brief only rewritten when >6h stale). RefreshButton now fires cron + refresh-mine together. **Per-monitor ↻ removed** from MonitorControls.
  - **Control style unification + collapse-all** (2031b7f): shared `.db-pill` class (defined next to `.db-ctl button` in LayoutEnhancer's injected CSS) applied to monitor ⚑/✕, topic ✕, video ✕, For You reset — every header control now matches the injected ✕/–/↔ pills. NEW `CollapseAll.tsx` (⊟ in header, grid view only) dispatches `db:collapse-all`; LayoutEnhancer minimizes/expands all cards + persists. For You's ↺ relabeled to a literal "reset" pill with a scarier confirm.
- Why the reset relabel: Agustin's For You section vanished — his click profile was wiped at 17:57 UTC via the ↺ (DELETE /api/news/profile), almost certainly mistaken for a refresh. No history kept; it re-learns from clicks. Root cause = icon ambiguity, now fixed.
- Checks: tsc ✅ build ✅; refresh flow verified E2E on localhost (monitor rebuilt by general ↻, 3-min throttle confirmed, collapse-all 11→0→11).
- ⚠ Don't-touch: MonitorControls deliberately has NO refresh — don't re-add per-section refresh buttons anywhere; the general ↻ is the only refresh surface.

### 2026-07-17 (cont. 2) — Claude Code — branch: main via /tmp worktree (topic quality + brief toggle + SW dev fix)
- Did (localhost-approved before push):
  - **Topic search quality** (d5fe63b): his "energy drink regulation" topic was full of oil-and-gas noise — Google News matches loosely and topic results were NEVER relevance-checked (only sections had curation). NEW `filterRelevant()` (strict Haiku gate, fail-open) runs on every search pass; `classifyTopic` now emits anchored queries for niche topics (quoted entity + OR-synonyms, no site pins for regulatory niches); NEW `gatherTopicItems()` escalates 4d → 14d → 30d when passes come back thin (shared by buildTopic + refreshTopic); setup-chat prompt no longer says "broad" — keeps the user's niche wording. Verified: 14/14 on-topic items for energy drink regulation.
  - **Collapsible topic brief** (1cf2432): details/summary "▸ Brief" row, collapsed by default so headlines lead; LayoutEnhancer re-packs masonry on summary toggle; CSS in news-theme.css.
  - **SW dev-staleness fix** (f71efee): the offline SW's stale-while-revalidate was serving OUTDATED dev chunks on localhost (dev chunks aren't content-hashed) — bit us mid-session (tests ran old LayoutEnhancer code). SW now no-ops its fetch handler on localhost; prod unchanged.
- Checks: tsc ✅ build ✅ per commit; toggle + masonry re-pack verified E2E (span 37→59→37).
- ⚠ Gotcha for future dev sessions: if localhost behaves stale, check for a registered service worker + db-offline cache from BEFORE f71efee — unregister + clear caches once.

### 2026-07-17 (cont. 3) — Claude Code — VC: pitchbook Phase 1+2 SHIPPED (559a906, ab2e202 + vcbrain deploys)
- Phase 1 (all live): brand→legal resolver (/api/vc/resolve + alias-aware /search, aliases in vc_ingest_meta), create_company agent tool (EDGAR preferred but never a gate — web-sourced bubbles, slug 'web-…'), /api/vc/company-news (news-engine reuse), profile drawer (key figures + provenance glyphs ✓▤↗! + funding-history .fhist table + news + ask-chat), chat = full-height bottom-composer, __vcIngest (show-on-map without reload), validated sector palette (Defense #D98E4A, AI #C77DFF), versioned static script URLs (cache staleness fix). Plan: juno_project/Notes/vc-pitchbook-plan.md.
- Phase 2 (shipped, awaiting migration): migration 012 (vc_companies firmographics columns — Agustin pastes in Supabase SQL editor), save_company_profile tool (chat live / cron staged kind 'profile' / applyQueued), enrich+chat prompts capture firmographics, /graph returns the fields w/ pre-migration fallback, scripts/vc-profile-backfill.mjs --cap N (~$0.1/company, cost-logged).
- ⚠ .fhist not .rtable (that's the boardroom oval). lukebpadden31@gmail.com confirmed in ALLOWED_EMAILS.

### 2026-07-17 (cont. 4) — Claude Code — VC Phase 3 SHIPPED (edbb7b7 + vcbrain deploy): multi-user separation
- Migration 013 APPLIED (conversations.user_email backfilled to Agustin; vc_user_state; vc_memos ready for the memo cache). chatIdentity(): session email or chat-key→Agustin. Conversations list/read/delete/resume ownership-checked. /api/vc/state = per-user watchlist + saved queries. edgar-sync diffs fresh filings vs watchlists (CIK→norm-name) → push via news device subs (sendWebPush export), one per watched company; news-sw notificationclick now host-matched so VC alerts open vc.tryjunoapp.com. Frontend: ☆ Watch on profiles, ★ Watchlist scope in Query, 💾 saved-query chips.
- E2E verified: state CRUD, 25 old conversations owned by Agustin + dev identity sees 0, synthetic-filing diff matched watched Ramp by CIK, watchlist/chips UI. ⚠ Push devices currently 0 (subs pruned in testing) — Agustin must tap ⚑ once on a device to re-subscribe; that one subscription feeds BOTH news monitors and VC filing alerts.
- Remaining Phase 3 item: memo cache (vc_memos table exists; needs route + Brief-me wiring). Then Phase 4 = 2026q2 bulk gap.
- Addendum (3f26adf): manual PitchBook input flow validated on Rain — ⚠ the map's "Rain Financial, Inc." (cik-0001733504, 2020-22 filings ≈ the Bahrain exchange) is NOT rain.xyz; rain.xyz legally = "Signify Holdings, Inc." (site footer), cik-0002068113, its $250M Form D (2026-02-03) matches PB's Series C. New bubble "Rain (Signify Holdings)" carries the PB stats ($338.36M ✓, Series C, post $1.95B in note, 149 emp) + fixed brand aliases; investor enrichment staged to review. company-news now site/desc-anchored + filterRelevant-gated (the "Rain = weather" problem).

### 2026-07-20 — Claude Code — VC: memo cache + q2 watcher SHIPPED (cb46ee8 + vcbrain deploy) — pitchbook plan COMPLETE through Phase 3
- /api/vc/memo: cached analyst memos (vc_memos) — POST = sonnet-5 grounded in graph facts + ≤4 web searches (~$0.2-0.3, ~1 min), GET instant. Profile "Analyst memo" section w/ generate/refresh; chat.js exposes window.__vcMd. Validated on Rain/Signify (5.5K chars, 10 sources).
- edgar-sync now HEADs the SEC 2026q2 bulk daily; when live → one-shot flag + push to Agustin + log line. (Checked today: still 404.)
- Note: earlier "cron dead" scare was a bad query (vc_sync_log orders by run_at, NOT id/created_at — ids are uuids, random order). Crons healthy; enrich loop ingesting daily.
- Remaining = user actions (review queue ~134, backfill $45 call, ⚑ re-subscribe) + parking lot (free signals, run-log, tour, copy-as-table) + q2 gap when SEC posts.

### 2026-09-08 — Claude Code — branch: claude/pen-recorder
- **Claiming:** `lib/pen/*`, `app/pen/*`, `app/api/pen/*`. Nothing else is mine except one line of `app/globals.css` (below).
- Did (new surface: **Pen** → AI notes for a realtor, intended for `pen.tryjunoapp.com`, plan in `juno_project/Notes/pen-recorder-realtor-plan.md`):
  - **Architecture forced by a platform limit:** Vercel caps function request bodies at 4.5MB and an hour of pen audio is ~115MB, so audio NEVER passes through an API route. The browser gets a signed Supabase Storage upload URL, PUTs the file directly, and the server only ever handles the object path. AssemblyAI then fetches it from a short-lived signed read URL.
  - `lib/pen/schema.sql` — `pen_sessions` + `pen_clients`. Dedupe index on (user_email, source_name, bytes) so replugging the pen doesn't duplicate a recording. **Needs running in the Supabase SQL editor, plus a private bucket named `pen-audio`.**
  - `lib/pen/store.ts` — signed upload/read URLs, session CRUD, client-profile upsert.
  - `lib/pen/aai.ts` — AssemblyAI submit/fetch with `speaker_labels: true`. Diarization is non-negotiable: he records couples and "the wife loved the kitchen, the husband balked at the price" IS the product.
  - `lib/pen/extract.ts` — the realtor extraction (reactions room-by-room, objections, buying signals, revealed criteria, follow-ups) + a rolling per-buyer profile. Uses `claude-opus-5` with `messages.parse()` + `jsonSchemaOutputFormat` from `@anthropic-ai/sdk/helpers/json-schema` — **no new dependency** (`zod` is not installed; the json-schema helper needs nothing extra). ~$0.09/showing, so ~$2/mo at 20 showings.
  - `lib/pen/encode.ts` — browser audio prep. **Deviation to flag:** Agustin picked "compress to Opus", but real Opus output needs WebCodecs `AudioEncoder` PLUS a hand-written Ogg/WebM muxer (AudioEncoder emits bare packets, AssemblyAI needs a container). That is untestable without the pen, so v1 decodes → mono → 16 kHz → 16-bit WAV (5-6× on stereo 44.1k, zero speech-quality cost) and passes already-compressed files (mp3/m4a/opus) straight through. Revisit only if real pen files are still too big.
  - Routes: `upload-url`, `sessions` (GET/POST), `sessions/[id]` (GET/PATCH), `transcribe` (POST submit, GET poll), `webhook` (AssemblyAI callback, secret in query string), `notes` (runs extraction). Transcription and extraction are separate calls so neither risks the 60s function ceiling. **Note:** `RouteContext<'/api/pen/...'>` does not typecheck for a brand-new route (it reads generated route types that don't exist pre-build) — used the explicit `{ params: Promise<{id:string}> }` form.
  - `app/pen/*` — Granola-register UI: light scoped theme (`pen-theme.css`, so the dark root theme doesn't bleed), Connect-pen via `showDirectoryPicker` with drag-drop fallback, import tray with per-file selection + upload progress (XHR, since fetch gives no upload progress), sidebar grouped by day with status pills, detail pane with **his own notes first** (debounced autosave) then the extraction, plus a diarized transcript tab.
  - **Consent gate is enforced server-side and refuses, not defaults.** Fla. Stat. § 934.03 is all-party consent and a third-degree felony, and he is a licensed agent, so the downside is his licence.
- **`app/globals.css` — one added line, unrelated to Pen but it was blocking the whole dev server:** `@source not "../public";`. Tailwind v4 auto-scans `public/`, and the 57 AI-Stack static-export HTML files there contain Next.js hydration-payload fragments that Tailwind reads as arbitrary-value utilities, generating invalid CSS (`Parsing CSS source code failed`, globals.css:1085). `npm run build` passed; only Turbopack dev broke.
- Checks: `npx tsc --noEmit` ✅ · `npm run build` ✅ (`/pen` + all 6 pen routes registered). Runtime-verified in a real browser: page renders, both guard banners correct, import tray works from a synthetic 44.1k stereo WAV, `prepareAudio` runs and reaches `/api/pen/upload-url`, **consent gate held when clicked without ticking**, zero hydration/CSS errors after fixing an SSR feature-detect mismatch on `showDirectoryPicker`.
- **Blocked on Agustin (cannot be done from here):** (1) run `lib/pen/schema.sql` + create the private `pen-audio` bucket — until then `/pen` shows a red banner saying exactly that; (2) add `ASSEMBLYAI_API_KEY` (free tier is enough), `PEN_WEBHOOK_SECRET` (any random string), and optionally `PEN_PUBLIC_URL` to `.env.local` and Vercel; (3) add the realtor friend's Google address to `ALLOWED_EMAILS` in `lib/auth.ts`; (4) point `pen.tryjunoapp.com` at `/pen` in Vercel (the session cookie is already shared across `.tryjunoapp.com`).
- Next: the plan's BLOCKING step is unchanged and no code substitutes for it — **get one real showing recorded and read the diarized transcript before building anything more.** Granola now does the generic half free on mobile ($1.5B, Series C Mar 2026), so the only defensible part of this is the realtor extraction and the compounding per-buyer profile.
- ⚠ Don't-touch: `.env.local`. NOT pushed, NOT deployed. Branch created off `claude/ai-stack-companies` with 43 files already dirty in the tree — **I committed only pen files + globals.css by explicit path**; everything else is still uncommitted and untouched.
