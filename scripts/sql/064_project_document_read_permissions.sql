-- ============================================================
-- Migration 064: Align Project Document Read Access with Project Access
--
-- Ensures users who have read access to a project (including assigned
-- Supervisors, supervising organization members, assigned users, and
-- project participant key contacts) can view and read project documents.
-- ============================================================

create or replace function public.is_project_member(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.viewer_project_scope_allows(proj)
    and (
      exists (
        select 1
        from public.project_user_memberships membership
        where membership.project_id = proj
          and membership.user_id = auth.uid()
          and membership.status = 'active'
      )
      or exists (
        select 1
        from public.projects project
        join public.organization_memberships membership
          on membership.organization_id = project.supervising_organization_id
        where project.id = proj
          and membership.user_id = auth.uid()
          and membership.status = 'active'
      )
      or exists (
        select 1
        from public.projects project
        where project.id = proj
          and (
            project.assigned_supervisor_id = auth.uid()
            or project.assigned_user_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.project_participants participant
        where participant.project_id = proj
          and participant.key_contact_user_id = auth.uid()
          and participant.status = 'active'
      )
      or exists (
        select 1
        from public.project_organization_memberships pom
        join public.organization_memberships membership
          on membership.organization_id = pom.organization_id
        where pom.project_id = proj
          and pom.status = 'active'
          and membership.user_id = auth.uid()
          and membership.status = 'active'
      )
    );
$$;

revoke all on function public.is_project_member(uuid) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated, service_role;
