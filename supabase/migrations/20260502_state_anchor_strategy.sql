create table if not exists public.pricing_state_anchor_plans (
  state_code char(2) primary key,
  state_name text not null,
  anchor_tier text not null check (anchor_tier in ('tier_a', 'tier_b', 'tier_c')),
  target_anchor_count smallint not null check (target_anchor_count between 1 and 6),
  pricing_region text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_state_anchor_markets (
  id bigserial primary key,
  state_code char(2) not null references public.pricing_state_anchor_plans (state_code) on delete cascade,
  anchor_rank smallint not null check (anchor_rank between 1 and 6),
  anchor_market_code text not null,
  anchor_market_name text not null,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state_code, anchor_rank),
  unique (state_code, anchor_market_code)
);

create index if not exists idx_pricing_state_anchor_markets_state on public.pricing_state_anchor_markets (state_code);
create index if not exists idx_pricing_state_anchor_markets_primary on public.pricing_state_anchor_markets (state_code, is_primary);

-- This table is the ZIP3-to-state bridge used for deterministic state-level mapping.
-- Populate with authoritative ZIP prefix data in later rollout batches.
create table if not exists public.zip_prefix_state_lookup (
  zip_prefix char(3) primary key,
  state_code char(2) not null references public.pricing_state_anchor_plans (state_code) on delete cascade,
  city_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (zip_prefix ~ '^\d{3}$')
);

create index if not exists idx_zip_prefix_state_lookup_state on public.zip_prefix_state_lookup (state_code);

drop trigger if exists trg_pricing_state_anchor_plans_updated_at on public.pricing_state_anchor_plans;
create trigger trg_pricing_state_anchor_plans_updated_at
before update on public.pricing_state_anchor_plans
for each row
execute function public.handle_updated_at();

drop trigger if exists trg_pricing_state_anchor_markets_updated_at on public.pricing_state_anchor_markets;
create trigger trg_pricing_state_anchor_markets_updated_at
before update on public.pricing_state_anchor_markets
for each row
execute function public.handle_updated_at();

drop trigger if exists trg_zip_prefix_state_lookup_updated_at on public.zip_prefix_state_lookup;
create trigger trg_zip_prefix_state_lookup_updated_at
before update on public.zip_prefix_state_lookup
for each row
execute function public.handle_updated_at();

alter table public.pricing_state_anchor_plans enable row level security;
alter table public.pricing_state_anchor_markets enable row level security;
alter table public.zip_prefix_state_lookup enable row level security;

drop policy if exists "Service role manages state anchor plans" on public.pricing_state_anchor_plans;
create policy "Service role manages state anchor plans"
on public.pricing_state_anchor_plans
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role manages state anchor markets" on public.pricing_state_anchor_markets;
create policy "Service role manages state anchor markets"
on public.pricing_state_anchor_markets
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role manages zip prefix state lookup" on public.zip_prefix_state_lookup;
create policy "Service role manages zip prefix state lookup"
on public.zip_prefix_state_lookup
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ZIP3 assignment method:
-- 1) Maintain ZIP3 -> state in zip_prefix_state_lookup.
-- 2) Set one primary market per state in pricing_state_anchor_markets.
-- 3) Run this function to backfill missing zip_market_lookup rows using state primary anchors.
-- 4) Existing zip_market_lookup rows are preserved.
create or replace function public.apply_state_primary_anchor_to_zip_market_lookup()
returns integer
language plpgsql
security definer
as $$
declare
  affected_count integer := 0;
begin
  with primary_anchor as (
    select sam.state_code, sam.anchor_market_code
    from public.pricing_state_anchor_markets sam
    where sam.is_primary = true
  ),
  valid_anchor as (
    select pa.state_code, pa.anchor_market_code
    from primary_anchor pa
    join public.pricing_market_profiles p
      on p.market_code = pa.anchor_market_code
  ),
  to_insert as (
    select zps.zip_prefix, va.anchor_market_code as market_code, null::text as city, zps.state_code
    from public.zip_prefix_state_lookup zps
    join valid_anchor va on va.state_code = zps.state_code
    left join public.zip_market_lookup zml on zml.zip_prefix = zps.zip_prefix
    where zml.zip_prefix is null
  )
  insert into public.zip_market_lookup (zip_prefix, market_code, city, state_code)
  select zip_prefix, market_code, city, state_code
  from to_insert;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

