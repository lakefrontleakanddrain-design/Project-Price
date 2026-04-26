-- Contractor self-management + compliance docs

alter table if exists public.professionals
  add column if not exists is_paused_by_contractor boolean not null default false,
  add column if not exists is_denied boolean not null default false,
  add column if not exists denied_reason text;

create table if not exists public.contractor_compliance_docs (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  service_name text not null,
  insurance_doc_path text not null,
  insurance_expires_on date not null,
  license_doc_path text,
  license_expires_on date,
  last_notified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, service_name)
);

create index if not exists idx_contractor_docs_professional on public.contractor_compliance_docs(professional_id);
create index if not exists idx_contractor_docs_insurance_exp on public.contractor_compliance_docs(insurance_expires_on);
create index if not exists idx_contractor_docs_license_exp on public.contractor_compliance_docs(license_expires_on);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contractor_docs_updated_at on public.contractor_compliance_docs;
create trigger trg_contractor_docs_updated_at
before update on public.contractor_compliance_docs
for each row
execute function public.handle_updated_at();
