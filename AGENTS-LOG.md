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
