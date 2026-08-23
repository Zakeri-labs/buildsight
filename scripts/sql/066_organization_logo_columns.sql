-- Migration: Add logo columns to public.organizations table and ensure organization_settings table exists
alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists pdf_logo_url text,
  add column if not exists pdf_header_logo_url text,
  add column if not exists name_ar text,
  add column if not exists cr_number text,
  add column if not exists po_box text,
  add column if not exists address_ar text;

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

alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select on public.organization_settings
  for select using (true);

drop policy if exists organization_settings_all on public.organization_settings;
create policy organization_settings_all on public.organization_settings
  for all using (true);
