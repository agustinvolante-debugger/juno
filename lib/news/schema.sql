-- News reader — Supabase schema. Run in Supabase SQL editor (or via service role).
-- Per-user state keyed by email (matches NextAuth session.user.email). Service-role access only.

-- Pinned topic sections per user
create table if not exists news_topics (
  id          bigint generated always as identity primary key,
  user_email  text not null,
  query       text not null,
  route       jsonb default '{}'::jsonb,   -- {sites, hl, gl, ceid, query}
  brief       text,
  items       jsonb default '[]'::jsonb,    -- [{t,l,s,d}]
  created_at  timestamptz default now(),
  unique (user_email, query)
);
create index if not exists news_topics_user on news_topics(user_email);

-- Per-user preferences (language, saved layout)
create table if not exists news_prefs (
  user_email  text primary key,
  lang        text default 'en',
  layout      jsonb default '{}'::jsonb,    -- {order:[], wide:[]}
  updated_at  timestamptz default now()
);

-- Per-user "For You" learning profile (moves personalization server-side → cross-device)
create table if not exists news_profile (
  user_email  text primary key,
  profile     jsonb default '{}'::jsonb,    -- {s:{src:count}, k:{section:count}, w:{word:count}}
  updated_at  timestamptz default now()
);

-- Shared feed cache (refreshed by Vercel Cron every ~30 min; one row per section)
create table if not exists news_feed_cache (
  section     text primary key,
  items       jsonb default '[]'::jsonb,    -- [{t,l,s,d,summary}]
  updated_at  timestamptz default now()
);

-- Shared macro strip cache. id=1 = macro strip stats (Dow / CPI / Unemployment).
-- id=2 reuses this table to hold the AI "what matters today" briefs map {sectionKey: text}
-- (kept out of news_feed_cache so older deployed code never reads it as a section).
create table if not exists news_macro_cache (
  id          int primary key default 1,
  stats       jsonb default '[]'::jsonb,
  updated_at  timestamptz default now()
);

-- Shared translation cache (link -> Spanish title), language-agnostic per article
create table if not exists news_translations (
  link        text primary key,
  es          text,
  updated_at  timestamptz default now()
);
