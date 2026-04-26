-- Geofence-aware professional matching for waterfall selection.

create or replace function public.match_professionals(
  p_zip_code text,
  p_specialty text,
  p_lat numeric default null,
  p_lng numeric default null,
  p_limit integer default 3
)
returns table (
  professional_id uuid,
  distance_km numeric,
  zip_match boolean
)
language sql
stable
as $$
  with pro_candidates as (
    select
      p.id as professional_id,
      p.service_radius_km,
      p.service_center_lat,
      p.service_center_lng,
      (p.service_zip_codes @> array[p_zip_code]) as zip_match,
      case
        when p_lat is null
          or p_lng is null
          or p.service_center_lat is null
          or p.service_center_lng is null
        then null
        else (
          6371 * acos(
            least(
              1,
              greatest(
                -1,
                cos(radians(p_lat::float8))
                * cos(radians(p.service_center_lat::float8))
                * cos(radians((p.service_center_lng - p_lng)::float8))
                + sin(radians(p_lat::float8))
                * sin(radians(p.service_center_lat::float8))
              )
            )
          )
        )
      end as distance_km
    from public.professionals p
    where p.is_verified = true
      and exists (
        select 1
        from unnest(p.specialties) as s
        where lower(s) = lower(p_specialty)
      )
  )
  select
    c.professional_id,
    c.distance_km,
    c.zip_match
  from pro_candidates c
  where c.zip_match = true
    or (
      c.distance_km is not null
      and c.distance_km <= c.service_radius_km
    )
  order by c.zip_match desc, c.distance_km asc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 10));
$$;

grant execute on function public.match_professionals(text, text, numeric, numeric, integer) to service_role;
