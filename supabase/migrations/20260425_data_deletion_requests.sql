create table if not exists public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  email text not null,
  account_type text not null check (account_type in ('homeowner', 'contractor', 'both')),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_deletion_requests_created_at
  on public.data_deletion_requests(created_at desc);

create index if not exists idx_data_deletion_requests_status
  on public.data_deletion_requests(status);

create or replace function public.handle_data_deletion_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_data_deletion_requests_updated_at on public.data_deletion_requests;
create trigger trg_data_deletion_requests_updated_at
before update on public.data_deletion_requests
for each row
execute function public.handle_data_deletion_requests_updated_at();
