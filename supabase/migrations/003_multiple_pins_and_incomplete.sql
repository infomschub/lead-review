-- Run once in Supabase SQL Editor (safe to run again).
-- Multiple targeting pins per client, and a setting for incomplete addresses.

alter table clients add column if not exists areas jsonb not null default '[]'::jsonb;
alter table clients add column if not exists incomplete_as text not null default 'review';
alter table clients drop constraint if exists clients_incomplete_as_check;
alter table clients add constraint clients_incomplete_as_check check (incomplete_as in ('review','bad'));

-- Turn each client's old single center + radius into their first pin.
update clients
set areas = jsonb_build_array(jsonb_build_object(
  'label', coalesce(center_address, center_lat || ', ' || center_lng),
  'lat', center_lat, 'lng', center_lng, 'radius_miles', radius_miles))
where areas = '[]'::jsonb and center_lat is not null and center_lng is not null and coalesce(radius_miles, 0) > 0;

alter table leads add column if not exists nearest_area text;

notify pgrst, 'reload schema';
