-- Run this in your Supabase SQL editor to set up the schema

-- OAuth tokens for Google Ads and HubSpot per user
create table oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null check (provider in ('google_ads', 'hubspot')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  extra jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, provider)
);

-- Keywords pulled from Google Ads
create table keywords (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  keyword text not null,
  campaign text not null,
  ad_group text not null,
  spend_monthly numeric(10,2) default 0,
  impressions integer default 0,
  clicks integer default 0,
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, keyword, campaign, ad_group)
);

-- Contacts pulled from HubSpot with UTM data
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  hubspot_id text not null,
  email text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  first_page_seen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, hubspot_id)
);

-- Deals pulled from HubSpot
create table deals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  hubspot_deal_id text not null,
  contact_id uuid references contacts(id),
  deal_name text,
  stage text,
  amount numeric(12,2),
  close_date date,
  is_closed_won boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, hubspot_deal_id)
);

-- Attribution: keyword → contact → deal join results
create table attributions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  keyword text not null,
  campaign text not null,
  deal_id uuid references deals(id),
  deal_amount numeric(12,2),
  spend_at_attribution numeric(10,2),
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table oauth_tokens enable row level security;
alter table keywords enable row level security;
alter table contacts enable row level security;
alter table deals enable row level security;
alter table attributions enable row level security;

-- RLS policies: users only see their own data
create policy "own data only" on oauth_tokens for all using (user_id = auth.uid()::text);
create policy "own data only" on keywords for all using (user_id = auth.uid()::text);
create policy "own data only" on contacts for all using (user_id = auth.uid()::text);
create policy "own data only" on deals for all using (user_id = auth.uid()::text);
create policy "own data only" on attributions for all using (user_id = auth.uid()::text);
