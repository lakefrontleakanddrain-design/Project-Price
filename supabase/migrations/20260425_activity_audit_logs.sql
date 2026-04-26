-- Admin activity/audit log table for ProjectPrice admin console.

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target_type text,
  target_id text,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_activity_logs_created_at
  on public.admin_activity_logs(created_at desc);

create index if not exists idx_admin_activity_logs_action
  on public.admin_activity_logs(action);

create index if not exists idx_admin_activity_logs_target
  on public.admin_activity_logs(target_type, target_id);
