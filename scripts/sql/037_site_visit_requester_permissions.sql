-- Allow Clients and Admins to create Site Visit Requests.
-- Supervisors, project managers, contractors, and other participants remain unable to create requests.

create or replace function public.user_can_request_site_visit(target_user_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_site_visit_client(target_user_id, target_project_id)
  or exists (
    select 1
    from public.project_user_memberships membership
    where membership.project_id = target_project_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.access_role = 'project_admin'
  )
  or exists (
    select 1
    from public.projects project
    join public.organization_memberships membership
      on membership.organization_id = project.supervising_organization_id
    where project.id = target_project_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.role = 'org_admin'
  )
  or exists (
    select 1
    from public.project_organization_memberships project_org
    join public.organization_memberships membership
      on membership.organization_id = project_org.organization_id
    where project_org.project_id = target_project_id
      and project_org.project_role = 'consultant'
      and project_org.status = 'active'
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.role = 'org_admin'
  );
$$;

create or replace function public.can_request_site_visit(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_request_site_visit(auth.uid(), target_project_id);
$$;

revoke all on function public.user_can_request_site_visit(uuid, uuid) from public;
revoke all on function public.can_request_site_visit(uuid) from public;
grant execute on function public.user_can_request_site_visit(uuid, uuid) to service_role;
grant execute on function public.can_request_site_visit(uuid) to authenticated;

drop policy if exists site_visit_requests_insert on public.site_visit_requests;
create policy site_visit_requests_insert on public.site_visit_requests for insert
with check (
  requested_by = auth.uid()
  and public.can_request_site_visit(project_id)
  and status = 'pending'
  and scheduled_date is null
  and scheduled_time is null
  and scheduled_notes is null
  and scheduled_by is null
  and completed_at is null
  and cancelled_at is null
);

comment on function public.user_can_request_site_visit(uuid, uuid) is
  'Returns true only for a Client or Admin authorized to create a Site Visit Request for the project.';
