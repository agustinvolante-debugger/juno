# News reader — build plan (branch: news-reader)

Porting the proven local Python prototype (`~/Downloads/juno_project/news/`) into the Juno app.
Lives at **news.tryjunoapp.com**, gated by Juno's existing NextAuth Google login + ALLOWED_EMAILS.

## Done
- [x] Branch `news-reader`, dirs `lib/news`, `app/news`, `app/api/news`.
- [x] `lib/news/schema.sql` — Supabase tables (news_topics, news_prefs, news_profile, news_feed_cache, news_macro_cache, news_translations).
- [x] `lib/news/feeds.ts` — ported core: SECTIONS/SOURCES, RSS/Atom parse, `collectSections()`, `searchTopic()` (source routing + recency), `getMacro()`. Typechecks clean.

## STATUS — M1 DONE (Jun 4)
Public news tier works locally (dev: http://localhost:3000/news):
- [x] `lib/news/feeds.ts` — engine + curated sources (his top-10s) + 30 YT channels; shorts filter + YT-aware dedupe + interleave. Typechecks.
- [x] `lib/news/store.ts` — Supabase helpers (feed/macro cache + per-user topics/prefs/profile + translations).
- [x] `app/api/news/cron/route.ts` — refreshes feed+macro cache; Vercel-cron via CRON_SECRET, public manual refresh throttled 5min. Verified: 78/80 feeds live.
- [x] `vercel.json` — hourly cron `0 * * * *` (NOTE: Vercel Hobby allows only daily crons; on Pro this runs hourly — confirm plan, else rely on the refresh button + daily).
- [x] `app/news/page.tsx` + `RefreshButton.tsx` — server component renders cached sections + macro + refresh + sign-in button. Public, no AI.

To actually deploy news.tryjunoapp.com (Agustin actions, I'll guide): commit branch → deploy to Vercel `juno` project → add domain `news.tryjunoapp.com` (Vercel) + Cloudflare CNAME → set `CRON_SECRET` env → add Google redirect URI `https://news.tryjunoapp.com/api/auth/callback/google`.

## STATUS — M2 DONE (Jun 4): AI behind login
- [x] `lib/news/ai.ts` — Anthropic (Haiku 4.5): classifyTopic, brief, buildTopic (graded fallback), setupChat, classifyChannels, translateTitles.
- [x] `lib/news/auth.ts` — authedEmail() (NextAuth session; allowlist already enforced by lib/auth signIn callback).
- [x] Gated routes: `/api/news/topic` (POST create, DELETE), `/api/news/setup` (POST propose), `/api/news/section-brief` (POST on-demand). All 401 without session — verified.
- [x] `app/news/{AIBar,SectionBrief,RemoveTopic}.tsx` — signed-out shows "Sign in for full access"; signed-in gets Brief-me box + per-section on-demand brief + topic remove. Verified signed-out + 401 gating.

Rolled to M3: setup-chat UI (✓/✗ propose), video-section builder + `news_videos` table, EN/ES toggle + translation route, server-side For-You (`/api/news/profile`), masonry/drag/minimize/edit-title/add-source, today feed.

## M3 — IN PROGRESS (Jun 4)
- [x] Dev-only login bypass in lib/news/auth.ts (NEWS_DEV_EMAIL, NODE_ENV!=='production') — lets signed-in UI be built/tested without OAuth.
- [x] SetupChat.tsx — ✓/✗ propose flow (POST /api/news/setup → keep posts /api/news/topic). Wired into page (authed only).
- [x] BUGFIX: news_topics had no brief_at column → upsert silently failed + select errored → topics never rendered. Now brief_at stored inside `route` jsonb (no SQL change). Added error logging in store.ts. Verified create→persist→render→delete.
- [x] Video-section builder — feeds.ts resolveChannel/channelItems, ai.ts buildVideoSection, store getUserVideos/setUserVideos (news_prefs.layout.videos), /api/news/video-section, VideoBox + RemoveVideo. Verified (built "Science Explainers").
- [x] EN/ES toggle + translation — /api/news/prefs (per-user lang in news_prefs), LangToggle, ES labels, cached headline translation (news_translations) for non-native sections. Verified.
- [x] Server-side For-You — /api/news/profile (POST click events → news_profile), ClickTracker.tsx, server-ranked "For You" card. Verified.
- [x] "What happened today" — server-rendered unified recent (48h) feed via ?view=today + header toggle. Verified.
- [x] Masonry/Tetris + drag-reorder + minimize + resize — LayoutEnhancer.tsx (DOM enhancer over server cards; grid-row-span masonry, drag, mini, wide; persists to news_prefs.layout.grid). Compile-verified; drag/minimize gestures are browser-only (confirm live).
- [ ] (minor polish remaining) edit-title + add-source-to-section.

ALL THREE MILESTONES FUNCTIONALLY COMPLETE. Runs locally against real Supabase+Anthropic. Remaining = deploy (Agustin's Vercel/Cloudflare/Google steps below) + minor edit-title/add-source polish.

## To build (remaining M3 detail)
1. **lib/news/ai.ts** — Anthropic (reuse `@anthropic-ai/sdk`): `classifyTopic(q)` (sources+locale routing), `brief(q, items, lang)`, `translateTitles(titles)`. Model: claude-haiku-4-5.
2. **lib/news/store.ts** — Supabase (`supabaseAdmin`) helpers: get/set user topics, prefs, profile; get/set feed + macro + translation caches.
3. **app/api/news/cron/route.ts** — refresh feed cache + macro (called by Vercel Cron). Add `vercel.json` cron `*/30 * * * *`. Protect with CRON_SECRET.
4. **app/api/news/topic/route.ts** — POST {query}: classifyTopic → searchTopic (graded fallback) → brief → upsert news_topics for session user. DELETE: remove topic.
5. **app/api/news/setup/route.ts** — POST {messages}: setup-chat assistant → pins ≤3 topics.
6. **app/api/news/profile/route.ts** — POST click events → update news_profile (server-side For You, cross-device).
7. **app/api/news/today/route.ts** — return unified recent (48h) ranked feed for the user (cache + topics + profile).
8. **app/news/page.tsx** — server component: `getServerSession`; if no session → redirect to /auth/signin. Reads caches + user topics/prefs. Renders <NewsClient>.
9. **app/news/NewsClient.tsx** — client UI ported from prototype: sections grid, topic box, setup chat, EN/ES toggle, "What happened today", drag/resize layout, Read-more, For You. Tailwind v4 (minimal monochrome).
10. **Auth/session typing**: session.user.email is the user key (matches lib/auth.ts allowlist).

## DEPLOY — news.tryjunoapp.com (code DONE Jun 4, production build ✓)
Code wired for the subdomain (no new Google OAuth redirect URI needed — auth routes through main domain):
- `proxy.ts` — rewrites `news.*` root → `/news` (main domain untouched; only matches `/`).
- `lib/auth.ts` — session cookie domain `.tryjunoapp.com` (prod only) + redirect callback allowing `*.tryjunoapp.com`. Sign-in routes through main domain, cookie shared → authed on subdomain.
- `app/news/page.tsx` — signInHref carries callbackUrl back to the current host (returns you to the subdomain after login).

AGUSTIN'S DEPLOY STEPS:
1. Review diff (only adds lib/news/*, app/news/*, app/api/news/*, proxy.ts, vercel.json; edits lib/auth.ts [+5 emails, cookie/redirect]) → merge/push `news-reader` → Juno redeploys.
2. Vercel → juno project → Settings → Domains → add `news.tryjunoapp.com` (Vercel shows the DNS target).
3. Cloudflare → tryjunoapp.com DNS → add CNAME `news` → `cname.vercel-dns.com` (follow Vercel's verification; if proxied, use Full SSL).
4. Vercel env: add `CRON_SECRET` (any random string); confirm `ANTHROPIC_API_KEY` is set in Vercel; KEEP `NEXTAUTH_URL=https://tryjunoapp.com` (do NOT change to the subdomain).
5. No Google Cloud change needed.
Caveat: cookie-domain change → existing Juno sessions keep working (host-only cookie still valid); new logins get the shared `.tryjunoapp.com` cookie. Minimal disruption.

## Access tiering (decided Jun 4)
- **Anonymous (no login):** feeds + video/podcast sections + "What happened today" + refresh + language UI. NO AI. (Vercel Cron refreshes server-side for everyone.) This protects the Anthropic key from bots/randoms crawling the public subdomain.
- **Signed in (ALLOWED_EMAILS only):** unlocks AI — briefings, setup chat, smart source-routing, ES headline translation, and server-side For-You personalization (cross-device). Gate every `/api/news/*` AI route on `getServerSession`.

## Auth UX (decided Jun 4)
- **Sign-in button:** top-right "Sign in with Google" (reuse Juno NextAuth). No button exists in the local prototype (single-user/password).
- **Signed-out state:** the 3 AI input boxes (Brief me / Set up / Add video) do NOT render a password field — show a "Sign in for full access" prompt/CTA instead. News + video + refresh remain fully usable signed-out (free, $0, no AI).
- Local prototype keeps the password field since it has no session concept.

## Layout (ported from local)
- Masonry/Tetris packing via grid-row-span JS (grid-auto-rows:8px; each card spans its measured height). Re-pack on drag/resize/minimize/resize-window/For-You-fill.
- Per-card: drag-reorder, ↔ resize-to-wide, **– minimize** (collapse to top 3 titles, no subtitle), ✕ close. Persisted in localStorage (per-device locally; move to news_prefs server-side per user in the port).
- Topic + video sections live IN the grid (draggable), not a separate strip.

## Shorts filter
Heuristic only (no YouTube API): drop items whose title has #shorts/#short or link has /shorts/. For reliable filtering add a YouTube Data API key (free) and filter by contentDetails.duration.

## External setup (Agustin)
- [ ] Add **second Carlos's Gmail** + confirm cvolantesilva to `ALLOWED_EMAILS` in `lib/auth.ts`.
- [ ] Run `lib/news/schema.sql` in Supabase (SQL editor) — or via a one-off service-role script.
- [ ] Vercel: add domain **news.tryjunoapp.com** to the `juno` project (or a rewrite). Set NEXTAUTH_URL handling for the subdomain (cookie domain `.tryjunoapp.com`).
- [ ] Google Cloud OAuth client: add redirect URI `https://news.tryjunoapp.com/api/auth/callback/google`.
- [ ] Cloudflare: CNAME `news` → Vercel (cname.vercel-dns.com) per Vercel's domain instructions.
- [ ] Add `CRON_SECRET` env on Vercel.

## Notes
- Personalization moves server-side (news_profile) so it follows each account across devices.
- Translations cached shared (link→es); Chile section not translated.
- Keep the live Juno site untouched — everything is under /news + /api/news + lib/news.
