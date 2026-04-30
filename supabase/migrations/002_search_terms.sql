-- Expand keywords table to support DSA search terms and PMAX data

BEGIN;

ALTER TABLE keywords ADD COLUMN source_type text NOT NULL DEFAULT 'keyword'
  CHECK (source_type IN ('keyword', 'dsa_search_term', 'pmax_search_term', 'asset_group'));
ALTER TABLE keywords ADD COLUMN target_id text;
ALTER TABLE keywords ADD COLUMN landing_page text;
ALTER TABLE keywords ADD COLUMN headline text;

ALTER TABLE keywords DROP CONSTRAINT keywords_user_id_keyword_campaign_ad_group_key;
ALTER TABLE keywords ADD CONSTRAINT keywords_user_id_kw_key
  UNIQUE (user_id, keyword, campaign, ad_group, source_type);

COMMIT;
