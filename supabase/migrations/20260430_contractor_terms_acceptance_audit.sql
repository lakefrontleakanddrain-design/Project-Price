-- Digital contractor terms acceptance audit trail
-- Stores legally relevant acceptance evidence at registration time.

alter table if exists public.professionals
  add column if not exists contractor_terms_version text,
  add column if not exists contractor_terms_accepted_at timestamptz,
  add column if not exists contractor_terms_accepted_ip text,
  add column if not exists contractor_terms_acceleration_acknowledged boolean not null default false,
  add column if not exists contractor_terms_24h_rule_acknowledged boolean not null default false;
