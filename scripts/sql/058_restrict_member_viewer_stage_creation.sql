-- ============================================================
-- Restrict Stage creation for organization Members and Viewers.
--
-- Member/Viewer users keep their existing Stage SELECT/report-response
-- permissions, but cannot create organization Stage templates or new
-- project_stages rows even if they also hold a project_admin/project_manager
-- membership. Existing Admin/Manager behavior is preserved.
-- ============================================================

create or replace function public.can_manage_stage_templates(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and not exists (
      select 1
      from public.organization_memberships restricted_membership
      where restricted_membership.organization_id = org
        and restricted_membership.user_id = auth.uid()
        and restricted_membership.status = 'active'
        and restricted_membership.role in ('org_member', 'viewer')
    )
    and (
      exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = org
          and membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.role in ('org_admin', 'org_manager')
      )
      or exists (
        select 1
        from public.project_user_memberships membership
        join public.projects project on project.id = membership.project_id
        where project.supervising_organization_id = org
          and membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.access_role in ('project_admin', 'project_manager')
      )
    );
$$;

-- Keep the existing project-admin definition untouched because it protects
-- many unrelated project capabilities. Stage INSERT receives its own narrower
-- predicate so this change cannot regress other project-admin permissions.
create or replace function public.can_create_project_stage(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.projects project
      where project.id = proj
        and not exists (
          select 1
          from public.organization_memberships restricted_membership
          where restricted_membership.organization_id = project.supervising_organization_id
            and restricted_membership.user_id = auth.uid()
            and restricted_membership.status = 'active'
            and restricted_membership.role in ('org_member', 'viewer')
        )
    )
    and public.is_project_admin(proj);
$$;

revoke all on function public.can_create_project_stage(uuid) from public;
grant execute on function public.can_create_project_stage(uuid) to authenticated, service_role;

-- Organization Stage-template INSERT already calls can_manage_stage_templates,
-- so replacing the helper above tightens that existing policy without changing
-- Stage SELECT access.

-- Project Stage INSERT previously relied on is_project_admin(project_id), which
-- could promote an org Member/Viewer through a project_admin membership.
drop policy if exists project_stages_insert on public.project_stages;
create policy project_stages_insert on public.project_stages for insert
  with check (public.can_create_project_stage(project_id));
