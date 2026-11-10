-- ============================================================
-- Migration 087: Project Zones Data Model & Geographic Zones
--
-- Supports Circle and Polygon geographic zones scoped to organizations.
-- Allows automatic geographic matching of project coordinates.
-- Enforces strict RLS and excludes architect_administrator.
-- ============================================================

create table if not exists public.project_zones (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  name text not null,

  zone_type text not null
    check (zone_type in ('circle', 'polygon')),

  color text not null
    check (color ~* '^#[0-9a-f]{6}$'),

  -- Circle geometry
  circle_center_lat double precision
    check (circle_center_lat is null or (circle_center_lat between -90 and 90)),
  circle_center_lng double precision
    check (circle_center_lng is null or (circle_center_lng between -180 and 180)),
  circle_radius_meters double precision
    check (circle_radius_meters is null or (circle_radius_meters between 50 and 500000)),

  -- Polygon geometry (GeoJSON coordinate array of [latitude, longitude] pairs)
  polygon_coordinates jsonb,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_zones_name_check
    check (char_length(trim(name)) >= 2),

  constraint project_zones_geometry_exclusivity check (
    (
      zone_type = 'circle'
      and circle_center_lat is not null
      and circle_center_lng is not null
      and circle_radius_meters is not null
      and polygon_coordinates is null
    )
    or
    (
      zone_type = 'polygon'
      and polygon_coordinates is not null
      and jsonb_typeof(polygon_coordinates) = 'array'
      and jsonb_array_length(polygon_coordinates) >= 3
      and jsonb_array_length(polygon_coordinates) <= 500
      and circle_center_lat is null
      and circle_center_lng is null
      and circle_radius_meters is null
    )
  )
);

-- Index for organization lookups and ordering
create index if not exists project_zones_org_updated_idx
  on public.project_zones (organization_id, updated_at desc);

-- Trigger to maintain updated_at
create or replace function public.touch_project_zone_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_zones_touch_updated_at on public.project_zones;
create trigger project_zones_touch_updated_at before update on public.project_zones
  for each row execute function public.touch_project_zone_updated_at();

-- Enable Row Level Security
alter table public.project_zones enable row level security;

-- Grants
grant select, insert, update, delete on public.project_zones to authenticated;
grant all on public.project_zones to service_role;

-- 1. SELECT: Active org members (org_admin, org_manager, org_member, viewer)
-- Explicitly excludes architect_administrator.
drop policy if exists "project_zones_select_policy" on public.project_zones;
create policy "project_zones_select_policy"
  on public.project_zones for select
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = project_zones.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('org_admin', 'org_manager', 'org_member', 'viewer')
    )
  );

-- 2. INSERT: Only org_admin and org_manager
drop policy if exists "project_zones_insert_policy" on public.project_zones;
create policy "project_zones_insert_policy"
  on public.project_zones for insert
  with check (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = project_zones.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('org_admin', 'org_manager')
    )
  );

-- 3. UPDATE: Only org_admin and org_manager (WITH CHECK prevents moving organization)
drop policy if exists "project_zones_update_policy" on public.project_zones;
create policy "project_zones_update_policy"
  on public.project_zones for update
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = project_zones.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('org_admin', 'org_manager')
    )
  )
  with check (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = project_zones.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('org_admin', 'org_manager')
    )
  );

-- 4. DELETE: Only org_admin and org_manager
drop policy if exists "project_zones_delete_policy" on public.project_zones;
create policy "project_zones_delete_policy"
  on public.project_zones for delete
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = project_zones.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('org_admin', 'org_manager')
    )
  );
