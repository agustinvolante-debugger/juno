-- 011_vc_enrich_queue.sql
-- Review queue for the nightly enrichment loop: web-sourced proposals
-- (investments, verified totals) staged here instead of written live.
-- Approve/reject in bulk from vcbrain/review.html.

create table if not exists vc_enrich_queue (
  id uuid primary key default gen_random_uuid(),
  company_slug text not null,
  company_name text,
  kind text not null,               -- investment | override
  payload jsonb not null,           -- the exact tool input that would be applied
  confidence text,                  -- high | medium | low
  source_url text,
  status text not null default 'pending',  -- pending | approved | rejected | applied | failed
  run_note text,                    -- which run proposed it
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists idx_enrich_q_status on vc_enrich_queue (status, created_at);

alter table vc_enrich_queue enable row level security;
-- no policies: service-role only, same as the chat tables

notify pgrst, 'reload schema';
