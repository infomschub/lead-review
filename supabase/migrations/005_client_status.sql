-- Run once in Supabase SQL Editor (safe to run again).
-- Client status: active / paused / lost (replaces the Active checkbox).
alter table clients add column if not exists status text not null default 'active';
alter table clients drop constraint if exists clients_status_check;
alter table clients add constraint clients_status_check check (status in ('active','paused','lost'));
-- Clients that were unticked as inactive become Paused.
update clients set status = 'paused' where active = false and status = 'active';
notify pgrst, 'reload schema';
