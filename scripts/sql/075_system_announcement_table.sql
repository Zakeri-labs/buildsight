-- Migration: Create system_announcement table for global admin broadcast banners
create table if not exists public.system_announcement (
  id text primary key default 'default',
  message text not null default '',
  type text not null default 'maintenance',
  is_active boolean not null default false,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table public.system_announcement enable row level security;

-- Policy: Allow read access to all authenticated and anonymous users
drop policy if exists system_announcement_select on public.system_announcement;
create policy system_announcement_select on public.system_announcement
  for select using (true);

-- Policy: Allow write access
drop policy if exists system_announcement_all on public.system_announcement;
create policy system_announcement_all on public.system_announcement
  for all using (true);
