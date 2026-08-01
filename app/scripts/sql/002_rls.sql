-- ============================================================
-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_memberships
    where organization_id = org and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_memberships
    where organization_id = org and user_id = auth.uid()
      and status = 'active' and role = 'org_admin'
  );
$$;

create or replace function public.is_project_member(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_user_memberships
    where project_id = proj and user_id = auth.uid() and status = 'active'
  );
$$;

-- A project admin is either a user with project_admin access, or an org_admin
-- of the project's supervising organization.
create or replace function public.is_project_admin(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_user_memberships
    where project_id = proj and user_id = auth.uid()
      and status = 'active' and access_role = 'project_admin'
  )
  or exists (
    select 1 from projects p
    join organization_memberships m on m.organization_id = p.supervising_organization_id
    where p.id = proj and m.user_id = auth.uid()
      and m.status = 'active' and m.role = 'org_admin'
  );
$$;

create or replace function public.is_supervising_org_admin(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    join organization_memberships m on m.organization_id = p.supervising_organization_id
    where p.id = proj and m.user_id = auth.uid()
      and m.status = 'active' and m.role = 'org_admin'
  );
$$;

create or replace function public.shares_scope_with(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_memberships a
    join organization_memberships b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = target
      and a.status = 'active' and b.status = 'active'
  )
  or exists (
    select 1 from project_user_memberships a
    join project_user_memberships b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = target
      and a.status = 'active' and b.status = 'active'
  );
$$;

-- ============================================================
-- Enable RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.project_organization_memberships enable row level security;
alter table public.project_user_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;

-- ============================================================
-- profiles
-- ============================================================
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.shares_scope_with(id));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- organizations
-- ============================================================
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations for insert
  with check (created_by = auth.uid());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- ============================================================
-- organization_memberships
-- ============================================================
drop policy if exists org_memberships_select on public.organization_memberships;
create policy org_memberships_select on public.organization_memberships for select
  using (user_id = auth.uid() or public.is_org_member(organization_id));

drop policy if exists org_memberships_write on public.organization_memberships;
create policy org_memberships_write on public.organization_memberships for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ============================================================
-- projects
-- ============================================================
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (public.is_project_member(id) or public.is_supervising_org_admin(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert
  with check (public.is_org_admin(supervising_organization_id));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using (public.is_project_admin(id)) with check (public.is_project_admin(id));

-- ============================================================
-- project_organization_memberships
-- ============================================================
drop policy if exists pom_select on public.project_organization_memberships;
create policy pom_select on public.project_organization_memberships for select
  using (
    public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
    or public.is_org_member(organization_id)
  );

drop policy if exists pom_write on public.project_organization_memberships;
create policy pom_write on public.project_organization_memberships for all
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

-- ============================================================
-- project_user_memberships
-- ============================================================
drop policy if exists pum_select on public.project_user_memberships;
create policy pum_select on public.project_user_memberships for select
  using (
    user_id = auth.uid()
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists pum_write on public.project_user_memberships;
create policy pum_write on public.project_user_memberships for all
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

-- ============================================================
-- invitations
-- ============================================================
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select
  using (
    public.is_org_admin(organization_id)
    or (project_id is not null and public.is_project_admin(project_id))
    or lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

drop policy if exists invitations_write on public.invitations;
create policy invitations_write on public.invitations for all
  using (
    public.is_org_admin(organization_id)
    or (project_id is not null and public.is_project_admin(project_id))
  )
  with check (
    public.is_org_admin(organization_id)
    or (project_id is not null and public.is_project_admin(project_id))
  );

-- ============================================================
-- audit_logs
-- ============================================================
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select
  using (
    (organization_id is not null and public.is_org_member(organization_id))
    or (project_id is not null and public.is_project_member(project_id))
    or actor_id = auth.uid()
  );

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert
  with check (actor_id = auth.uid());
