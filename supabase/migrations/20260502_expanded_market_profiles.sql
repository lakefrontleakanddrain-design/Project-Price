-- New market profiles for all state anchor cities not already in pricing_market_profiles.
-- Existing profiles (cleveland_oh, chicago_il, dallas_tx, houston_tx, miami_fl, atlanta_ga,
-- denver_co, phoenix_az, los_angeles_ca, san_francisco_ca, seattle_wa, boston_ma,
-- new_york_ny, washington_dc, philadelphia_pa) are preserved via ON CONFLICT DO UPDATE.

insert into public.pricing_market_profiles (
  market_code, market_name, region,
  labor_cost_index, material_cost_index,
  permit_complexity, code_complexity, access_complexity, weather_complexity,
  pricing_notes
)
values
  -- ALABAMA
  ('birmingham_al','Birmingham metro market','southeast',0.93,0.95,3,3,2,3,'Moderate Southeast labor market with standard permitting and humidity-driven maintenance considerations.'),
  ('huntsville_al','Huntsville metro market','southeast',0.95,0.96,3,3,2,3,'Growing tech-corridor market with slightly elevated labor demand and standard code review.'),

  -- ALASKA
  ('anchorage_ak','Anchorage metro market','west_coast',1.38,1.30,4,4,4,5,'Very high material logistics costs, extreme weather constraints, and permafrost access considerations.'),
  ('juneau_ak','Juneau market','west_coast',1.45,1.40,4,4,5,5,'Remote coastal access with ferry/air logistics for materials and premium labor scarcity.'),

  -- ARIZONA
  ('tucson_az','Tucson metro market','southwest',1.00,0.99,3,3,2,2,'Balanced Southwest market with heat and utility-related project impacts.'),

  -- ARKANSAS
  ('little_rock_ar','Little Rock metro market','south_central',0.91,0.94,3,3,2,3,'Cost-effective South Central market with moderate permitting and standard labor availability.'),
  ('fayetteville_ar','Northwest Arkansas market','south_central',0.94,0.95,3,3,2,3,'Growing NW Arkansas corridor with moderate suburban construction demand.'),

  -- CALIFORNIA
  ('san_diego_ca','San Diego metro market','west_coast',1.25,1.14,4,5,3,2,'Premium coastal California market with strong code enforcement and steady construction demand.'),
  ('sacramento_ca','Sacramento metro market','west_coast',1.15,1.08,4,4,3,2,'Inland California hub with elevated labor and permit requirements relative to national baseline.'),
  ('fresno_ca','Fresno metro market','west_coast',1.06,1.03,3,3,2,2,'Central Valley market with moderate labor and permitting relative to coastal California.'),

  -- COLORADO
  ('colorado_springs_co','Colorado Springs metro market','mountain',1.05,1.02,3,3,3,4,'Front Range secondary market with weather and elevation access considerations.'),

  -- CONNECTICUT
  ('hartford_ct','Hartford metro market','northeast',1.16,1.07,4,4,3,4,'Dense Northeast market with older housing stock and elevated code and permit friction.'),
  ('new_haven_ct','New Haven metro market','northeast',1.18,1.08,4,4,3,4,'Similar to Hartford with additional urban access complexity near Yale campus district.'),

  -- DELAWARE
  ('wilmington_de','Wilmington metro market','northeast',1.12,1.05,4,4,3,3,'Smaller Northeast market with mid-range labor and standard suburban permitting.'),
  ('dover_de','Dover market','northeast',1.05,1.02,3,3,2,3,'State capital market with moderate costs and standard code requirements.'),

  -- FLORIDA
  ('orlando_fl','Orlando metro market','southeast',1.06,1.03,3,3,2,3,'High-growth Central Florida market with moderate labor demand and hurricane-prep considerations.'),
  ('tampa_fl','Tampa metro market','southeast',1.08,1.04,3,3,2,3,'Gulf Coast growth market with storm resilience requirements and moderate permit friction.'),
  ('jacksonville_fl','Jacksonville metro market','southeast',1.02,1.00,3,3,2,3,'Balanced North Florida market with moderate labor and standard coastal code requirements.'),
  ('fort_myers_fl','Fort Myers metro market','southeast',1.10,1.06,3,3,2,3,'Southwest Florida coastal market with hurricane-code requirements and seasonal demand spikes.'),

  -- GEORGIA
  ('savannah_ga','Savannah metro market','southeast',1.00,0.98,3,3,2,3,'Historic coastal market with moderate labor and humidity-driven project scope considerations.'),

  -- HAWAII
  ('honolulu_hi','Honolulu metro market','west_coast',1.48,1.42,4,4,5,2,'Very high island logistics, labor scarcity, and strict seismic and coastal code enforcement.'),
  ('kahului_hi','Kahului market','west_coast',1.50,1.45,4,4,5,2,'Maui market with highest material logistics premium and constrained labor supply.'),

  -- IDAHO
  ('boise_id','Boise metro market','mountain',1.05,1.01,3,3,3,4,'Fast-growing intermountain market with moderate labor premium and weather access constraints.'),
  ('idaho_falls_id','Idaho Falls market','mountain',1.02,1.00,3,3,3,4,'Eastern Idaho market with standard mountain-region assumptions and rural access considerations.'),

  -- INDIANA
  ('indianapolis_in','Indianapolis metro market','midwest',0.98,0.97,3,3,2,4,'Balanced Midwest market with moderate labor and standard suburban permitting.'),
  ('fort_wayne_in','Fort Wayne metro market','midwest',0.95,0.96,3,3,2,4,'Smaller Indiana market with competitive labor rates and standard code review.'),

  -- IOWA
  ('des_moines_ia','Des Moines metro market','midwest',0.97,0.97,3,3,2,4,'Stable Midwest market with moderate labor and standard municipal permitting.'),
  ('cedar_rapids_ia','Cedar Rapids metro market','midwest',0.95,0.96,3,3,2,4,'Secondary Iowa market with slightly lower labor premiums and standard permitting.'),

  -- KANSAS
  ('wichita_ks','Wichita metro market','midwest',0.94,0.95,3,3,2,3,'Cost-effective South-Central Kansas market with moderate labor and standard municipal review.'),
  ('overland_park_ks','Kansas City metro (KS) market','midwest',1.02,1.00,3,3,2,3,'Kansas side of KC metro sharing labor pool with Missouri side.'),

  -- KENTUCKY
  ('louisville_ky','Louisville metro market','south_central',0.97,0.97,3,3,2,3,'Balanced border-state market with moderate labor and standard permitting.'),
  ('lexington_ky','Lexington metro market','south_central',0.95,0.96,3,3,2,3,'Secondary Kentucky market with similar cost profile to Louisville.'),

  -- LOUISIANA
  ('new_orleans_la','New Orleans metro market','south_central',1.05,1.06,4,4,3,4,'Flood-zone and hurricane-code requirements add project contingency and permitting friction.'),
  ('baton_rouge_la','Baton Rouge metro market','south_central',1.00,1.01,3,3,2,3,'State capital market with moderate labor and standard coastal-region code requirements.'),

  -- MAINE
  ('portland_me','Portland metro market','northeast',1.10,1.05,3,3,3,5,'Coastal New England market with weather-driven seasonality and moderate labor premiums.'),
  ('bangor_me','Bangor market','northeast',1.05,1.02,3,3,3,5,'Northern Maine market with remote access and severe winter seasonality impacts.'),

  -- MARYLAND
  ('baltimore_md','Baltimore metro market','northeast',1.14,1.06,4,4,3,3,'Dense urban Mid-Atlantic market with elevated labor and code review friction.'),
  ('frederick_md','Frederick market','northeast',1.08,1.03,3,3,2,3,'Suburban Maryland market with moderate costs and standard permitting.'),

  -- MASSACHUSETTS
  ('worcester_ma','Worcester metro market','northeast',1.19,1.08,4,4,3,4,'Secondary Massachusetts market with elevated labor and older housing stock costs.'),

  -- MICHIGAN
  ('detroit_mi','Detroit metro market','midwest',1.05,1.01,3,3,2,4,'Major Midwest market with aging housing stock driving higher renovation scope and labor.'),
  ('grand_rapids_mi','Grand Rapids metro market','midwest',1.00,0.99,3,3,2,4,'Western Michigan market with moderate labor and standard municipal permitting.'),

  -- MINNESOTA
  ('minneapolis_mn','Minneapolis metro market','midwest',1.08,1.03,4,3,2,5,'Northern climate market with significant winter seasonality and elevated labor premiums.'),
  ('duluth_mn','Duluth market','midwest',1.05,1.02,3,3,3,5,'Lakehead market with extreme weather impacts and moderate labor access constraints.'),

  -- MISSISSIPPI
  ('jackson_ms','Jackson metro market','southeast',0.88,0.93,3,3,2,3,'Low-cost Southeast market with cost-effective labor and standard permitting.'),
  ('gulfport_ms','Gulfport market','southeast',0.91,0.94,3,3,2,4,'Gulf Coast Mississippi market with hurricane-prep considerations.'),

  -- MISSOURI
  ('kansas_city_mo','Kansas City metro market','midwest',1.01,0.99,3,3,2,3,'Balanced bi-state metro market with moderate labor and standard permitting.'),
  ('st_louis_mo','St. Louis metro market','midwest',1.03,1.00,3,3,2,4,'Major Missouri market with moderate labor premiums and aging urban housing stock.'),

  -- MONTANA
  ('billings_mt','Billings market','mountain',1.06,1.03,3,3,4,5,'Largest Montana market with rural access constraints and severe weather seasonality.'),
  ('bozeman_mt','Bozeman market','mountain',1.10,1.05,3,3,4,5,'High-growth mountain resort market with elevated labor demand and access constraints.'),

  -- NEBRASKA
  ('omaha_ne','Omaha metro market','midwest',0.97,0.97,3,3,2,4,'Stable Great Plains market with moderate labor and standard municipal permitting.'),
  ('lincoln_ne','Lincoln metro market','midwest',0.95,0.96,3,3,2,4,'Secondary Nebraska market with similar cost profile to Omaha.'),

  -- NEVADA
  ('las_vegas_nv','Las Vegas metro market','southwest',1.08,1.04,3,3,2,2,'High-activity construction market with heat and utility-upgrade project considerations.'),
  ('reno_nv','Reno metro market','southwest',1.10,1.05,3,3,3,3,'Growing Northern Nevada market with elevated labor demand and access constraints.'),

  -- NEW HAMPSHIRE
  ('manchester_nh','Manchester metro market','northeast',1.12,1.05,3,4,3,4,'Southern NH market with moderate Northeast labor premium and weather seasonality.'),
  ('portsmouth_nh','Portsmouth market','northeast',1.15,1.07,3,4,3,4,'Seacoast market with similar profile to Manchester but coastal access considerations.'),

  -- NEW JERSEY
  ('newark_nj','Newark metro market','northeast',1.32,1.15,5,5,4,4,'Dense urban Northeast market with NYC-adjacent labor premiums and high permit friction.'),
  ('trenton_nj','Trenton market','northeast',1.18,1.07,4,4,3,3,'Central NJ market with elevated but sub-Newark labor costs.'),

  -- NEW MEXICO
  ('albuquerque_nm','Albuquerque metro market','southwest',1.00,0.99,3,3,3,2,'Moderate Southwest market with heat and altitude access considerations.'),
  ('santa_fe_nm','Santa Fe market','southwest',1.06,1.03,3,3,3,2,'Upscale historic market with premium labor demand and historic district code constraints.'),

  -- NEW YORK (non-NYC)
  ('buffalo_ny','Buffalo metro market','northeast',1.10,1.04,4,4,3,5,'Western NY market with aging housing stock, high snow load, and moderate labor premiums.'),
  ('rochester_ny','Rochester metro market','northeast',1.08,1.03,4,4,3,5,'Secondary upstate NY market with similar profile to Buffalo.'),
  ('albany_ny','Albany metro market','northeast',1.12,1.05,4,4,3,5,'State capital market with moderate labor premium and Northeast weather seasonality.'),
  ('syracuse_ny','Syracuse metro market','northeast',1.07,1.03,4,4,3,5,'Central NY market with aging infrastructure and severe winter constraints.'),

  -- NORTH CAROLINA
  ('charlotte_nc','Charlotte metro market','southeast',1.05,1.01,3,3,2,2,'Fast-growing Southeast metro with moderate labor premiums and standard permitting.'),
  ('raleigh_nc','Raleigh metro market','southeast',1.06,1.02,3,3,2,2,'Research Triangle market with strong construction demand and moderate labor costs.'),

  -- NORTH DAKOTA
  ('fargo_nd','Fargo metro market','midwest',1.02,1.01,3,3,2,5,'Northern Plains market with severe winter seasonality and moderate labor premiums.'),
  ('bismarck_nd','Bismarck market','midwest',1.00,1.00,3,3,2,5,'State capital Plains market with standard costs and extreme weather access constraints.'),

  -- OHIO
  ('columbus_oh','Columbus metro market','midwest',0.99,0.98,3,3,2,4,'Growing Ohio capital market with moderate labor and standard municipal permitting.'),
  ('cincinnati_oh','Cincinnati metro market','midwest',1.00,0.99,3,3,2,4,'Tri-state metro market with moderate labor and standard code review.'),

  -- OKLAHOMA
  ('oklahoma_city_ok','Oklahoma City metro market','south_central',0.94,0.96,3,3,2,3,'Cost-effective Plains market with moderate labor and standard permitting.'),
  ('tulsa_ok','Tulsa metro market','south_central',0.95,0.96,3,3,2,3,'Secondary Oklahoma market with similar cost profile to OKC.'),

  -- OREGON
  ('portland_or','Portland metro market','west_coast',1.18,1.08,4,4,3,3,'Pacific Northwest market with elevated labor, permit friction, and weather scheduling impacts.'),
  ('eugene_or','Eugene metro market','west_coast',1.10,1.04,3,3,3,3,'Secondary Oregon market with moderate labor premium relative to Portland.'),

  -- PENNSYLVANIA
  ('pittsburgh_pa','Pittsburgh metro market','northeast',1.10,1.04,4,4,3,4,'Western PA market with aging housing stock and moderate Northeast labor premiums.'),
  ('harrisburg_pa','Harrisburg market','northeast',1.06,1.02,3,3,2,3,'Central PA market with moderate costs and standard permitting.'),

  -- RHODE ISLAND
  ('providence_ri','Providence metro market','northeast',1.18,1.08,4,4,3,4,'Dense coastal New England market with older housing stock and elevated labor premiums.'),
  ('warwick_ri','Warwick market','northeast',1.15,1.07,4,4,3,4,'Suburban RI market with similar profile to Providence.'),

  -- SOUTH CAROLINA
  ('charleston_sc','Charleston metro market','southeast',1.06,1.03,3,3,2,3,'Coastal historic market with hurricane-prep code requirements and growing construction demand.'),
  ('columbia_sc','Columbia metro market','southeast',0.97,0.97,3,3,2,3,'Inland SC capital market with moderate costs and standard permitting.'),

  -- SOUTH DAKOTA
  ('sioux_falls_sd','Sioux Falls metro market','midwest',0.98,0.98,3,3,2,5,'Largest SD market with moderate labor and severe winter scheduling constraints.'),
  ('rapid_city_sd','Rapid City metro market','midwest',1.00,1.00,3,3,3,5,'Western SD market with moderate labor and access constraints.'),

  -- TENNESSEE
  ('nashville_tn','Nashville metro market','southeast',1.06,1.02,3,3,2,3,'Fast-growing Southeast metro with moderate labor premium and standard permitting.'),
  ('memphis_tn','Memphis metro market','southeast',0.96,0.97,3,3,2,3,'Cost-effective West Tennessee market with moderate labor availability.'),
  ('knoxville_tn','Knoxville metro market','southeast',0.95,0.96,3,3,2,3,'East Tennessee market with competitive labor rates and standard code review.'),

  -- TEXAS (non-Dallas/Houston)
  ('austin_tx','Austin metro market','south_central',1.10,1.04,3,3,2,2,'High-growth Texas capital with labor demand premium and moderate permitting.'),
  ('san_antonio_tx','San Antonio metro market','south_central',1.01,1.00,3,3,2,2,'Balanced major Texas market with moderate labor and standard permitting.'),
  ('el_paso_tx','El Paso metro market','south_central',0.93,0.95,3,3,3,2,'Border market with cost-effective labor and moderate code requirements.'),

  -- UTAH
  ('salt_lake_city_ut','Salt Lake City metro market','mountain',1.07,1.03,3,3,3,4,'Intermountain hub with growing labor demand and weather access constraints.'),
  ('st_george_ut','St. George market','mountain',1.04,1.01,3,3,3,2,'Southern Utah growth market with heat and standard mountain-region permitting.'),

  -- VERMONT
  ('burlington_vt','Burlington market','northeast',1.12,1.06,3,4,3,5,'Northern New England market with severe winter seasonality and moderate labor premium.'),
  ('montpelier_vt','Montpelier market','northeast',1.08,1.04,3,3,3,5,'Small state capital market with rural access and extreme weather constraints.'),

  -- VIRGINIA
  ('northern_virginia_va','Northern Virginia metro market','northeast',1.23,1.10,4,4,3,3,'DC-adjacent market with high professional labor and dense suburban permitting requirements.'),
  ('richmond_va','Richmond metro market','southeast',1.05,1.01,3,3,2,3,'Mid-Atlantic state capital with moderate labor premium and standard permitting.'),
  ('virginia_beach_va','Virginia Beach metro market','southeast',1.06,1.03,3,3,2,3,'Coastal Hampton Roads market with hurricane-prep code and moderate labor premium.'),

  -- WEST VIRGINIA
  ('charleston_wv','Charleston market','southeast',0.94,0.96,3,3,3,4,'Low-cost market with mountain access constraints and moderate labor availability.'),
  ('morgantown_wv','Morgantown market','southeast',0.96,0.97,3,3,3,4,'University-town market with moderate labor and standard regional code review.'),

  -- WISCONSIN
  ('milwaukee_wi','Milwaukee metro market','midwest',1.04,1.01,3,3,2,5,'Major Wisconsin market with moderate labor premium and severe winter seasonality.'),
  ('madison_wi','Madison metro market','midwest',1.05,1.02,3,3,2,5,'State capital and university market with moderate labor demand.'),

  -- WYOMING
  ('cheyenne_wy','Cheyenne market','mountain',1.04,1.02,3,3,3,5,'State capital with moderate labor and severe wind and winter weather constraints.'),
  ('casper_wy','Casper market','mountain',1.06,1.03,3,3,4,5,'Central Wyoming market with energy-sector labor influence and remote access constraints.')

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
