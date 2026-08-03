create or replace function public.schedule_site_visit_request(
  target_request_id uuid,
  actor_id uuid,
  visit_date date,
  visit_time time without time zone,
  visit_notes text,
  assigned_user_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
<<schedule_site_visit_request_body>>
declare
  target_project_id uuid;
  target_status text;
  assigned_user_id uuid;
begin
  select request.project_id, request.status
    into target_project_id, target_status
  from public.site_visit_requests request
  where request.id = target_request_id
  for update;

  if target_project_id is null then
    raise exception 'Site visit request not found';
  end if;

  if not public.user_can_manage_site_visits(actor_id, target_project_id) then
    raise exception 'Not authorized to schedule this site visit';
  end if;

  if target_status not in ('pending', 'scheduled') then
    raise exception 'This site visit request can no longer be scheduled';
  end if;

  if visit_date is null or visit_time is null then
    raise exception 'Visit date and time are required';
  end if;

  foreach assigned_user_id in array coalesce(assigned_user_ids, '{}'::uuid[]) loop
    if not (
      exists (
        select 1 from public.project_user_memberships membership
        where membership.project_id = target_project_id
          and membership.user_id = schedule_site_visit_request_body.assigned_user_id
          and membership.status = 'active'
      )
      or exists (
        select 1 from public.project_participants participant
        where participant.project_id = target_project_id
          and participant.key_contact_user_id = schedule_site_visit_request_body.assigned_user_id
          and participant.status = 'active'
      )
      or exists (
        select 1
        from public.projects project
        join public.organization_memberships membership
          on membership.organization_id = project.supervising_organization_id
        where project.id = target_project_id
          and membership.user_id = schedule_site_visit_request_body.assigned_user_id
          and membership.status = 'active'
      )
    ) then
      raise exception 'Assigned participant does not have access to this project';
    end if;
  end loop;

  update public.site_visit_requests
  set status = 'scheduled',
      scheduled_date = visit_date,
      scheduled_time = visit_time,
      scheduled_notes = nullif(btrim(visit_notes), ''),
      scheduled_by = actor_id,
      completed_at = null,
      cancelled_at = null
  where id = target_request_id;

  delete from public.site_visit_request_assignees
  where request_id = target_request_id;

  insert into public.site_visit_request_assignees(request_id, user_id)
  select target_request_id, distinct_user_id
  from unnest(coalesce(assigned_user_ids, '{}'::uuid[])) as assigned(distinct_user_id)
  on conflict do nothing;
end schedule_site_visit_request_body;
$$;
