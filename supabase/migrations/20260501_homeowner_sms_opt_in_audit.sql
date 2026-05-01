alter table public.lead_requests
  add column if not exists homeowner_sms_opt_in_acknowledged boolean not null default false,
  add column if not exists homeowner_sms_opt_in_at timestamptz,
  add column if not exists homeowner_sms_opt_in_ip text,
  add column if not exists homeowner_sms_opt_in_text text;