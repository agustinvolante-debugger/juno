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

-- ---------------------------------------------------------------------------
-- 2026-09-10 — fix import dedupe. Run each line separately in the SQL editor.
--
-- The old key was (user_email, source_name, bytes), but `bytes` is the size AFTER the
-- browser downsamples to mono 16 kHz, and that re-encode is not bit-identical between runs.
-- So re-importing the same file produced a slightly different size and slipped past the
-- index. `recorded_at` comes from the file's own mtime on the pen and never changes, which
-- makes it the correct natural key.
-- ---------------------------------------------------------------------------
-- drop index if exists pen_sessions_dedupe;
-- create unique index if not exists pen_sessions_dedupe on pen_sessions(user_email, source_name, recorded_at);

-- ---------------------------------------------------------------------------
-- 2026-09-10 — chat threads and pages. Run each line separately in the SQL editor
-- (it splits multi-line DDL and you get "syntax error at or near ...").
--
-- pen_chats replaces the single running conversation in pen_archive_chat: search is now a
-- persistent thread you can leave and come back to, so there are many per user.
--
-- pen_docs holds artifacts a chat produced — a summary, a prep doc, a checklist. They are
-- editable after the fact, which is the whole point: the model writes the first draft and
-- the user owns it from there. chat_id is where it came from, kept nullable so a page
-- outlives the thread that made it.
-- ---------------------------------------------------------------------------
-- create table if not exists public.pen_chats (id uuid primary key default gen_random_uuid(), user_email text not null, title text, messages jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- create index if not exists pen_chats_user on public.pen_chats(user_email, updated_at desc);
-- create table if not exists public.pen_docs (id uuid primary key default gen_random_uuid(), user_email text not null, chat_id uuid references public.pen_chats(id) on delete set null, kind text not null default 'summary', title text not null default 'Untitled', body text not null default '', source_ids jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- create index if not exists pen_docs_user on public.pen_docs(user_email, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2026-09-15 — launch sign-ups. Run each line separately in the SQL editor.
--
-- Public lead capture from the landing page, so no auth and no link to pen_sessions:
-- these are people who have not signed in yet. email is unique so a second submission
-- updates rather than duplicating.
--
-- Shipping fields are nullable on purpose — they are only asked for when someone says
-- they need a pen, and demanding an address before anyone has used anything costs
-- far more signups than it saves in logistics.
-- ---------------------------------------------------------------------------
-- create table if not exists public.pen_signups (id uuid primary key default gen_random_uuid(), name text not null, email text not null, phone text, role text, has_recorder boolean not null default false, ship_line1 text, ship_line2 text, ship_city text, ship_state text, ship_postcode text, ship_country text, note text, source text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- create unique index if not exists pen_signups_email on public.pen_signups(lower(email));

-- ---------------------------------------------------------------------------
-- 2026-09-15 — accounts. Run each line separately in the SQL editor.
--
-- The thing that connects sign-up, payment and access. Before this, sign-in checked a
-- hardcoded array in lib/auth.ts, so customer 13 could pay and then be refused at the door
-- with no way to let them in short of a deploy.
--
-- status: pending  — signed up, not paid
--         active   — paying, or granted by hand
--         cancelled— subscription ended; kept, not deleted, so history survives
--
-- The hardcoded list stays in code as a break-glass override, so a database problem cannot
-- lock everyone out of their own recordings.
-- ---------------------------------------------------------------------------
-- create table if not exists public.pen_accounts (id uuid primary key default gen_random_uuid(), email text not null, status text not null default 'pending', plan text, source text, stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz, activated_at timestamptz, note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- create unique index if not exists pen_accounts_email on public.pen_accounts(lower(email));
-- create index if not exists pen_accounts_stripe_customer on public.pen_accounts(stripe_customer_id);

-- ---------------------------------------------------------------------------
-- 2026-09-22 — joining split recordings. Run each line separately.
--
-- The pen stops at 60 minutes and starts a new file, so a 73-minute meeting arrives as two
-- recordings. Its filenames encode the start time, so contiguity is exact rather than a
-- guess: R20260922-213209 + 59m12s ends at 22:31:21, and the next file is R20260922-223121.
--
-- Segments keep their own rows and their own transcripts — nothing is destroyed, so a bad
-- join is undone by clearing these two columns. The lowest index carries the notes for the
-- whole meeting; the rest are hidden from the list and reachable through it.
-- ---------------------------------------------------------------------------
-- alter table public.pen_sessions add column if not exists merge_group uuid, add column if not exists merge_index int;
-- create index if not exists pen_sessions_merge on public.pen_sessions(merge_group, merge_index);

-- ---------------------------------------------------------------------------
-- 2026-09-22 — card-on-file trial. Run each line separately.
--
-- The free recorder only pays for itself if roughly half the people who accept one go on to
-- subscribe. A card taken at sign-up is the difference between selecting for people who
-- accept free hardware and people who mean to use it, so the trial needs to be a state we can
-- see rather than something we infer.
--
-- trial_ends_at in the future = trialing, nothing paid yet. In the past = they converted.
-- offer records which promise brought them in, so the first twenty pens can be counted.
-- ---------------------------------------------------------------------------
-- alter table public.pen_accounts add column if not exists trial_ends_at timestamptz, add column if not exists offer text;
-- create index if not exists pen_accounts_trial on public.pen_accounts(trial_ends_at);

-- ---------------------------------------------------------------------------
-- 2026-09-23 — hours cap, bought hours, and the agent profile. Run each line separately.
--
-- metered_at / metered_sec  when a recording was sent for transcription and how long it was.
--   That moment, not the upload, is when it counts against the month: a recording held on the
--   31st for lack of time and released on the 1st belongs to the new month. metered_sec starts
--   as the browser's estimate and is replaced by AssemblyAI's real duration, or 0 on failure.
--   Rows from before this fall back to created_at and duration_sec. See lib/pen/allowance.ts.
--
-- pen_hour_purchases  one row per paid hours checkout. The unique Stripe session id is what
--   lets the webhook and the success page both record it without double-counting.
--
-- pen_profiles  what the user told us about themselves, fed to the notes and chat prompts.
-- ---------------------------------------------------------------------------
-- alter table public.pen_sessions add column if not exists metered_at timestamptz, add column if not exists metered_sec int;
-- create table if not exists public.pen_hour_purchases (id uuid primary key default gen_random_uuid(), user_email text not null, hours int not null check (hours > 0), amount_cents int not null default 0, stripe_session_id text not null, created_at timestamptz not null default now());
-- create unique index if not exists pen_hour_purchases_session on public.pen_hour_purchases(stripe_session_id);
-- create index if not exists pen_hour_purchases_user on public.pen_hour_purchases(lower(user_email));
-- create table if not exists public.pen_profiles (user_email text primary key, profile jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());

-- ---------------------------------------------------------------------------
-- 2026-09-23 (b) — people. Run each line separately, in order.
--
-- pen_people  someone the user talks to. Name and email come from the user; role, company and
--   summary are written by the model from every recording the person is linked to. One name
--   per user (case-insensitive), so "Chris Dyas" typed at import and "chris dyas" typed on a
--   recording page are the same person.
-- pen_session_people  which recordings each person was on. source: 'user' (added on the
--   recording page), 'import' (typed at upload, or backfilled from client_name below).
--
-- The last two lines backfill people from the "who was this call" name already on existing
-- recordings. Safe to run twice.
-- ---------------------------------------------------------------------------
-- create table if not exists public.pen_people (id uuid primary key default gen_random_uuid(), user_email text not null, name text not null, email text, role text, company text, summary text, enriched_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- create unique index if not exists pen_people_name on public.pen_people(user_email, lower(name));
-- create table if not exists public.pen_session_people (session_id uuid not null references public.pen_sessions(id) on delete cascade, person_id uuid not null references public.pen_people(id) on delete cascade, user_email text not null, source text not null default 'user', created_at timestamptz not null default now(), primary key (session_id, person_id));
-- create index if not exists pen_session_people_person on public.pen_session_people(person_id);
-- insert into public.pen_people (user_email, name) select distinct user_email, trim(client_name) from public.pen_sessions where coalesce(trim(client_name), '') <> '' on conflict (user_email, lower(name)) do nothing;
-- insert into public.pen_session_people (session_id, person_id, user_email, source) select s.id, p.id, s.user_email, 'import' from public.pen_sessions s join public.pen_people p on p.user_email = s.user_email and lower(p.name) = lower(trim(s.client_name)) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2026-09-23 (c) — Home cards. missed_done holds the indices of notes.missed the user marked
-- handled, the same shape action_done has for notes.actions.
-- ---------------------------------------------------------------------------
-- alter table public.pen_sessions add column if not exists missed_done jsonb default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2026-09-23 (d) — the user's own line about a person ("my realtor friend, first user").
-- Never written by the model; given to it as fact when it writes the person's card.
-- ---------------------------------------------------------------------------
-- alter table public.pen_people add column if not exists about text;

-- ---------------------------------------------------------------------------
-- 2026-09-23 (e) — owner customers page. When a customer's pen was posted, set from the
-- "Mark posted" button. Empty means not posted yet (or not owed).
-- ---------------------------------------------------------------------------
-- alter table public.pen_accounts add column if not exists pen_shipped_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2026-09-24 (a) — WhatsApp. Run each line separately.
--
-- pen_whatsapp_links     one row per account: linked phone (digits only), the pending LINK
--                        code, and the WhatsApp chat history.
-- pen_whatsapp_messages  every inbound message by Vonage's message_uuid. The primary key is
--                        the dedupe against Vonage retries; a file waiting for its consent tap
--                        sits here with state 'consent'.
-- pen_sessions.source_channel  'whatsapp' when the file came in that way, so the briefing
--                        goes back to the chat.
-- ---------------------------------------------------------------------------
-- create table if not exists public.pen_whatsapp_links (email text primary key, phone text, code text, code_expires_at timestamptz, linked_at timestamptz, chat jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- create unique index if not exists pen_whatsapp_links_phone on public.pen_whatsapp_links(phone);
-- create unique index if not exists pen_whatsapp_links_code on public.pen_whatsapp_links(code);
-- create table if not exists public.pen_whatsapp_messages (id text primary key, phone text not null, email text, kind text not null, state text not null default 'received', payload jsonb not null default '{}'::jsonb, session_id uuid, created_at timestamptz not null default now());
-- create index if not exists pen_whatsapp_messages_phone on public.pen_whatsapp_messages(phone, created_at desc);
-- alter table public.pen_sessions add column if not exists source_channel text;
-- alter table public.pen_whatsapp_links enable row level security;
-- alter table public.pen_whatsapp_messages enable row level security;
