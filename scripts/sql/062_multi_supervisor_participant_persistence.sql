-- Migration 062: Preserve all active project supervisor participant assignments
-- Ensure set_project_supervisor_assignment does NOT deactivate existing project_participants rows.

create or replace function public.set_project_supervisor_assignment(
  target_project_id uuid,
  target_supervisor_id uuid,
  actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_supervising_organization_id uuid;
  target_organization_name text;
  previous_supervisor_id uuid;
  assigned_user_id uuid;
  supervisor_name text;
  supervisor_email text;
begin
  if target_project_id is null or actor_id is null then
    raise exception 'Project and actor are required';
  end if;

  select
    project.supervising_organization_id,
    organization.name,
    project.assigned_supervisor_id,
    project.assigned_user_id
    into
      target_supervising_organization_id,
      target_organization_name,
      previous_supervisor_id,
      assigned_user_id
  from public.projects project
  join public.organizations organization on organization.id = project.supervising_organization_id
  where project.id = target_project_id
  for update of project;

  if not found then
    raise exception 'Project not found';
  end if;

  if not (
    exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = target_supervising_organization_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and membership.role = 'org_admin'
    )
    or exists (
      select 1
      from public.project_user_memberships membership
      where membership.project_id = target_project_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and membership.access_role = 'project_admin'
    )
  ) then
    raise exception 'Not authorized to assign the Project Supervisor';
  end if;

  if target_supervisor_id is not null then
    if not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = target_supervising_organization_id
        and membership.user_id = target_supervisor_id
        and membership.status = 'active'
        and membership.role in ('org_admin', 'org_manager', 'org_member')
    ) then
      raise exception 'Selected Project Supervisor is not an active eligible organization member';
    end if;

    select
      coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(profile.email), '')),
      profile.email
      into supervisor_name, supervisor_email
    from public.profiles profile
    where profile.id = target_supervisor_id;

    if not found then
      raise exception 'Selected Project Supervisor profile was not found';
    end if;
  end if;

  update public.projects project
  set assigned_supervisor_id = target_supervisor_id,
      updated_at = now()
  where project.id = target_project_id;

  return target_supervisor_id;
end;
$$;
