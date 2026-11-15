-- Lead Quality Review: run once in the Supabase SQL editor.

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_type text not null default 'roofing' check (company_type in ('roofing','home_improvement','both')),
  active boolean not null default true,
  ghl_location_id text not null default '',
  ghl_token text,
  target_zips text[] not null default '{}',
  center_address text,
  center_lat double precision,
  center_lng double precision,
  radius_miles double precision,
  areas jsonb not null default '[]'::jsonb,   -- pins: [{label, lat, lng, radius_miles}]
  incomplete_as text not null default 'review' check (incomplete_as in ('review','bad')),
  min_sqft integer,        -- home sq ft
  max_sqft integer,
  min_roof_sqft integer,   -- roof sq ft
  max_roof_sqft integer,
  allowed_property_types text[] not null default '{}',
  notes text,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ghl_contact_id text not null,
  name text not null default '',
  phone text, email text,
  address text, city text, state text, zip text,
  source text,
  lead_created_at timestamptz not null,

  property_status text not null default 'pending',
  formatted_address text,
  lat double precision, lng double precision,
  sqft integer, property_type text, year_built integer,
  roof_sqft integer, roof_pitch integer, footprint_sqft integer, size_source text,
  distance_miles double precision,
  nearest_area text,
  in_area boolean,

  responsive boolean not null default false,
  first_inbound_at timestamptz,
  client_responded boolean not null default false,
  first_response_at timestamptz,
  booked boolean not null default false,
  appointment_at timestamptz,
  appointment_status text,
  engagement_checked_at timestamptz,

  grade text not null default 'review' check (grade in ('good','bad','review')),
  reasons text[] not null default '{}',
  override_grade text check (override_grade in ('good','bad','review')),
  override_note text,
  updated_at timestamptz not null default now(),
  unique (client_id, ghl_contact_id)
);
create index if not exists leads_client_created on leads (client_id, lead_created_at desc);

-- Each address is looked up once per company type (key = '<type>:<address>'), to keep API costs down.
create table if not exists property_cache (
  address_key text primary key,
  status text not null,
  formatted_address text,
  lat double precision, lng double precision, zip text,
  sqft integer, property_type text, year_built integer,
  roof_sqft integer, roof_pitch integer, footprint_sqft integer, size_source text,
  looked_up_at timestamptz not null default now()
);

-- Only the server (service role key) touches these tables.
alter table clients enable row level security;
alter table leads enable row level security;
alter table property_cache enable row level security;
