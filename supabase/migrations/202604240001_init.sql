-- Project Price initial schema

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Keep all app tables in the public schema for Supabase defaults.

create type public.quote_status as enum (
  'draft',
  'submitted',
  'accepted',
  'rejected'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  currency char(3) not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name citext not null,
  email citext,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'unit',
  target_quantity numeric(12, 2) not null check (target_quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  status public.quote_status not null default 'draft',
  quote_date date not null default current_date,
  valid_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.price_quotes (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, item_id)
);

create table if not exists public.price_snapshots (
  id bigserial primary key,
  item_id uuid not null references public.items (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  quoted_on date not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_owner_id on public.projects (owner_id);
create index if not exists idx_vendors_owner_id on public.vendors (owner_id);
create index if not exists idx_items_project_id on public.items (project_id);
create index if not exists idx_price_quotes_project_id on public.price_quotes (project_id);
create index if not exists idx_price_quotes_vendor_id on public.price_quotes (vendor_id);
create index if not exists idx_quote_lines_quote_id on public.quote_lines (quote_id);
create index if not exists idx_quote_lines_item_id on public.quote_lines (item_id);
create index if not exists idx_price_snapshots_item_vendor_date on public.price_snapshots (item_id, vendor_id, quoted_on desc);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.handle_updated_at();

create trigger trg_projects_updated_at
before update on public.projects
for each row
execute function public.handle_updated_at();

create trigger trg_vendors_updated_at
before update on public.vendors
for each row
execute function public.handle_updated_at();

create trigger trg_items_updated_at
before update on public.items
for each row
execute function public.handle_updated_at();

create trigger trg_price_quotes_updated_at
before update on public.price_quotes
for each row
execute function public.handle_updated_at();

create trigger trg_quote_lines_updated_at
before update on public.quote_lines
for each row
execute function public.handle_updated_at();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.vendors enable row level security;
alter table public.items enable row level security;
alter table public.price_quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.price_snapshots enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can manage own projects"
on public.projects
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can manage own vendors"
on public.vendors
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can manage items in owned projects"
on public.items
for all
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = auth.uid()
  )
);

create policy "Users can manage quotes in owned projects"
on public.price_quotes
for all
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = auth.uid()
  )
);

create policy "Users can manage quote lines in owned projects"
on public.quote_lines
for all
using (
  exists (
    select 1
    from public.price_quotes q
    join public.projects p on p.id = q.project_id
    where q.id = quote_id
      and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.price_quotes q
    join public.projects p on p.id = q.project_id
    where q.id = quote_id
      and p.owner_id = auth.uid()
  )
);

create policy "Users can manage snapshots in owned projects"
on public.price_snapshots
for all
using (
  exists (
    select 1
    from public.items i
    join public.projects p on p.id = i.project_id
    where i.id = item_id
      and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.items i
    join public.projects p on p.id = i.project_id
    where i.id = item_id
      and p.owner_id = auth.uid()
  )
);
