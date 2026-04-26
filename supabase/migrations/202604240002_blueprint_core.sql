-- ProjectPrice Master blueprint alignment
-- Adds Users, Professionals (with geofencing), and lead waterfall tables.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_user_role') then
    create type public.app_user_role as enum ('homeowner', 'professional', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_request_status') then
    create type public.lead_request_status as enum ('pending', 'claimed', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_offer_response') then
    create type public.lead_offer_response as enum ('yes', 'no', 'timeout', 'skipped');
  end if;
end
$$;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_user_role not null default 'homeowner',
  full_name text,
  phone text,
  zip_code text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  company_name text not null,
  contact_phone text not null,
  specialties text[] not null default '{}',
  service_zip_codes text[] not null default '{}',
  service_center_lat numeric(9, 6),
  service_center_lng numeric(9, 6),
  service_radius_km numeric(6, 2) not null default 25 check (service_radius_km > 0),
  is_verified boolean not null default false,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects
  add column if not exists project_type text,
  add column if not exists zip_code text,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists ai_takeoff jsonb,
  add column if not exists estimated_cost_range jsonb;

create table if not exists public.lead_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  homeowner_id uuid not null references public.users (id) on delete cascade,
  specialty text not null,
  zip_code text not null,
  status public.lead_request_status not null default 'pending',
  claimed_professional_id uuid references public.professionals (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_offers (
  id uuid primary key default gen_random_uuid(),
  lead_request_id uuid not null references public.lead_requests (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  offered_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  response public.lead_offer_response,
  twilio_message_sid text,
  created_at timestamptz not null default now(),
  unique (lead_request_id, professional_id),
  unique (lead_request_id, position)
);

create index if not exists idx_users_role on public.users (role);
create index if not exists idx_users_zip_code on public.users (zip_code);
create index if not exists idx_professionals_verified on public.professionals (is_verified);
create index if not exists idx_professionals_specialties on public.professionals using gin (specialties);
create index if not exists idx_professionals_service_zips on public.professionals using gin (service_zip_codes);
create index if not exists idx_lead_requests_status on public.lead_requests (status);
create index if not exists idx_lead_requests_zip_specialty on public.lead_requests (zip_code, specialty);
create index if not exists idx_lead_offers_lead_position on public.lead_offers (lead_request_id, position);
create index if not exists idx_lead_offers_pending on public.lead_offers (professional_id, expires_at);

-- Keep timestamps fresh.
drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row
execute function public.handle_updated_at();

drop trigger if exists trg_professionals_updated_at on public.professionals;
create trigger trg_professionals_updated_at
before update on public.professionals
for each row
execute function public.handle_updated_at();

drop trigger if exists trg_lead_requests_updated_at on public.lead_requests;
create trigger trg_lead_requests_updated_at
before update on public.lead_requests
for each row
execute function public.handle_updated_at();

alter table public.users enable row level security;
alter table public.professionals enable row level security;
alter table public.lead_requests enable row level security;
alter table public.lead_offers enable row level security;

drop policy if exists "Users read own user row" on public.users;
create policy "Users read own user row"
on public.users
for select
using (id = auth.uid());

drop policy if exists "Users manage own user row" on public.users;
create policy "Users manage own user row"
on public.users
for all
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Pros read own professional row" on public.professionals;
create policy "Pros read own professional row"
on public.professionals
for select
using (user_id = auth.uid());

drop policy if exists "Pros manage own professional row" on public.professionals;
create policy "Pros manage own professional row"
on public.professionals
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Homeowners manage own lead requests" on public.lead_requests;
create policy "Homeowners manage own lead requests"
on public.lead_requests
for all
using (homeowner_id = auth.uid())
with check (homeowner_id = auth.uid());

drop policy if exists "Pros read offers assigned to them" on public.lead_offers;
create policy "Pros read offers assigned to them"
on public.lead_offers
for select
using (
  exists (
    select 1
    from public.professionals p
    where p.id = professional_id
      and p.user_id = auth.uid()
  )
);

-- Service role should orchestrate waterfall via backend/edge functions.
drop policy if exists "Service role manages offers" on public.lead_offers;
create policy "Service role manages offers"
on public.lead_offers
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
