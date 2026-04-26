-- Add optional coordinates to lead requests for geofence-aware matching.

alter table public.lead_requests
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6);