insert into public.pricing_state_anchor_plans (
  state_code,
  state_name,
  anchor_tier,
  target_anchor_count,
  pricing_region,
  notes
)
values
  ('AL', 'Alabama', 'tier_c', 2, 'southeast', 'Use Birmingham as primary and Huntsville as secondary anchor.'),
  ('AK', 'Alaska', 'tier_b', 2, 'west_coast', 'Use Anchorage as primary and Juneau for remote logistics calibration.'),
  ('AZ', 'Arizona', 'tier_c', 2, 'southwest', 'Use Phoenix as primary and Tucson as secondary anchor.'),
  ('AR', 'Arkansas', 'tier_c', 2, 'south_central', 'Use Little Rock as primary and Northwest Arkansas as secondary anchor.'),
  ('CA', 'California', 'tier_a', 5, 'west_coast', 'Use multiple anchors across coastal and inland markets.'),
  ('CO', 'Colorado', 'tier_c', 2, 'mountain', 'Use Denver and Colorado Springs anchors.'),
  ('CT', 'Connecticut', 'tier_c', 2, 'northeast', 'Use Hartford as primary and New Haven as secondary anchor.'),
  ('DE', 'Delaware', 'tier_c', 2, 'northeast', 'Use Wilmington as primary and Dover as secondary anchor.'),
  ('FL', 'Florida', 'tier_a', 5, 'southeast', 'Use metro anchors for South, Central, North, and Gulf markets.'),
  ('GA', 'Georgia', 'tier_c', 2, 'southeast', 'Use Atlanta as primary and Savannah as secondary anchor.'),
  ('HI', 'Hawaii', 'tier_c', 2, 'west_coast', 'Use Honolulu as primary and Maui as secondary anchor.'),
  ('ID', 'Idaho', 'tier_c', 2, 'mountain', 'Use Boise as primary and Idaho Falls as secondary anchor.'),
  ('IL', 'Illinois', 'tier_c', 2, 'midwest', 'Use Chicago as primary and Springfield as secondary anchor.'),
  ('IN', 'Indiana', 'tier_c', 2, 'midwest', 'Use Indianapolis as primary and Fort Wayne as secondary anchor.'),
  ('IA', 'Iowa', 'tier_c', 2, 'midwest', 'Use Des Moines as primary and Cedar Rapids as secondary anchor.'),
  ('KS', 'Kansas', 'tier_c', 2, 'midwest', 'Use Wichita as primary and Kansas City metro (KS) as secondary anchor.'),
  ('KY', 'Kentucky', 'tier_c', 2, 'south_central', 'Use Louisville as primary and Lexington as secondary anchor.'),
  ('LA', 'Louisiana', 'tier_c', 2, 'south_central', 'Use New Orleans as primary and Baton Rouge as secondary anchor.'),
  ('ME', 'Maine', 'tier_c', 2, 'northeast', 'Use Portland as primary and Bangor as secondary anchor.'),
  ('MD', 'Maryland', 'tier_c', 2, 'northeast', 'Use Baltimore as primary and Frederick as secondary anchor.'),
  ('MA', 'Massachusetts', 'tier_c', 2, 'northeast', 'Use Boston as primary and Worcester as secondary anchor.'),
  ('MI', 'Michigan', 'tier_c', 2, 'midwest', 'Use Detroit as primary and Grand Rapids as secondary anchor.'),
  ('MN', 'Minnesota', 'tier_c', 2, 'midwest', 'Use Minneapolis as primary and Duluth as secondary anchor.'),
  ('MS', 'Mississippi', 'tier_c', 2, 'southeast', 'Use Jackson as primary and Gulfport as secondary anchor.'),
  ('MO', 'Missouri', 'tier_b', 2, 'midwest', 'Use Kansas City and St. Louis as dual anchors.'),
  ('MT', 'Montana', 'tier_c', 2, 'mountain', 'Use Billings as primary and Bozeman as secondary anchor.'),
  ('NE', 'Nebraska', 'tier_c', 2, 'midwest', 'Use Omaha as primary and Lincoln as secondary anchor.'),
  ('NV', 'Nevada', 'tier_c', 2, 'southwest', 'Use Las Vegas as primary and Reno as secondary anchor.'),
  ('NH', 'New Hampshire', 'tier_c', 2, 'northeast', 'Use Manchester as primary and Portsmouth as secondary anchor.'),
  ('NJ', 'New Jersey', 'tier_c', 2, 'northeast', 'Use Newark as primary and Trenton as secondary anchor.'),
  ('NM', 'New Mexico', 'tier_c', 2, 'southwest', 'Use Albuquerque as primary and Santa Fe as secondary anchor.'),
  ('NY', 'New York', 'tier_a', 5, 'northeast', 'Use NYC, Buffalo, Rochester, Albany, and Syracuse anchors.'),
  ('NC', 'North Carolina', 'tier_b', 2, 'southeast', 'Use Charlotte as primary and Raleigh as secondary anchor.'),
  ('ND', 'North Dakota', 'tier_c', 2, 'midwest', 'Use Fargo as primary and Bismarck as secondary anchor.'),
  ('OH', 'Ohio', 'tier_b', 3, 'midwest', 'Use Cleveland, Columbus, and Cincinnati anchors.'),
  ('OK', 'Oklahoma', 'tier_c', 2, 'south_central', 'Use Oklahoma City as primary and Tulsa as secondary anchor.'),
  ('OR', 'Oregon', 'tier_c', 2, 'west_coast', 'Use Portland as primary and Eugene as secondary anchor.'),
  ('PA', 'Pennsylvania', 'tier_b', 3, 'northeast', 'Use Philadelphia, Pittsburgh, and Harrisburg anchors.'),
  ('RI', 'Rhode Island', 'tier_c', 2, 'northeast', 'Use Providence as primary and Warwick as secondary anchor.'),
  ('SC', 'South Carolina', 'tier_c', 2, 'southeast', 'Use Charleston as primary and Columbia as secondary anchor.'),
  ('SD', 'South Dakota', 'tier_c', 2, 'midwest', 'Use Sioux Falls as primary and Rapid City as secondary anchor.'),
  ('TN', 'Tennessee', 'tier_b', 3, 'southeast', 'Use Nashville, Memphis, and Knoxville anchors.'),
  ('TX', 'Texas', 'tier_a', 5, 'south_central', 'Use Dallas, Houston, Austin, San Antonio, and El Paso anchors.'),
  ('UT', 'Utah', 'tier_c', 2, 'mountain', 'Use Salt Lake City as primary and St. George as secondary anchor.'),
  ('VT', 'Vermont', 'tier_c', 2, 'northeast', 'Use Burlington as primary and Montpelier as secondary anchor.'),
  ('VA', 'Virginia', 'tier_b', 3, 'southeast', 'Use Northern Virginia, Richmond, and Virginia Beach anchors.'),
  ('WA', 'Washington', 'tier_c', 2, 'west_coast', 'Use Seattle as primary and Spokane as secondary anchor.'),
  ('WV', 'West Virginia', 'tier_c', 2, 'southeast', 'Use Charleston as primary and Morgantown as secondary anchor.'),
  ('WI', 'Wisconsin', 'tier_c', 2, 'midwest', 'Use Milwaukee as primary and Madison as secondary anchor.'),
  ('WY', 'Wyoming', 'tier_c', 2, 'mountain', 'Use Cheyenne as primary and Casper as secondary anchor.')
