-- 013: multi-user separation (pitchbook Phase 3).
-- Conversations become private per account (existing history assigned to Agustin);
-- per-user state (watchlist + saved queries) and the agent-memo cache.
alter table vc_chat_conversations add column if not exists user_email text;
update vc_chat_conversations set user_email = 'agustinvolantesilva@gmail.com' where user_email is null;

create table if not exists vc_user_state (
  user_email text primary key,
  watchlist jsonb not null default '[]'::jsonb,      -- [{slug,name,added}]
  saved_queries jsonb not null default '[]'::jsonb,  -- [{name,filters,created}]
  updated_at timestamptz not null default now()
);
alter table vc_user_state enable row level security;  -- service-role API only

create table if not exists vc_memos (
  company_slug text primary key,
  memo text,
  sources jsonb,
  model text,
  user_email text,
  updated_at timestamptz not null default now()
);
alter table vc_memos enable row level security;  -- service-role API only
