-- Store the exact phone submitted on the lead form for reliable contractor/admin contact display.

alter table public.lead_requests
  add column if not exists homeowner_phone text;
