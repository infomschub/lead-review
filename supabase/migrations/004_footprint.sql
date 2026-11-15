-- Run once in Supabase SQL Editor (safe to run again).
-- Building footprint from Google Solar, used as the home size estimate.
alter table leads add column if not exists footprint_sqft integer;
alter table property_cache add column if not exists footprint_sqft integer;
notify pgrst, 'reload schema';
