-- Migration: Create organization_settings table for persistent multi-user organization configuration
create table if not exists public.organization_settings (
  id text primary key default 'default',
  name_en text,
  name_ar text,
  cr_number text,
  po_box text,
  postal_code text,
  phones text,
  email text,
  website text,
  address_en text,
  address_ar text,
  logo_url text,
  pdf_logo_url text,
  pdf_header_logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table public.organization_settings enable row level security;

-- Policy: Allow read access to all authenticated and anonymous users
drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select on public.organization_settings
  for select using (true);

-- Policy: Allow full write access for organization administration
drop policy if exists organization_settings_all on public.organization_settings;
create policy organization_settings_all on public.organization_settings
  for all using (true);