on conflict (state_code) do update set
  state_name = excluded.state_name,
  anchor_tier = excluded.anchor_tier,
  target_anchor_count = excluded.target_anchor_count,
  pricing_region = excluded.pricing_region,
  notes = excluded.notes;

insert into public.pricing_state_anchor_markets (
  state_code,
  anchor_rank,
  anchor_market_code,
  anchor_market_name,
  is_primary,
  notes
)
values
  ('AL', 1, 'birmingham_al', 'Birmingham metro market', true, 'Primary anchor.'),
  ('AL', 2, 'huntsville_al', 'Huntsville metro market', false, 'Secondary anchor.'),
  ('AK', 1, 'anchorage_ak', 'Anchorage metro market', true, 'Primary anchor.'),
  ('AK', 2, 'juneau_ak', 'Juneau market', false, 'Secondary anchor.'),
  ('AZ', 1, 'phoenix_az', 'Phoenix metro market', true, 'Primary anchor.'),
  ('AZ', 2, 'tucson_az', 'Tucson metro market', false, 'Secondary anchor.'),
  ('AR', 1, 'little_rock_ar', 'Little Rock metro market', true, 'Primary anchor.'),
  ('AR', 2, 'fayetteville_ar', 'Northwest Arkansas market', false, 'Secondary anchor.'),
  ('CA', 1, 'los_angeles_ca', 'Los Angeles metro market', true, 'Primary anchor.'),
  ('CA', 2, 'san_francisco_ca', 'San Francisco metro market', false, 'Secondary anchor.'),
  ('CA', 3, 'san_diego_ca', 'San Diego metro market', false, 'Secondary anchor.'),
  ('CA', 4, 'sacramento_ca', 'Sacramento metro market', false, 'Secondary anchor.'),
  ('CA', 5, 'fresno_ca', 'Fresno metro market', false, 'Secondary anchor.'),
  ('CO', 1, 'denver_co', 'Denver metro market', true, 'Primary anchor.'),
  ('CO', 2, 'colorado_springs_co', 'Colorado Springs metro market', false, 'Secondary anchor.'),
  ('CT', 1, 'hartford_ct', 'Hartford metro market', true, 'Primary anchor.'),
  ('CT', 2, 'new_haven_ct', 'New Haven metro market', false, 'Secondary anchor.'),
  ('DE', 1, 'wilmington_de', 'Wilmington metro market', true, 'Primary anchor.'),
  ('DE', 2, 'dover_de', 'Dover market', false, 'Secondary anchor.'),
  ('FL', 1, 'miami_fl', 'Miami metro market', true, 'Primary anchor.'),
  ('FL', 2, 'orlando_fl', 'Orlando metro market', false, 'Secondary anchor.'),
  ('FL', 3, 'tampa_fl', 'Tampa metro market', false, 'Secondary anchor.'),
  ('FL', 4, 'jacksonville_fl', 'Jacksonville metro market', false, 'Secondary anchor.'),
  ('FL', 5, 'fort_myers_fl', 'Fort Myers metro market', false, 'Secondary anchor.'),
  ('GA', 1, 'atlanta_ga', 'Atlanta metro market', true, 'Primary anchor.'),
  ('GA', 2, 'savannah_ga', 'Savannah metro market', false, 'Secondary anchor.'),
  ('HI', 1, 'honolulu_hi', 'Honolulu metro market', true, 'Primary anchor.'),
  ('HI', 2, 'kahului_hi', 'Kahului market', false, 'Secondary anchor.'),
  ('ID', 1, 'boise_id', 'Boise metro market', true, 'Primary anchor.'),
  ('ID', 2, 'idaho_falls_id', 'Idaho Falls market', false, 'Secondary anchor.'),
  ('IL', 1, 'chicago_il', 'Chicago metro market', true, 'Primary anchor.'),
  ('IL', 2, 'springfield_il', 'Springfield market', false, 'Secondary anchor.'),
  ('IN', 1, 'indianapolis_in', 'Indianapolis metro market', true, 'Primary anchor.'),
  ('IN', 2, 'fort_wayne_in', 'Fort Wayne metro market', false, 'Secondary anchor.'),
  ('IA', 1, 'des_moines_ia', 'Des Moines metro market', true, 'Primary anchor.'),
  ('IA', 2, 'cedar_rapids_ia', 'Cedar Rapids metro market', false, 'Secondary anchor.'),
  ('KS', 1, 'wichita_ks', 'Wichita metro market', true, 'Primary anchor.'),
  ('KS', 2, 'overland_park_ks', 'Kansas City metro (KS) market', false, 'Secondary anchor.'),
  ('KY', 1, 'louisville_ky', 'Louisville metro market', true, 'Primary anchor.'),
  ('KY', 2, 'lexington_ky', 'Lexington metro market', false, 'Secondary anchor.'),
  ('LA', 1, 'new_orleans_la', 'New Orleans metro market', true, 'Primary anchor.'),
  ('LA', 2, 'baton_rouge_la', 'Baton Rouge metro market', false, 'Secondary anchor.'),
  ('ME', 1, 'portland_me', 'Portland metro market', true, 'Primary anchor.'),
  ('ME', 2, 'bangor_me', 'Bangor market', false, 'Secondary anchor.'),
  ('MD', 1, 'baltimore_md', 'Baltimore metro market', true, 'Primary anchor.'),
  ('MD', 2, 'frederick_md', 'Frederick market', false, 'Secondary anchor.'),
  ('MA', 1, 'boston_ma', 'Boston metro market', true, 'Primary anchor.'),
  ('MA', 2, 'worcester_ma', 'Worcester metro market', false, 'Secondary anchor.'),
  ('MI', 1, 'detroit_mi', 'Detroit metro market', true, 'Primary anchor.'),
  ('MI', 2, 'grand_rapids_mi', 'Grand Rapids metro market', false, 'Secondary anchor.'),
  ('MN', 1, 'minneapolis_mn', 'Minneapolis metro market', true, 'Primary anchor.'),
  ('MN', 2, 'duluth_mn', 'Duluth market', false, 'Secondary anchor.'),
  ('MS', 1, 'jackson_ms', 'Jackson metro market', true, 'Primary anchor.'),
  ('MS', 2, 'gulfport_ms', 'Gulfport market', false, 'Secondary anchor.'),
  ('MO', 1, 'kansas_city_mo', 'Kansas City metro market', true, 'Primary anchor.'),
  ('MO', 2, 'st_louis_mo', 'St. Louis metro market', false, 'Secondary anchor.'),
  ('MT', 1, 'billings_mt', 'Billings market', true, 'Primary anchor.'),
  ('MT', 2, 'bozeman_mt', 'Bozeman market', false, 'Secondary anchor.'),
  ('NE', 1, 'omaha_ne', 'Omaha metro market', true, 'Primary anchor.'),
  ('NE', 2, 'lincoln_ne', 'Lincoln metro market', false, 'Secondary anchor.'),
  ('NV', 1, 'las_vegas_nv', 'Las Vegas metro market', true, 'Primary anchor.'),
  ('NV', 2, 'reno_nv', 'Reno metro market', false, 'Secondary anchor.'),
  ('NH', 1, 'manchester_nh', 'Manchester metro market', true, 'Primary anchor.'),
  ('NH', 2, 'portsmouth_nh', 'Portsmouth market', false, 'Secondary anchor.'),
  ('NJ', 1, 'newark_nj', 'Newark metro market', true, 'Primary anchor.'),
  ('NJ', 2, 'trenton_nj', 'Trenton market', false, 'Secondary anchor.'),
  ('NM', 1, 'albuquerque_nm', 'Albuquerque metro market', true, 'Primary anchor.'),
  ('NM', 2, 'santa_fe_nm', 'Santa Fe market', false, 'Secondary anchor.'),
  ('NY', 1, 'new_york_ny', 'New York City metro market', true, 'Primary anchor.'),
  ('NY', 2, 'buffalo_ny', 'Buffalo metro market', false, 'Secondary anchor.'),
  ('NY', 3, 'rochester_ny', 'Rochester metro market', false, 'Secondary anchor.'),
  ('NY', 4, 'albany_ny', 'Albany metro market', false, 'Secondary anchor.'),
  ('NY', 5, 'syracuse_ny', 'Syracuse metro market', false, 'Secondary anchor.'),
  ('NC', 1, 'charlotte_nc', 'Charlotte metro market', true, 'Primary anchor.'),
  ('NC', 2, 'raleigh_nc', 'Raleigh metro market', false, 'Secondary anchor.'),
  ('ND', 1, 'fargo_nd', 'Fargo metro market', true, 'Primary anchor.'),
  ('ND', 2, 'bismarck_nd', 'Bismarck market', false, 'Secondary anchor.'),
  ('OH', 1, 'cleveland_oh', 'Cleveland metro market', true, 'Primary anchor.'),
  ('OH', 2, 'columbus_oh', 'Columbus metro market', false, 'Secondary anchor.'),
  ('OH', 3, 'cincinnati_oh', 'Cincinnati metro market', false, 'Secondary anchor.'),
  ('OK', 1, 'oklahoma_city_ok', 'Oklahoma City metro market', true, 'Primary anchor.'),
  ('OK', 2, 'tulsa_ok', 'Tulsa metro market', false, 'Secondary anchor.'),
  ('OR', 1, 'portland_or', 'Portland metro market', true, 'Primary anchor.'),
  ('OR', 2, 'eugene_or', 'Eugene metro market', false, 'Secondary anchor.'),
  ('PA', 1, 'philadelphia_pa', 'Philadelphia metro market', true, 'Primary anchor.'),
  ('PA', 2, 'pittsburgh_pa', 'Pittsburgh metro market', false, 'Secondary anchor.'),
  ('PA', 3, 'harrisburg_pa', 'Harrisburg market', false, 'Secondary anchor.'),
  ('RI', 1, 'providence_ri', 'Providence metro market', true, 'Primary anchor.'),
  ('RI', 2, 'warwick_ri', 'Warwick market', false, 'Secondary anchor.'),
  ('SC', 1, 'charleston_sc', 'Charleston metro market', true, 'Primary anchor.'),
  ('SC', 2, 'columbia_sc', 'Columbia metro market', false, 'Secondary anchor.'),
  ('SD', 1, 'sioux_falls_sd', 'Sioux Falls metro market', true, 'Primary anchor.'),
  ('SD', 2, 'rapid_city_sd', 'Rapid City metro market', false, 'Secondary anchor.'),
  ('TN', 1, 'nashville_tn', 'Nashville metro market', true, 'Primary anchor.'),
  ('TN', 2, 'memphis_tn', 'Memphis metro market', false, 'Secondary anchor.'),
  ('TN', 3, 'knoxville_tn', 'Knoxville metro market', false, 'Secondary anchor.'),
  ('TX', 1, 'dallas_tx', 'Dallas metro market', true, 'Primary anchor.'),
  ('TX', 2, 'houston_tx', 'Houston metro market', false, 'Secondary anchor.'),
  ('TX', 3, 'austin_tx', 'Austin metro market', false, 'Secondary anchor.'),
  ('TX', 4, 'san_antonio_tx', 'San Antonio metro market', false, 'Secondary anchor.'),
  ('TX', 5, 'el_paso_tx', 'El Paso metro market', false, 'Secondary anchor.'),
  ('UT', 1, 'salt_lake_city_ut', 'Salt Lake City metro market', true, 'Primary anchor.'),
  ('UT', 2, 'st_george_ut', 'St. George market', false, 'Secondary anchor.'),
  ('VT', 1, 'burlington_vt', 'Burlington market', true, 'Primary anchor.'),
  ('VT', 2, 'montpelier_vt', 'Montpelier market', false, 'Secondary anchor.'),
  ('VA', 1, 'northern_virginia_va', 'Northern Virginia metro market', true, 'Primary anchor.'),
  ('VA', 2, 'richmond_va', 'Richmond metro market', false, 'Secondary anchor.'),
  ('VA', 3, 'virginia_beach_va', 'Virginia Beach metro market', false, 'Secondary anchor.'),
  ('WA', 1, 'seattle_wa', 'Seattle metro market', true, 'Primary anchor.'),
  ('WA', 2, 'spokane_wa', 'Spokane metro market', false, 'Secondary anchor.'),
  ('WV', 1, 'charleston_wv', 'Charleston market', true, 'Primary anchor.'),
  ('WV', 2, 'morgantown_wv', 'Morgantown market', false, 'Secondary anchor.'),
  ('WI', 1, 'milwaukee_wi', 'Milwaukee metro market', true, 'Primary anchor.'),
  ('WI', 2, 'madison_wi', 'Madison metro market', false, 'Secondary anchor.'),
  ('WY', 1, 'cheyenne_wy', 'Cheyenne market', true, 'Primary anchor.'),
  ('WY', 2, 'casper_wy', 'Casper market', false, 'Secondary anchor.')
on conflict (state_code, anchor_market_code) do update set
  anchor_rank = excluded.anchor_rank,
  anchor_market_name = excluded.anchor_market_name,
  is_primary = excluded.is_primary,
  notes = excluded.notes;
