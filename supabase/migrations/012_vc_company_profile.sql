-- 012: PitchBook-style company profile fields (Phase 2 of the pitchbook plan).
-- Firmographics captured by the enrichment agents during their web pass.
-- Founders stored as display text for now (normalizing into vc_people + links is a later phase).
alter table vc_companies add column if not exists website text;
alter table vc_companies add column if not exists description text;
alter table vc_companies add column if not exists founded_year int;
alter table vc_companies add column if not exists headcount text;
alter table vc_companies add column if not exists founders text;
alter table vc_companies add column if not exists profile_source_url text;
alter table vc_companies add column if not exists profile_updated_at timestamptz;
