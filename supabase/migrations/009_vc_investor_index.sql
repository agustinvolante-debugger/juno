-- 009_vc_investor_index.sql
-- Group 3: investor index from Form D related persons, entity classification,
-- and the funding truth layer (verified-raise overrides).

-- (a) persons aggregated across all Form D filings
create table if not exists vc_formd_persons (
  person_key text primary key,       -- normalized full name
  name text not null,
  filing_count int default 0,
  issuer_count int default 0,
  roles text[],                      -- distinct relationship kinds seen
  first_seen date,
  last_seen date,
  linkedin text,                     -- nullable socials, enrich later
  x text,
  profile_url text,
  updated_at timestamptz not null default now()
);

-- person ↔ issuer junction (which boards/companies a person appears on)
create table if not exists vc_formd_person_issuers (
  person_key text not null,
  cik text not null,
  issuer_name text,
  roles text[],
  first_date date,
  last_date date,
  filing_count int default 0,
  primary key (person_key, cik)
);

create index if not exists idx_formd_persons_name_trgm on vc_formd_persons using gin (name gin_trgm_ops);
create index if not exists idx_formd_persons_filings   on vc_formd_persons (filing_count desc);
create index if not exists idx_formd_pi_cik            on vc_formd_person_issuers (cik);

-- (b) entity classification on the issuer universe
alter table vc_formd_issuers add column if not exists entity_type text;      -- operating_company | vc_firm
alter table vc_formd_issuers add column if not exists type_confidence text;  -- high | low
create index if not exists idx_formd_entity_type on vc_formd_issuers (entity_type);

-- (c) funding truth layer: verified raises override Form D undercounts
create table if not exists vc_funding_overrides (
  company_slug text primary key,     -- curated graph slug
  cik text,
  verified_total_raised numeric,
  last_round text,
  source_url text,
  note text,
  updated_at timestamptz not null default now()
);

alter table vc_formd_persons        enable row level security;
alter table vc_formd_person_issuers enable row level security;
alter table vc_funding_overrides    enable row level security;
create policy "public read vc_formd_persons"        on vc_formd_persons        for select using (true);
create policy "public read vc_formd_person_issuers" on vc_formd_person_issuers for select using (true);
create policy "public read vc_funding_overrides"    on vc_funding_overrides    for select using (true);

notify pgrst, 'reload schema';
