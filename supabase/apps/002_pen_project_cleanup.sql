-- 002_pen_project_cleanup.sql — run in the ORIGINAL (Juno Pen) project, LAST.
-- Only after: the copy to juno-apps is verified, production vc. and news. run on juno-apps,
-- and the founder has approved. Dropping cannot be undone.
-- Juno Pen (pen_*), page_views and report_views stay.

-- 1. Tables now living in juno-apps (VC Constellation + Daily Brief).
drop table if exists
  vc_board_seats, vc_investments, vc_people, vc_companies, vc_filings, vc_firms,
  vc_info_requests, vc_sync_log, vc_ingest_meta, vc_funding_overrides, vc_funding_events,
  vc_chat_messages, vc_result_sets, vc_chat_runs, vc_chat_conversations,
  vc_enrich_queue, vc_user_state, vc_memos,
  vc_formd_person_issuers, vc_formd_persons, vc_formd_issuers,
  news_topics, news_prefs, news_profile, news_feed_cache, news_macro_cache, news_translations;

-- 2. The old attribution product (backup: ~/juno-backups/attribution-tables-2026-10-08.json),
--    its OAuth tokens (no backup, by decision), and the unused "JunoMVP" table (0 rows).
drop table if exists
  attributions, deals, contacts, keywords, lab_experiments, oauth_tokens, "JunoMVP";

-- 3. Trim the pg_cron run log (Pen's two crons write ~1,500 rows a day) and keep it trimmed.
delete from cron.job_run_details where end_time < now() - interval '7 days';
select cron.schedule('trim-cron-log', '0 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- 4. Check what's left (expect pen_*, page_views, report_views and a few small tables).
select relname as table_name, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc;
