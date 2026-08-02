-- ============================================================
-- Project Site Visit Requests
-- ============================================================

create table if not exists public.site_visit_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  status text not null default 'pending',
  preferred_date date,
  is_asap boolean not null default false,
  preferred_time text not null default 'any_time',
  purpose text not null,
  notes text,
  scheduled_date date,
  scheduled_time time without time zone,
  scheduled_notes text,
  scheduled_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_visit_requests_status_check
    check (status in ('pending', 'scheduled', 'completed', 'cancelled')),
  constraint site_visit_requests_preferred_time_check
    check (preferred_time in ('morning', 'afternoon', 'any_time')),
  constraint site_visit_requests_preferred_visit_check
    check ((is_asap = true and preferred_date is null) or (is_asap = false and preferred_date is not null)),
  constraint site_visit_requests_purpose_not_blank
    check (length(btrim(purpose)) between 1 and 2000),
  constraint site_visit_requests_notes_length
    check (notes is null or length(notes) <= 4000),
  constraint site_visit_requests_scheduled_notes_length
    check (scheduled_notes is null or length(scheduled_notes) <= 4000),
  constraint site_visit_requests_request_id_unique unique (requested_by, project_id, client_request_id)
);

create index if not exists site_visit_requests_project_status_created_idx
  on public.site_visit_requests(project_id, status, created_at desc);
create index if not exists site_visit_requests_requested_by_created_idx
  on public.site_visit_requests(requested_by, created_at desc);
create index if not exists site_visit_requests_scheduled_date_idx
  on public.site_visit_requests(scheduled_date)
  where status = 'scheduled';

create table if not exists public.site_visit_request_assignees (
  request_id uuid not null references public.site_visit_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index if not exists site_visit_request_assignees_user_idx
  on public.site_visit_request_assignees(user_id, request_id);

create or replace function public.touch_site_visit_request_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_visit_requests_touch_updated_at on public.site_visit_requests;
create trigger site_visit_requests_touch_updated_at
  before update on public.site_visit_requests
  for each row execute function public.touch_site_visit_request_updated_at();

create or replace function public.user_is_site_visit_client(target_user_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_participants participant
    where participant.project_id = target_project_id
      and participant.key_contact_user_id = target_user_id
      and participant.status = 'active'
      and (
        participant.project_role = 'client'
        or lower(coalesce(participant.participant_role_label, '')) in ('client', 'client / owner', 'owner', 'project owner')
      )
  )
  or exists (
    select 1
    from public.organization_memberships membership
    join public.project_organization_memberships project_org
      on project_org.organization_id = membership.organization_id
     and project_org.project_id = target_project_id
     and project_org.status = 'active'
     and project_org.project_role = 'client'
    where membership.user_id = target_user_id
      and membership.status = 'active'
  );
$$;

create or replace function public.user_can_manage_site_visits(target_user_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
      and lower(coalesce(participant.participant_role_label, '')) in (
        'project manager', 'project supervisor', 'supervisor', 'site engineer'
      )
  );
$$;

create or replace function public.is_site_visit_client(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_site_visit_client(auth.uid(), target_project_id);
$$;

create or replace function public.can_manage_site_visits(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_manage_site_visits(auth.uid(), target_project_id);
$$;

revoke all on function public.user_is_site_visit_client(uuid, uuid) from public;
revoke all on function public.user_can_manage_site_visits(uuid, uuid) from public;
revoke all on function public.is_site_visit_client(uuid) from public;
revoke all on function public.can_manage_site_visits(uuid) from public;
grant execute on function public.is_site_visit_client(uuid) to authenticated;
grant execute on function public.can_manage_site_visits(uuid) to authenticated;
grant execute on function public.user_is_site_visit_client(uuid, uuid) to service_role;
grant execute on function public.user_can_manage_site_visits(uuid, uuid) to service_role;

alter table public.site_visit_requests enable row level security;
alter table public.site_visit_request_assignees enable row level security;

drop policy if exists site_visit_requests_select on public.site_visit_requests;
create policy site_visit_requests_select on public.site_visit_requests for select
using (
  requested_by = auth.uid()
  or public.can_manage_site_visits(project_id)
);

drop policy if exists site_visit_requests_insert on public.site_visit_requests;
create policy site_visit_requests_insert on public.site_visit_requests for insert
with check (
  requested_by = auth.uid()
  and public.is_site_visit_client(project_id)
  and status = 'pending'
  and scheduled_date is null
  and scheduled_time is null
  and scheduled_notes is null
  and scheduled_by is null
  and completed_at is null
  and cancelled_at is null
);

drop policy if exists site_visit_requests_update on public.site_visit_requests;
create policy site_visit_requests_update on public.site_visit_requests for update
using (public.can_manage_site_visits(project_id))
with check (public.can_manage_site_visits(project_id));

drop policy if exists site_visit_request_assignees_select on public.site_visit_request_assignees;
create policy site_visit_request_assignees_select on public.site_visit_request_assignees for select
using (
  exists (
    select 1 from public.site_visit_requests request
    where request.id = site_visit_request_assignees.request_id
      and (request.requested_by = auth.uid() or public.can_manage_site_visits(request.project_id))
  )
);

drop policy if exists site_visit_request_assignees_insert on public.site_visit_request_assignees;
create policy site_visit_request_assignees_insert on public.site_visit_request_assignees for insert
with check (
  exists (
    select 1 from public.site_visit_requests request
    where request.id = site_visit_request_assignees.request_id
      and public.can_manage_site_visits(request.project_id)
  )
);

drop policy if exists site_visit_request_assignees_delete on public.site_visit_request_assignees;
create policy site_visit_request_assignees_delete on public.site_visit_request_assignees for delete
using (
  exists (
    select 1 from public.site_visit_requests request
    where request.id = site_visit_request_assignees.request_id
      and public.can_manage_site_visits(request.project_id)
  )
);

grant select on public.site_visit_requests to authenticated;
revoke insert, update, delete on public.site_visit_requests from authenticated;
grant insert (
  project_id,
  requested_by,
  client_request_id,
  status,
  preferred_date,
  is_asap,
  preferred_time,
  purpose,
  notes
) on public.site_visit_requests to authenticated;
grant select on public.site_visit_request_assignees to authenticated;
revoke insert, update, delete on public.site_visit_request_assignees from authenticated;

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
          and membership.user_id = assigned_user_id
          and membership.status = 'active'
      )
      or exists (
        select 1 from public.project_participants participant
        where participant.project_id = target_project_id
          and participant.key_contact_user_id = assigned_user_id
          and participant.status = 'active'
      )
      or exists (
        select 1
        from public.projects project
        join public.organization_memberships membership
          on membership.organization_id = project.supervising_organization_id
        where project.id = target_project_id
          and membership.user_id = assigned_user_id
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
end;
$$;

revoke all on function public.schedule_site_visit_request(uuid, uuid, date, time without time zone, text, uuid[]) from public;
grant execute on function public.schedule_site_visit_request(uuid, uuid, date, time without time zone, text, uuid[]) to service_role;

comment on table public.site_visit_requests is
  'Client-created project site visit requests with project-team scheduling and status workflow.';
comment on table public.site_visit_request_assignees is
  'Existing platform users assigned to a scheduled site visit request.';
