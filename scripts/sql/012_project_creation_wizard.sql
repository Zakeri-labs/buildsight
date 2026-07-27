-- ============================================================
-- Guided project creation metadata and owner records
-- ============================================================

alter table public.projects
  add column if not exists project_type text,
  add column if not exists supervision_type text,
  add column if not exists region text,
  add column if not exists description text,
  add column if not exists contractor_organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists contractor_registration_number text,
  add column if not exists contractor_address text,
  add column if not exists contractor_postal_code text,
  add column if not exists contractor_phone text;

create index if not exists projects_contractor_organization_idx
  on public.projects (contractor_organization_id)
  where contractor_organization_id is not null;

create table if not exists public.project_owners (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_order integer not null default 1,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_owners_order_positive check (owner_order > 0),
  constraint project_owners_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists project_owners_project_order_unique
  on public.project_owners (project_id, owner_order);
create index if not exists project_owners_project_idx
  on public.project_owners (project_id);

create or replace function public.touch_project_owner_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_owners_touch_updated_at on public.project_owners;
create trigger project_owners_touch_updated_at
  before update on public.project_owners
  for each row execute function public.touch_project_owner_updated_at();

alter table public.project_owners enable row level security;

drop policy if exists project_owners_select on public.project_owners;
create policy project_owners_select on public.project_owners for select
  using (
    public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists project_owners_insert on public.project_owners;
create policy project_owners_insert on public.project_owners for insert
  with check (public.is_project_admin(project_id));

drop policy if exists project_owners_update on public.project_owners;
create policy project_owners_update on public.project_owners for update
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

drop policy if exists project_owners_delete on public.project_owners;
create policy project_owners_delete on public.project_owners for delete
  using (public.is_project_admin(project_id));

comment on column public.projects.project_type is
  'Stable application project type value selected during guided creation.';
comment on column public.projects.supervision_type is
  'Stable application supervision type value selected during guided creation.';
comment on table public.project_owners is
  'Owner/client contacts captured during project creation, ordered per project.';
