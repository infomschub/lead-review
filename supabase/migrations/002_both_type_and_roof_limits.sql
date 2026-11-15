-- Run once in Supabase SQL Editor (safe to run again).
-- Adds the "both" company type and separate roof sq ft limits.

alter table clients drop constraint if exists clients_company_type_check;
alter table clients add constraint clients_company_type_check
  check (company_type in ('roofing','home_improvement','both'));

alter table clients add column if not exists min_roof_sqft integer;
alter table clients add column if not exists max_roof_sqft integer;

-- Roofing clients' existing limits were roof limits: move them to the new roof columns.
update clients
set min_roof_sqft = min_sqft, max_roof_sqft = max_sqft, min_sqft = null, max_sqft = null
where company_type = 'roofing' and (min_sqft is not null or max_sqft is not null)
  and min_roof_sqft is null and max_roof_sqft is null;

notify pgrst, 'reload schema';
