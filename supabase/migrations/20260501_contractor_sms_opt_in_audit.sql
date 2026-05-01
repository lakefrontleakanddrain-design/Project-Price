alter table public.professionals
  add column if not exists contractor_sms_opt_in_acknowledged boolean not null default false,
  add column if not exists contractor_sms_opt_in_at timestamptz,
  add column if not exists contractor_sms_opt_in_ip text,
  add column if not exists contractor_sms_opt_in_text text;