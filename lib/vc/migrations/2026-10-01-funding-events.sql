-- 2026-10-01 · vc_funding_events — funding rounds REPORTED BY PRESS (Daily Brief → VC Constellation)
-- Written by lib/vc/news-funding.ts (service role). Never SEC-verified: the UI labels every row
-- "Reported by press" and never lets it overwrite Form D figures or vc_funding_overrides.
-- One row per round (dedupe across outlets); status='hidden' is the undo.
-- Paste into the Supabase SQL editor. Safe to re-run.

create extension if not exists pgcrypto;  -- gen_random_uuid()

create table if not exists vc_funding_events (
  id              uuid primary key default gen_random_uuid(),
  company_slug    text,                          -- vc_companies.slug (null only if unmatched)
  cik             text,                          -- copied from the matched company when known
  company_name    text not null,
  round           text,                          -- 'Series B', 'Seed', 'Growth', 'IPO', 'Acquisition', …
  amount_usd      numeric,
  valuation_usd   numeric,
  investors       jsonb not null default '[]'::jsonb,  -- [{name, lead, firm_slug|null}]
  announced_on    date,
  source_url      text not null,
  source_name     text,
  source_tier     int,                           -- 1 = Bloomberg/Reuters/FT/WSJ/The Information … 3 = niche trade
  headline        text,
  other_sources   jsonb not null default '[]'::jsonb,  -- [{name, url, tier, headline}]
  confidence      numeric,
  status          text not null default 'reported' check (status in ('reported', 'hidden')),
  dedupe_key      text unique not null,
  created_company boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists vc_funding_events_company_idx   on vc_funding_events (company_slug, announced_on desc);
create index if not exists vc_funding_events_announced_idx on vc_funding_events (announced_on desc);
create index if not exists vc_funding_events_status_idx    on vc_funding_events (status);

-- Public-read like the rest of the VC graph tables (the API reads with the service role anyway);
-- writes are service-role only (no insert/update policies).
alter table vc_funding_events enable row level security;
drop policy if exists "public read vc_funding_events" on vc_funding_events;
create policy "public read vc_funding_events" on vc_funding_events for select using (status = 'reported');

notify pgrst, 'reload schema';
