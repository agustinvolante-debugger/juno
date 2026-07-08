-- 008_vc_formd_universe.sql
-- Full SEC Form D universe (deduped per issuer/CIK) for Query criteria search.
-- Separate from the curated vc_* graph; public-read; writes via service role.

create extension if not exists pg_trgm;  -- fast name ILIKE search

create table if not exists vc_formd_issuers (
  cik text primary key,
  name text not null,
  norm_name text,
  industry_group text,          -- Form D SEC taxonomy
  state text,
  country text,
  first_filing_date date,
  last_filing_date date,
  last_offering_amount numeric, -- most recent filing's total offering
  total_offering_amount numeric,-- summed across filings
  filing_count int default 0,
  revenue_range text,
  updated_at timestamptz not null default now()
);

create table if not exists vc_ingest_meta (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_formd_name_trgm on vc_formd_issuers using gin (name gin_trgm_ops);
create index if not exists idx_formd_industry  on vc_formd_issuers (industry_group);
create index if not exists idx_formd_state     on vc_formd_issuers (state);
create index if not exists idx_formd_lastamt   on vc_formd_issuers (last_offering_amount desc nulls last);
create index if not exists idx_formd_lastdate  on vc_formd_issuers (last_filing_date desc);

alter table vc_formd_issuers enable row level security;
alter table vc_ingest_meta   enable row level security;
create policy "public read vc_formd_issuers" on vc_formd_issuers for select using (true);
create policy "public read vc_ingest_meta"   on vc_ingest_meta   for select using (true);

notify pgrst, 'reload schema';
