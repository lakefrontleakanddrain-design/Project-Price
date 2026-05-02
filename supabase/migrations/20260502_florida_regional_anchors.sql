-- Florida regional anchor refinement.
-- Adds Panama City as Panhandle anchor and inserts direct zip_market_lookup overrides
-- to route each Florida region to the correct anchor instead of defaulting to miami_fl.

-- 1. New market profile: Panama City (Panhandle anchor)
insert into public.pricing_market_profiles (
  market_code, market_name, region,
  labor_cost_index, material_cost_index,
  permit_complexity, code_complexity, access_complexity, weather_complexity,
  pricing_notes
)
values (
  'panama_city_fl',
  'Panama City metro market',
  'southeast',
  1.06, 1.05, 3, 4, 2, 4,
  'Gulf Coast beach resort market. Hurricane and coastal construction codes add permit friction. Tourism-driven seasonal labor demand. Material access similar to greater FL but inland delivery premiums apply.'
)
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

-- 2. Add Panama City as FL anchor rank 6
insert into public.pricing_state_anchor_markets (state_code, anchor_rank, anchor_market_code, anchor_market_name, is_primary, notes)
values ('FL', 6, 'panama_city_fl', 'Panama City metro market', false, 'Panhandle anchor covering 324-325.')
on conflict (state_code, anchor_market_code) do update set
  anchor_rank = excluded.anchor_rank,
  anchor_market_name = excluded.anchor_market_name,
  is_primary = excluded.is_primary,
  notes = excluded.notes;

-- 3. Direct zip_market_lookup overrides for Florida regional routing.
-- ON CONFLICT DO UPDATE so these overwrite the miami_fl defaults written by the mapping function.

insert into public.zip_market_lookup (zip_prefix, market_code, city, state_code)
values
  -- PANHANDLE (Panama City anchor): Pensacola, Fort Walton, Panama City
  ('324', 'panama_city_fl', 'Panama City', 'FL'),
  ('325', 'panama_city_fl', 'Pensacola', 'FL'),

  -- NORTH FLORIDA / TALLAHASSEE (Jacksonville anchor)
  ('320', 'jacksonville_fl', 'Jacksonville', 'FL'),
  ('321', 'jacksonville_fl', 'Jacksonville', 'FL'),
  ('322', 'jacksonville_fl', 'Jacksonville', 'FL'),
  ('323', 'jacksonville_fl', 'Tallahassee', 'FL'),
  ('326', 'jacksonville_fl', 'Gainesville', 'FL'),

  -- CENTRAL FLORIDA (Orlando anchor)
  ('327', 'orlando_fl', 'Orlando', 'FL'),
  ('328', 'orlando_fl', 'Orlando', 'FL'),
  ('329', 'orlando_fl', 'Melbourne', 'FL'),
  ('347', 'orlando_fl', 'Orlando', 'FL'),

  -- TAMPA / GULF COAST (Tampa anchor)
  ('335', 'tampa_fl', 'Tampa', 'FL'),
  ('336', 'tampa_fl', 'Tampa', 'FL'),
  ('337', 'tampa_fl', 'St. Petersburg', 'FL'),
  ('338', 'tampa_fl', 'Lakeland', 'FL'),
  ('344', 'tampa_fl', 'Ocala', 'FL'),
  ('346', 'tampa_fl', 'Tampa', 'FL'),

  -- SOUTHWEST FLORIDA (Fort Myers anchor)
  ('339', 'fort_myers_fl', 'Fort Myers', 'FL'),
  ('341', 'fort_myers_fl', 'Fort Myers', 'FL'),
  ('342', 'fort_myers_fl', 'Sarasota', 'FL'),
  ('349', 'fort_myers_fl', 'Fort Myers', 'FL'),

  -- SOUTH FLORIDA / MIAMI (Miami anchor) — already correct but explicit for clarity
  ('330', 'miami_fl', 'Miami', 'FL'),
  ('331', 'miami_fl', 'Miami', 'FL'),
  ('332', 'miami_fl', 'Miami', 'FL'),
  ('333', 'miami_fl', 'Fort Lauderdale', 'FL'),
  ('334', 'miami_fl', 'West Palm Beach', 'FL'),
  ('340', 'miami_fl', 'Miami', 'FL')

on conflict (zip_prefix) do update set
  market_code = excluded.market_code,
  city = excluded.city,
  state_code = excluded.state_code;
