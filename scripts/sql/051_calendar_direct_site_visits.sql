-- Allow the existing Site Visit model to represent a directly scheduled visit
-- without associating it with a client-created request.
alter table public.site_visit_requests
  alter column client_request_id drop not null;

comment on column public.site_visit_requests.client_request_id is
  'Client request idempotency key. Null only for directly scheduled Site Visits.';

create or replace function public.create_direct_site_visit(
  target_project_id uuid,
  actor_id uuid,
  visit_date date,
  visit_time time without time zone,
  visit_notes text,
  assigned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
<<create_direct_site_visit_body>>
declare
  target_supervisor_id uuid;
  target_supervising_organization_id uuid;
  assigned_user_id uuid;
  created_request_id uuid;
begin
  if target_project_id is null or actor_id is null then
    raise exception 'Project and actor are required';
  end if;

  if visit_date is null or visit_time is null then
    raise exception 'Visit date and time are required';
  end if;

  select project.assigned_supervisor_id, project.supervising_organization_id
    into target_supervisor_id, target_supervising_organization_id
  from public.projects project
  where project.id = target_project_id;

  if not found then
    raise exception 'Project not found';
  end if;

  if target_supervisor_id is null then
    raise exception 'Project Supervisor is not assigned';
  end if;

  if not (
    target_supervisor_id = actor_id
    or exists (
      select 1
      from public.project_user_memberships membership
      where membership.project_id = target_project_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and membership.access_role = 'project_admin'
    )
    or exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = target_supervising_organization_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and membership.role = 'org_admin'
    )
  ) then
    raise exception 'Not authorized to schedule a direct site visit';
  end if;

  foreach assigned_user_id in array coalesce(assigned_user_ids, '{}'::uuid[]) loop
    if assigned_user_id is null or not (
      exists (
        select 1
        from public.project_user_memberships membership
        where membership.project_id = target_project_id
          and membership.user_id = create_direct_site_visit_body.assigned_user_id
          and membership.status = 'active'
      )
      or exists (
        select 1
        from public.project_participants participant
        where participant.project_id = target_project_id
          and participant.key_contact_user_id = create_direct_site_visit_body.assigned_user_id
          and participant.status = 'active'
      )
      or exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = target_supervising_organization_id
          and membership.user_id = create_direct_site_visit_body.assigned_user_id
          and membership.status = 'active'
      )
    ) then
      raise exception 'Assigned participant does not have access to this project';
    end if;
  end loop;

  insert into public.site_visit_requests (
    project_id,
    requested_by,
    client_request_id,
    status,
    preferred_date,
    is_asap,
    preferred_time,
    purpose,
    notes,
    scheduled_date,
    scheduled_time,
    scheduled_notes,
    scheduled_by,
    completed_at,
    cancelled_at
  )
  values (
    target_project_id,
    actor_id,
    null,
    'scheduled',
    visit_date,
    false,
    'any_time',
    'Direct site visit',
    null,
    visit_date,
    visit_time,
    nullif(btrim(left(coalesce(visit_notes, ''), 4000)), ''),
    actor_id,
    null,
    null
  )
  returning id into created_request_id;

  insert into public.site_visit_request_assignees(request_id, user_id)
  select created_request_id, assigned.distinct_user_id
  from unnest(coalesce(assigned_user_ids, '{}'::uuid[])) as assigned(distinct_user_id)
  on conflict do nothing;

  return created_request_id;
end;
$$;

revoke all on function public.create_direct_site_visit(uuid, uuid, date, time without time zone, text, uuid[]) from public;
grant execute on function public.create_direct_site_visit(uuid, uuid, date, time without time zone, text, uuid[]) to service_role;
