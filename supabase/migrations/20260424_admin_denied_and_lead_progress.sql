-- Admin + contractor workflow enhancements
-- 1) True denied state for contractors
-- 2) Lead lifecycle statuses per contractor after claim

alter table if exists public.professionals
  add column if not exists is_denied boolean not null default false,
  add column if not exists denied_reason text;

create table if not exists public.lead_progress (
  id uuid primary key default gen_random_uuid(),
  lead_request_id uuid not null references public.lead_requests(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  status text not null check (status in ('claimed','contacted','quoted','won','lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_request_id, professional_id)
);

create index if not exists idx_lead_progress_professional on public.lead_progress(professional_id, updated_at desc);
create index if not exists idx_lead_progress_lead on public.lead_progress(lead_request_id, updated_at desc);

-- keep updated_at current
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lead_progress_updated_at on public.lead_progress;
create trigger trg_lead_progress_updated_at
before update on public.lead_progress
for each row
execute function public.handle_updated_at();
