create table lab_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  type text not null,
  if_action text not null,
  then_statement text not null,
  because_reason text not null,
  window_days integer not null,
  expected_impact text,
  keywords_affected text[],
  status text not null default 'active' check (status in ('active', 'completed', 'dismissed')),
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz default now()
);

alter table lab_experiments enable row level security;
create policy "own data only" on lab_experiments for all using (user_id = auth.uid()::text);
