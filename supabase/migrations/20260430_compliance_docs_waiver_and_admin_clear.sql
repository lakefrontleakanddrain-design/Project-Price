-- Compliance docs: license waiver fields + admin clear override

alter table if exists public.contractor_compliance_docs
  add column if not exists license_waived boolean not null default false,
  add column if not exists license_waiver_signature text,
  add column if not exists license_waiver_ip text,
  add column if not exists license_waiver_at timestamptz,
  add column if not exists admin_cleared_at timestamptz,
  add column if not exists admin_cleared_by text;
