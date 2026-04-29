create table if not exists public.pricing_market_profiles (
  market_code text primary key,
  market_name text not null,
  region text not null,
  labor_cost_index numeric(5, 2) not null default 1.00,
  material_cost_index numeric(5, 2) not null default 1.00,
  permit_complexity smallint not null default 3 check (permit_complexity between 1 and 5),
  code_complexity smallint not null default 3 check (code_complexity between 1 and 5),
  access_complexity smallint not null default 3 check (access_complexity between 1 and 5),
  weather_complexity smallint not null default 3 check (weather_complexity between 1 and 5),
  pricing_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zip_market_lookup (
  zip_prefix char(3) primary key,
  market_code text not null references public.pricing_market_profiles (market_code) on delete cascade,
  city text,
  state_code char(2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (zip_prefix ~ '^\d{3}$')
);

create index if not exists idx_zip_market_lookup_market_code on public.zip_market_lookup (market_code);

drop trigger if exists trg_pricing_market_profiles_updated_at on public.pricing_market_profiles;
create trigger trg_pricing_market_profiles_updated_at
before update on public.pricing_market_profiles
for each row
execute function public.handle_updated_at();

drop trigger if exists trg_zip_market_lookup_updated_at on public.zip_market_lookup;
create trigger trg_zip_market_lookup_updated_at
before update on public.zip_market_lookup
for each row
execute function public.handle_updated_at();

alter table public.pricing_market_profiles enable row level security;
alter table public.zip_market_lookup enable row level security;

drop policy if exists "Service role manages pricing market profiles" on public.pricing_market_profiles;
create policy "Service role manages pricing market profiles"
on public.pricing_market_profiles
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role manages zip market lookup" on public.zip_market_lookup;
create policy "Service role manages zip market lookup"
on public.zip_market_lookup
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into public.pricing_market_profiles (
  market_code,
  market_name,
  region,
  labor_cost_index,
  material_cost_index,
  permit_complexity,
  code_complexity,
  access_complexity,
  weather_complexity,
  pricing_notes
)
values
  ('regional_northeast', 'Northeast regional market', 'northeast', 1.18, 1.08, 4, 4, 3, 4, 'Higher labor cost with stronger code enforcement and seasonal weather impacts.'),
  ('regional_southeast', 'Southeast regional market', 'southeast', 0.98, 0.97, 3, 3, 3, 3, 'Balanced labor and materials with moderate permit friction and storm resilience considerations.'),
  ('regional_midwest', 'Midwest regional market', 'midwest', 1.00, 0.99, 3, 3, 2, 4, 'Balanced labor and materials with winter seasonality and standard municipal permitting.'),
  ('regional_south_central', 'South Central regional market', 'south_central', 0.96, 0.98, 3, 3, 2, 3, 'Moderate pricing with suburban access and utility-driven job variation.'),
  ('regional_mountain', 'Mountain regional market', 'mountain', 1.04, 1.02, 3, 3, 4, 4, 'Access, elevation, and weather can materially affect delivery and labor productivity.'),
  ('regional_southwest', 'Southwest regional market', 'southwest', 1.03, 1.01, 3, 3, 3, 2, 'Moderate-high labor assumptions with heat, drought, and utility-upgrade considerations.'),
  ('regional_west_coast', 'West Coast regional market', 'west_coast', 1.28, 1.16, 5, 5, 4, 2, 'Premium labor market with stricter code, permitting, and access conditions in major coastal metros.'),
  ('cleveland_oh', 'Cleveland metro market', 'midwest', 1.01, 0.99, 3, 3, 2, 4, 'Use balanced Midwest assumptions with winter scheduling impacts and standard municipal code review.'),
  ('chicago_il', 'Chicago metro market', 'midwest', 1.12, 1.04, 4, 4, 3, 4, 'Large-metro labor premiums with winter seasonality and denser permitting requirements.'),
  ('dallas_tx', 'Dallas metro market', 'south_central', 1.03, 1.00, 3, 3, 2, 2, 'Large suburban market with moderate permit friction and steady labor demand.'),
  ('houston_tx', 'Houston metro market', 'south_central', 1.01, 1.00, 3, 3, 2, 3, 'Moderate labor assumptions with storm resilience and drainage considerations.'),
  ('miami_fl', 'Miami metro market', 'southeast', 1.15, 1.10, 4, 4, 3, 3, 'Premium coastal labor market with hurricane-code and permitting premiums.'),
  ('atlanta_ga', 'Atlanta metro market', 'southeast', 1.02, 0.99, 3, 3, 2, 2, 'Balanced major-metro market with moderate permitting and labor premiums.'),
  ('denver_co', 'Denver metro market', 'mountain', 1.09, 1.04, 3, 3, 3, 4, 'Front Range labor premiums with weather and access considerations.'),
  ('phoenix_az', 'Phoenix metro market', 'southwest', 1.05, 1.01, 3, 3, 2, 2, 'Large growth market with utility and heat-related project impacts.'),
  ('los_angeles_ca', 'Los Angeles metro market', 'west_coast', 1.30, 1.18, 5, 5, 4, 2, 'Premium labor, dense urban access issues, and strong code enforcement.'),
  ('san_francisco_ca', 'San Francisco metro market', 'west_coast', 1.42, 1.24, 5, 5, 5, 2, 'Very high labor and permit costs with seismic code, access, and site-constraint premiums.'),
  ('seattle_wa', 'Seattle metro market', 'west_coast', 1.22, 1.10, 4, 4, 3, 3, 'Higher labor and permitting with weather-driven scheduling constraints.'),
  ('boston_ma', 'Boston metro market', 'northeast', 1.24, 1.11, 4, 4, 3, 4, 'Premium Northeast labor market with weather and dense urban permitting effects.'),
  ('new_york_ny', 'New York City metro market', 'northeast', 1.40, 1.20, 5, 5, 5, 4, 'Very high labor, code, and access costs in dense urban conditions.'),
  ('washington_dc', 'Washington DC metro market', 'northeast', 1.23, 1.10, 4, 4, 3, 3, 'High professional labor and stricter municipal review across dense neighborhoods.'),
  ('philadelphia_pa', 'Philadelphia metro market', 'northeast', 1.15, 1.06, 4, 4, 3, 4, 'Older housing stock and permit/code review can increase scope and contingency needs.')
on conflict (market_code) do update set
  market_name = excluded.market_name,
  region = excluded.region,
  labor_cost_index = excluded.labor_cost_index,
  material_cost_index = excluded.material_cost_index,
  permit_complexity = excluded.permit_complexity,
  code_complexity = excluded.code_complexity,
  access_complexity = excluded.access_complexity,
  weather_complexity = excluded.weather_complexity,
  pricing_notes = excluded.pricing_notes;

insert into public.zip_market_lookup (zip_prefix, market_code, city, state_code)
values
  ('021', 'boston_ma', 'Boston', 'MA'),
  ('100', 'new_york_ny', 'New York', 'NY'),
  ('101', 'new_york_ny', 'New York', 'NY'),
  ('191', 'philadelphia_pa', 'Philadelphia', 'PA'),
  ('200', 'washington_dc', 'Washington', 'DC'),
  ('303', 'atlanta_ga', 'Atlanta', 'GA'),
  ('331', 'miami_fl', 'Miami', 'FL'),
  ('441', 'cleveland_oh', 'Cleveland', 'OH'),
  ('606', 'chicago_il', 'Chicago', 'IL'),
  ('750', 'dallas_tx', 'Dallas', 'TX'),
  ('752', 'dallas_tx', 'Dallas', 'TX'),
  ('770', 'houston_tx', 'Houston', 'TX'),
  ('802', 'denver_co', 'Denver', 'CO'),
  ('850', 'phoenix_az', 'Phoenix', 'AZ'),
  ('900', 'los_angeles_ca', 'Los Angeles', 'CA'),
  ('941', 'san_francisco_ca', 'San Francisco', 'CA'),
  ('981', 'seattle_wa', 'Seattle', 'WA')
on conflict (zip_prefix) do update set
  market_code = excluded.market_code,
  city = excluded.city,
  state_code = excluded.state_code;