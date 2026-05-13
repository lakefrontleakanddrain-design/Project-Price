create table if not exists public.web_page_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  page_path text,
  page_url text,
  referrer_url text,
  referrer_host text,
  source text,
  medium text,
  campaign text,
  term text,
  content text,
  landing_path text,
  client_ip text,
  user_agent text
);

create index if not exists idx_web_page_events_created_at
  on public.web_page_events(created_at desc);

create index if not exists idx_web_page_events_session
  on public.web_page_events(session_id);

create index if not exists idx_web_page_events_referrer
  on public.web_page_events(referrer_host);

create index if not exists idx_web_page_events_page
  on public.web_page_events(page_path);

-- Supabase Data API access and RLS (added 2026-05-13)
grant select on public.web_page_events to anon;
grant select, insert, update, delete on public.web_page_events to authenticated;
grant select, insert, update, delete on public.web_page_events to service_role;

alter table public.web_page_events enable row level security;

-- Example policy: allow all authenticated users to insert
create policy "Authenticated can insert web events"
  on public.web_page_events
  for insert to authenticated
  with check (true);

-- Example policy: allow service_role to do anything
create policy "Service role full access"
  on public.web_page_events
  for all to service_role
  using (true) with check (true);
