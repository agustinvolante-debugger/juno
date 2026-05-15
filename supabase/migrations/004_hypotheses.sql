-- Hypothesis experiments for The Lab (Planner Mode)
create table hypotheses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  if_action text not null,
  then_metric text not null check (then_metric in ('cac', 'deal_volume', 'pipeline_leads', 'spend_efficiency')),
  then_direction text not null check (then_direction in ('decrease', 'increase')),
  target_pct numeric(5,1) not null,
  because_reason text not null,
  window_days integer not null check (window_days in (7, 30, 90, 180)),
  start_date date not null default current_date,
  end_date date generated always as (start_date + window_days) stored,
  status text not null default 'active' check (status in ('active', 'completed', 'dismissed')),
  baseline_spend numeric(10,2),
  baseline_deals integer,
  baseline_pipeline_leads integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Weekly snapshots of hypothesis progress
create table hypothesis_snapshots (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid references hypotheses(id) on delete cascade,
  user_id text not null,
  snapshot_date date not null default current_date,
  current_spend numeric(10,2),
  current_deals integer,
  current_pipeline_leads integer,
  on_track boolean,
  claude_verdict text,
  created_at timestamptz default now(),
  unique (hypothesis_id, snapshot_date)
);

-- Enable RLS
alter table hypotheses enable row level security;
alter table hypothesis_snapshots enable row level security;

create policy "own data only" on hypotheses for all using (user_id = auth.uid()::text);
create policy "own data only" on hypothesis_snapshots for all using (user_id = auth.uid()::text);
