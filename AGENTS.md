<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — shared brief for Claude Code + Codex

> Two AI engineers work in this repo (Claude Code + Codex). **This file + `AGENTS-LOG.md` are the shared source of truth — read both before any work.** We can't talk live; we coordinate through these files and through Agustin (he's the router).

## Who
**Agustin Volante (Chaska)** — non-technical founder who ships with AI agents. Ex-IB at Jefferies (M&A / financings), IU Kelley '24, Chilean, based in SF. Currently job-searching (FDE / Chief-of-Staff at early-stage AI companies) while running this app as his daily driver.

## What this repo is
`~/Downloads/juno` — the production **Next.js 16** app. The live product is **"Daily Brief"**, a personal news reader + a **"World Explorer"** 3D globe, deployed at **news.tryjunoapp.com** (also `tryjunoapp.com/news`).
- ⚠️ Ignore any "Juno = Google Ads → HubSpot CAC tool" description in old `CLAUDE.md`/docs — **that product is dead/historical.** This repo is the news app.

## Stack & key code
Next.js 16 · React 19 · NextAuth v4 (Google) · Supabase (Postgres) · Anthropic SDK (Haiku 4.5 for AI features) · Vercel.
- `lib/news/*` — `feeds.ts` (RSS/search engine), `ai.ts` (Anthropic), `store.ts` (Supabase), `places.ts` + `geo.ts` (the globe), `schema.sql`.
- `app/news/*` — the UI (`page.tsx` + components incl. `globe/`).
- Recent work (live on `main`): World Explorer globe (`/news/globe`), day/night terminator, per-place + main-feed auto-refresh, EN/ES title translation.

## Run / deploy
- **Dev:** `NEWS_DEV_EMAIL=agustinvolantesilva@gmail.com npm run dev` → `localhost:3000/news`.
- **Checks:** `npx tsc --noEmit` and `npm run build` must both pass.
- **Deploy:** push branch `news-reader` → `main` → Vercel auto-deploys. **Only when Agustin explicitly says.** (Hobby plan: cron max 1/day — don't add hourly crons.)

## COLLABORATION PROTOCOL — both agents follow exactly
1. **Read `AGENTS.md` + `AGENTS-LOG.md` first.** Append a `AGENTS-LOG.md` entry when you finish a session.
2. **Never commit to `main` directly.** Work on a branch; pull/rebase latest before starting.
3. **One agent per file-area at a time.** Claim your area in `AGENTS-LOG.md` before editing so we never edit the same files simultaneously.
4. **Checks before EVERY commit:** `npx tsc --noEmit` green; `npm run build` green for anything shipping. Never commit a red build.
5. **Dependencies:** respect `package-lock.json`. If you add/change a dep → `npm install`, commit the lockfile, and note it in `AGENTS-LOG.md` so the other agent reinstalls. Don't bump Next/React majors without Agustin.
6. **Secrets:** `.env.local` holds REAL Supabase / Anthropic / Google-OAuth keys. **NEVER print, commit, or send them anywhere.** Keep them gitignored.
7. **Stop and ask Agustin before:** deploying, pushing to `main`, deleting files, sending anything external, or spending money.
8. Small, focused commits with clear messages. Agustin reviews + merges.
9. **Missing context? Ask Agustin — don't guess.**
