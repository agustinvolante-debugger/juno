-- 007_vc_constellation.sql
-- VC Constellation: board-seat-first graph backend.
-- These tables are PUBLIC-READ (not user-scoped) unlike the rest of the app.
-- All ingestion writes go through the service-role client (bypasses RLS).

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Firms (VC funds, corporates, angels, PE)
create table if not exists vc_firms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kind text not null default 'vc',            -- vc | corp | angel | pe
  website text,
  created_at timestamptz not null default now()
);

-- Raw Form D filing references (dedupe key = accession)
create table if not exists vc_filings (
  id uuid primary key default gen_random_uuid(),
  accession text unique not null,
  form_type text not null default 'D',        -- D | D/A
  cik text,
  issuer_name text,
  filing_date date,
  offering_amount numeric,
  industry_group text,
  url text,
  processed_at timestamptz not null default now()
);

-- Companies (startups / Form D issuers)
create table if not exists vc_companies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  cik text unique,
  sector text,
  location text,
  total_raised text,
  last_round text,
  last_round_amount numeric,
  last_round_date date,
  created_at timestamptz not null default now()
);

-- People (partners, founders, independents)
create table if not exists vc_people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  norm_name text not null,                    -- match/dedupe key
  firm_id uuid references vc_firms(id),
  title text,
  bio text,
  profile_url text,
  linkedin text,
  x_url text,
  kind text not null default 'partner',       -- partner | founder | independent
  created_at timestamptz not null default now(),
  unique (norm_name, firm_id)
);

-- Investments (firm -> company)
create table if not exists vc_investments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references vc_firms(id),
  company_id uuid not null references vc_companies(id),
  partner_id uuid references vc_people(id),
  round text,
  amount_text text,
  amount_num numeric,
  date text,                                  -- YYYY-MM (source granularity)
  lead boolean not null default false,
  confidence text default 'medium',
  source_text text,
  source_url text,
  filing_id uuid references vc_filings(id),
  created_at timestamptz not null default now(),
  unique (firm_id, company_id, round, date)
);

-- Board seats (person <-> company). person_name denormalized (person may be unresolved).
create table if not exists vc_board_seats (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references vc_people(id),
  company_id uuid not null references vc_companies(id),
  firm_id uuid references vc_firms(id),
  person_name text not null,
  role text default 'Board Member',
  as_of date,
  confidence text default 'medium',
  source_kind text not null default 'news',   -- formd | news | manual
  source_text text,
  source_url text,
  filing_id uuid references vc_filings(id),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (person_name, company_id, firm_id)
);

-- Info requests (search misses)
create table if not exists vc_info_requests (
  id uuid primary key default gen_random_uuid(),
  company_query text not null,
  note text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ingestion run log
create table if not exists vc_sync_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  source text not null,                        -- backfill | daily | ondemand
  filings_processed int default 0,
  new_companies int default 0,
  new_people int default 0,
  new_board_seats int default 0,
  notes text
);

-- Indexes
create index if not exists idx_vc_people_norm     on vc_people (norm_name);
create index if not exists idx_vc_people_firm     on vc_people (firm_id);
create index if not exists idx_vc_companies_cik   on vc_companies (cik);
create index if not exists idx_vc_companies_sector on vc_companies (sector);
create index if not exists idx_vc_companies_lastamt on vc_companies (last_round_amount desc nulls last);
create index if not exists idx_vc_board_company   on vc_board_seats (company_id);
create index if not exists idx_vc_board_person    on vc_board_seats (person_id);
create index if not exists idx_vc_board_firm      on vc_board_seats (firm_id);
create index if not exists idx_vc_inv_company     on vc_investments (company_id);
create index if not exists idx_vc_inv_firm        on vc_investments (firm_id);
create index if not exists idx_vc_filings_cik     on vc_filings (cik);

-- RLS: public read on graph tables; anon insert on info_requests. Writes via service role (bypasses RLS).
alter table vc_firms         enable row level security;
alter table vc_people        enable row level security;
alter table vc_companies     enable row level security;
alter table vc_investments   enable row level security;
alter table vc_board_seats   enable row level security;
alter table vc_filings       enable row level security;
alter table vc_info_requests enable row level security;
alter table vc_sync_log      enable row level security;

create policy "public read vc_firms"        on vc_firms        for select using (true);
create policy "public read vc_people"       on vc_people       for select using (true);
create policy "public read vc_companies"    on vc_companies    for select using (true);
create policy "public read vc_investments"  on vc_investments  for select using (true);
create policy "public read vc_board_seats"  on vc_board_seats  for select using (true);
create policy "public read vc_filings"      on vc_filings      for select using (true);
create policy "anon insert vc_info_requests" on vc_info_requests for insert with check (true);
