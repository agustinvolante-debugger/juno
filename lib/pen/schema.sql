-- Pen → AI notes for a realtor. Run in the Supabase SQL editor (service-role access only).
-- Convention matches lib/news/schema.sql: <feature>_<table>, keyed by NextAuth session email.

-- ---------------------------------------------------------------------------
-- STORAGE: create a PRIVATE bucket named `pen-audio` in the Supabase dashboard
-- (Storage → New bucket → name: pen-audio, Public: OFF).
-- Audio never passes through the Next API — Vercel caps request bodies at 4.5MB
-- and an hour of pen audio is far more than that. The browser uploads straight to
-- this bucket with a signed URL, and the server only ever handles the object path.
-- ---------------------------------------------------------------------------

create table if not exists pen_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_email    text not null,
  title         text,
  -- uploaded → transcribing → transcribed → noted, or error at any point
  status        text not null default 'uploaded',
  storage_path  text not null,
  source_name   text,                        -- original filename as it sat on the pen
  mime          text,
  duration_sec  int,
  bytes         bigint,
  -- Fla. Stat. § 934.03 is all-party consent and a third-degree felony, and he is a
  -- licensed agent. Nothing is transcribed unless this is true.
  consent       boolean not null default false,
  aai_id        text,
  transcript    jsonb  default '{}'::jsonb,  -- {text, utterances:[{speaker,text,start,end}]}
  notes         jsonb  default '{}'::jsonb,  -- Claude extraction, see lib/pen/extract.ts
  user_notes    text,                        -- what he typed himself (the Granola move)
  client_name   text,
  error_text    text,
  recorded_at   timestamptz,                 -- file mtime off the pen, not upload time
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists pen_sessions_user   on pen_sessions(user_email, created_at desc);
create index if not exists pen_sessions_aai    on pen_sessions(aai_id);
create index if not exists pen_sessions_client on pen_sessions(user_email, client_name);

-- Plugging the pen in twice must not create the recording twice. Same owner + same
-- filename + same byte count off the same device is the same recording.
create unique index if not exists pen_sessions_dedupe
  on pen_sessions(user_email, source_name, bytes);

-- The compounding piece, and the only part of this that a generic notetaker can't copy:
-- a rolling model of what one specific buyer actually wants, built across showings.
create table if not exists pen_clients (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null,
  name        text not null,
  -- {must_haves[], dealbreakers[], revealed_criteria[], budget_signals[], open_questions[]}
  profile     jsonb default '{}'::jsonb,
  showings    int   default 0,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now(),
  unique (user_email, name)
);
create index if not exists pen_clients_user on pen_clients(user_email);

-- ---------------------------------------------------------------------------
-- 2026-09-08 — AI layer. Run this ALTER as ONE line in the Supabase SQL editor.
-- meeting_type   what kind of meeting the extraction decided this is (overridable)
-- chat           grounded Q&A history over this transcript, [{role,content,ts}]
-- action_done    indices of actions the user has ticked off
-- ---------------------------------------------------------------------------
-- alter table public.pen_sessions add column if not exists meeting_type text, add column if not exists chat jsonb default '[]'::jsonb, add column if not exists action_done jsonb default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2026-09-09 — agentic workspace. Covers ALL FOUR features so this runs once.
-- Each statement is ONE line: the Supabase SQL editor splits multi-line DDL.
--
-- note_blocks       [{id,text,source:'user'|'ai'}] — the Jot & Enhance editor. Provenance is
--                   per block, which is what makes black-vs-grey meaningful and editable.
-- transcript_edits  {utteranceIndex: correctedText} — manual transcript corrections, kept as
--                   an overlay so the original AssemblyAI output is never destroyed.
-- deliverables      [{id,kind,title,body,ref,ts}] — drafted emails / memos / tracker rows.
-- briefing_sent_at  when the post-meeting briefing email last went out.
-- ---------------------------------------------------------------------------
-- alter table public.pen_sessions add column if not exists note_blocks jsonb default '[]'::jsonb, add column if not exists transcript_edits jsonb default '{}'::jsonb, add column if not exists deliverables jsonb default '[]'::jsonb, add column if not exists briefing_sent_at timestamptz;

-- Archive-wide chat (feature 2). One running conversation per user; citations reference
-- pen_sessions.id so the UI can link an answer back to the recordings it came from.
-- create table if not exists public.pen_archive_chat (user_email text primary key, messages jsonb default '[]'::jsonb, updated_at timestamptz default now());
