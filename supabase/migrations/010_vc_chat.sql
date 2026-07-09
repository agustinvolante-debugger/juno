-- 010_vc_chat.sql
-- VC Constellation chat: conversations, messages, result-set snapshots (the
-- grounding layer for tables/CSV/maps), and the per-request agent run log.
-- All four tables are PRIVATE: RLS enabled with NO public policies — every
-- read/write goes through the service-role API behind the chat-key gate.

create table if not exists vc_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vc_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references vc_chat_conversations(id) on delete cascade,
  role text not null,                -- user | assistant
  content jsonb not null,           -- ordered blocks: {type:'text',text} | {type:'table',resultSetId,interpretation,total}
  created_at timestamptz not null default now()
);

-- exact rows behind every table/CSV artifact — the model never touches these
create table if not exists vc_result_sets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references vc_chat_conversations(id) on delete cascade,
  interpretation text,              -- human-readable filter statement shown in chat
  filters jsonb,                    -- the structured filters that produced it
  columns text[] not null,
  rows jsonb not null,              -- snapshot, capped at 500 rows
  total int not null default 0,     -- total matches (may exceed snapshot size)
  created_at timestamptz not null default now()
);

-- cost log: one row per agent request
create table if not exists vc_chat_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references vc_chat_conversations(id) on delete set null,
  model text,
  turns int default 0,
  tools jsonb,                      -- [{name, ms}]
  input_tokens int default 0,
  output_tokens int default 0,
  cache_read_tokens int default 0,
  cache_write_tokens int default 0,
  cost_usd numeric,                 -- estimate from usage
  duration_ms int,
  status text,                      -- ok | error | capped
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_msgs_conv on vc_chat_messages (conversation_id, created_at);
create index if not exists idx_chat_runs_day  on vc_chat_runs (created_at);
create index if not exists idx_result_sets_conv on vc_result_sets (conversation_id);

alter table vc_chat_conversations enable row level security;
alter table vc_chat_messages      enable row level security;
alter table vc_result_sets        enable row level security;
alter table vc_chat_runs          enable row level security;
-- no policies on purpose: anon/authed get nothing; service role bypasses RLS

notify pgrst, 'reload schema';
