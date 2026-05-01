-- Add Stripe subscription tracking to professionals
alter table if exists public.professionals
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text not null default 'pending';

-- subscription_status values: 'pending' | 'active' | 'past_due' | 'canceled'
create index if not exists professionals_stripe_customer_id_idx
  on public.professionals (stripe_customer_id);
create index if not exists professionals_subscription_status_idx
  on public.professionals (subscription_status);
