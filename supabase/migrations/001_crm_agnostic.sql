-- Make contacts and deals CRM-agnostic (support HubSpot + RD Station + future CRMs)

BEGIN;

-- contacts: hubspot_id → crm_id + crm_provider
ALTER TABLE contacts RENAME COLUMN hubspot_id TO crm_id;
ALTER TABLE contacts ADD COLUMN crm_provider text NOT NULL DEFAULT 'hubspot';
ALTER TABLE contacts DROP CONSTRAINT contacts_user_id_hubspot_id_key;
ALTER TABLE contacts ADD CONSTRAINT contacts_user_id_crm_key UNIQUE (user_id, crm_provider, crm_id);

-- deals: hubspot_deal_id → crm_deal_id + crm_provider
ALTER TABLE deals RENAME COLUMN hubspot_deal_id TO crm_deal_id;
ALTER TABLE deals ADD COLUMN crm_provider text NOT NULL DEFAULT 'hubspot';
ALTER TABLE deals DROP CONSTRAINT deals_user_id_hubspot_deal_id_key;
ALTER TABLE deals ADD CONSTRAINT deals_user_id_crm_deal_key UNIQUE (user_id, crm_provider, crm_deal_id);

-- oauth_tokens: expand provider options for RD Station
ALTER TABLE oauth_tokens DROP CONSTRAINT oauth_tokens_provider_check;
ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_provider_check
  CHECK (provider IN ('google_ads', 'hubspot', 'rd_station_marketing', 'rd_station_crm'));

COMMIT;
