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
