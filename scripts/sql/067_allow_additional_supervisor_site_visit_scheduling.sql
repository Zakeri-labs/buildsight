-- Allow additional active Supervisor participants (in project_participants)
-- to schedule and manage Site Visits alongside the primary Supervisor.

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

  if target_supervisor_id is null and not exists (
    select 1
    from public.project_participants participant
    where participant.project_id = target_project_id
      and participant.status = 'active'
      and participant.participant_type in ('consultancy', 'supervisor')
  ) then
    raise exception 'Project Supervisor is not assigned';
  end if;

  if not (
    target_supervisor_id = actor_id
    or exists (
      select 1
      from public.project_participants participant
      where participant.project_id = target_project_id
        and participant.key_contact_user_id = actor_id
        and participant.status = 'active'
        and participant.participant_type in ('consultancy', 'supervisor')
    )
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


create or replace function public.approve_calendar_site_visit_request(
  target_request_id uuid,
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
<<approve_calendar_site_visit_request_body>>
declare
  target_project_id uuid;
  target_status text;
  target_client_request_id uuid;
  target_supervisor_id uuid;
  target_supervising_organization_id uuid;
  assigned_user_id uuid;
begin
  if target_request_id is null or actor_id is null then
    raise exception 'Request and actor are required';
  end if;

  if visit_date is null or visit_time is null then
    raise exception 'Visit date and time are required';
  end if;

  select request.project_id, request.status, request.client_request_id
    into target_project_id, target_status, target_client_request_id
  from public.site_visit_requests request
  where request.id = target_request_id
  for update;

  if not found then
    raise exception 'Site visit request not found';
  end if;

  if target_client_request_id is null then
    raise exception 'This record is not a client visit request';
  end if;

  if target_status <> 'pending' then
    raise exception 'This request has already been processed';
  end if;

  select project.assigned_supervisor_id, project.supervising_organization_id
    into target_supervisor_id, target_supervising_organization_id
  from public.projects project
  where project.id = target_project_id;

  if not found then
    raise exception 'Project not found';
  end if;

  if target_supervisor_id is null and not exists (
    select 1
    from public.project_participants participant
    where participant.project_id = target_project_id
      and participant.status = 'active'
      and participant.participant_type in ('consultancy', 'supervisor')
  ) then
    raise exception 'Project Supervisor is not assigned';
  end if;

  if not (
    target_supervisor_id = actor_id
    or exists (
      select 1
      from public.project_participants participant
      where participant.project_id = target_project_id
        and participant.key_contact_user_id = actor_id
        and participant.status = 'active'
        and participant.participant_type in ('consultancy', 'supervisor')
    )
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
    raise exception 'Not authorized to manage this client visit request';
  end if;

  foreach assigned_user_id in array coalesce(assigned_user_ids, '{}'::uuid[]) loop
    if assigned_user_id is null or not (
      exists (
        select 1
        from public.project_user_memberships membership
        where membership.project_id = target_project_id
          and membership.user_id = approve_calendar_site_visit_request_body.assigned_user_id
          and membership.status = 'active'
      )
      or exists (
        select 1
        from public.project_participants participant
        where participant.project_id = target_project_id
          and participant.key_contact_user_id = approve_calendar_site_visit_request_body.assigned_user_id
          and participant.status = 'active'
      )
      or exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = target_supervising_organization_id
          and membership.user_id = approve_calendar_site_visit_request_body.assigned_user_id
          and membership.status = 'active'
      )
    ) then
      raise exception 'Assigned participant does not have access to this project';
    end if;
  end loop;

  update public.site_visit_requests request
  set status = 'scheduled',
      scheduled_date = visit_date,
      scheduled_time = visit_time,
      scheduled_notes = nullif(btrim(left(coalesce(visit_notes, ''), 4000)), ''),
      scheduled_by = actor_id,
      completed_at = null,
      cancelled_at = null
  where request.id = target_request_id
    and request.status = 'pending';

  if not found then
    raise exception 'This request has already been processed';
  end if;

  delete from public.site_visit_request_assignees assignee
  where assignee.request_id = target_request_id;

  insert into public.site_visit_request_assignees(request_id, user_id)
  select target_request_id, assigned.distinct_user_id
  from unnest(coalesce(assigned_user_ids, '{}'::uuid[])) as assigned(distinct_user_id)
  on conflict do nothing;

  return target_request_id;
end;
$$;

revoke all on function public.approve_calendar_site_visit_request(uuid, uuid, date, time without time zone, text, uuid[]) from public;
grant execute on function public.approve_calendar_site_visit_request(uuid, uuid, date, time without time zone, text, uuid[]) to service_role;


create or replace function public.reject_calendar_site_visit_request(
  target_request_id uuid,
  actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  target_status text;
  target_client_request_id uuid;
  target_supervisor_id uuid;
  target_supervising_organization_id uuid;
begin
  if target_request_id is null or actor_id is null then
    raise exception 'Request and actor are required';
  end if;

  select request.project_id, request.status, request.client_request_id
    into target_project_id, target_status, target_client_request_id
  from public.site_visit_requests request
  where request.id = target_request_id
  for update;

  if not found then
    raise exception 'Site visit request not found';
  end if;

  if target_client_request_id is null then
    raise exception 'This record is not a client visit request';
  end if;

  if target_status <> 'pending' then
    raise exception 'This request has already been processed';
  end if;

  select project.assigned_supervisor_id, project.supervising_organization_id
    into target_supervisor_id, target_supervising_organization_id
  from public.projects project
  where project.id = target_project_id;

  if not found then
    raise exception 'Project not found';
  end if;

  if not (
    target_supervisor_id = actor_id
    or exists (
      select 1
      from public.project_participants participant
      where participant.project_id = target_project_id
        and participant.key_contact_user_id = actor_id
        and participant.status = 'active'
        and participant.participant_type in ('consultancy', 'supervisor')
    )
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
    raise exception 'Not authorized to manage this client visit request';
  end if;

  update public.site_visit_requests request
  set status = 'cancelled',
      scheduled_date = null,
      scheduled_time = null,
      scheduled_notes = null,
      scheduled_by = null,
      completed_at = null,
      cancelled_at = now()
  where request.id = target_request_id
    and request.status = 'pending';

  if not found then
    raise exception 'This request has already been processed';
  end if;

  delete from public.site_visit_request_assignees assignee
  where assignee.request_id = target_request_id;

  return target_request_id;
end;
$$;

revoke all on function public.reject_calendar_site_visit_request(uuid, uuid) from public;
grant execute on function public.reject_calendar_site_visit_request(uuid, uuid) to service_role;


create or replace function public.user_can_manage_site_visits(target_user_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.assigned_supervisor_id = target_user_id
  )
  or exists (
    select 1
    from public.project_participants participant
    where participant.project_id = target_project_id
      and participant.key_contact_user_id = target_user_id
      and participant.status = 'active'
      and participant.participant_type in ('consultancy', 'supervisor')
  )
  or exists (
    select 1
    from public.project_user_memberships membership
    where membership.project_id = target_project_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.access_role in ('project_admin', 'project_manager', 'inspector')
  )
  or exists (
    select 1
    from public.projects project
    join public.organization_memberships membership
      on membership.organization_id = project.supervising_organization_id
    where project.id = target_project_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.role in ('org_admin', 'org_manager')
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
      and membership.role in ('org_admin', 'org_manager')
  )
  or exists (
    select 1
    from public.project_participants participant
    where participant.project_id = target_project_id
      and participant.key_contact_user_id = target_user_id
      and participant.status = 'active'
      and lower(btrim(coalesce(participant.participant_role_label, ''))) in ('project manager', 'site engineer')
  );
$$;

revoke all on function public.user_can_manage_site_visits(uuid, uuid) from public;
grant execute on function public.user_can_manage_site_visits(uuid, uuid) to service_role;
