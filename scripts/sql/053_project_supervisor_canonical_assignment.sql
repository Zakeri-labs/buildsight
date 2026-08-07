-- Canonical Project Supervisor assignment repair.
-- projects.assigned_supervisor_id is the single source of truth for the
-- explicitly assigned Project Supervisor. project_participants remains a
-- display/contact mirror and must not independently grant Supervisor authority.

-- Backfill only projects whose intended Supervisor is unambiguous: exactly one
-- active participant explicitly labelled Supervisor / Project Supervisor, and
-- that user is an active Admin, Manager, or Member of the project's supervising
-- organization.
with supervisor_candidates as (
  select
    participant.project_id,
    (array_agg(distinct participant.key_contact_user_id))[1] as supervisor_id
  from public.project_participants participant
  join public.projects project on project.id = participant.project_id
  join public.organization_memberships membership
    on membership.organization_id = project.supervising_organization_id
   and membership.user_id = participant.key_contact_user_id
   and membership.status = 'active'
   and membership.role in ('org_admin', 'org_manager', 'org_member')
  where project.assigned_supervisor_id is null
    and participant.status = 'active'
    and participant.key_contact_user_id is not null
    and lower(btrim(coalesce(participant.participant_role_label, ''))) in ('supervisor', 'project supervisor')
  group by participant.project_id
  having count(distinct participant.key_contact_user_id) = 1
)
update public.projects project
set assigned_supervisor_id = candidate.supervisor_id,
    updated_at = now()
from supervisor_candidates candidate
where project.id = candidate.project_id
  and project.assigned_supervisor_id is null;

-- Ensure every canonical Supervisor has active project access without changing
-- an already-active unrelated project membership or role.
insert into public.project_user_memberships (
  project_id,
  user_id,
  organization_id,
  access_role,
  status,
  created_by
)
select
  project.id,
  project.assigned_supervisor_id,
  project.supervising_organization_id,
  'project_manager'::project_access_role,
  'active'::membership_status,
  project.created_by
from public.projects project
where project.assigned_supervisor_id is not null
  and not exists (
    select 1
    from public.project_user_memberships membership
    where membership.project_id = project.id
      and membership.user_id = project.assigned_supervisor_id
      and membership.organization_id = project.supervising_organization_id
      and membership.status = 'active'
  );

-- Keep the existing supervising-consultant participant row aligned with the
-- canonical Supervisor so Project Details displays the same person Calendar and
-- Site Visits authorize. access_membership_id is populated only for a
-- project-manager membership that matches the historical project-creation write;
-- this lets future reassignment revoke only Supervisor-created access.
insert into public.project_participants (
  project_id,
  organization_id,
  organization_name,
  participant_type,
  project_role,
  participant_role_label,
  access_membership_id,
  key_contact_user_id,
  key_contact_name,
  key_contact_email,
  status,
  source_key,
  sort_order,
  created_by
)
select
  project.id,
  project.supervising_organization_id,
  organization.name,
  'consultancy',
  'consultant'::project_org_role,
  'Supervisor',
  supervisor_access.id,
  project.assigned_supervisor_id,
  coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(profile.email), '')),
  profile.email,
  'active'::membership_status,
  'consultant',
  10,
  project.created_by
from public.projects project
join public.organizations organization on organization.id = project.supervising_organization_id
join public.profiles profile on profile.id = project.assigned_supervisor_id
left join lateral (
  select membership.id
  from public.project_user_memberships membership
  where membership.project_id = project.id
    and membership.user_id = project.assigned_supervisor_id
    and membership.organization_id = project.supervising_organization_id
    and membership.status = 'active'
    and membership.access_role = 'project_manager'
    and membership.created_by is not distinct from project.created_by
  order by membership.created_at asc
  limit 1
) supervisor_access on true
where project.assigned_supervisor_id is not null
on conflict (project_id, source_key) do update set
  organization_id = excluded.organization_id,
  organization_name = excluded.organization_name,
  participant_type = excluded.participant_type,
  project_role = excluded.project_role,
  participant_role_label = excluded.participant_role_label,
  access_membership_id = excluded.access_membership_id,
  key_contact_user_id = excluded.key_contact_user_id,
  key_contact_name = excluded.key_contact_name,
  key_contact_email = excluded.key_contact_email,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Retire only legacy duplicate Supervisor participant rows that point to the
-- same now-canonical Supervisor. Other participants remain untouched.
update public.project_participants participant
set status = 'inactive',
    updated_at = now()
from public.projects project
where participant.project_id = project.id
  and participant.source_key <> 'consultant'
  and participant.status = 'active'
  and participant.key_contact_user_id = project.assigned_supervisor_id
  and lower(btrim(coalesce(participant.participant_role_label, ''))) in ('supervisor', 'project supervisor');

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
  previous_access_membership_id uuid;
  previous_access_user_id uuid;
  new_access_membership_id uuid;
  existing_access_membership_id uuid;
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

  select participant.access_membership_id
    into previous_access_membership_id
  from public.project_participants participant
  where participant.project_id = target_project_id
    and participant.source_key = 'consultant'
  limit 1;

  -- Revoke only access that is explicitly linked to the old Supervisor mirror.
  -- If the same user is still the project's separate Assign User, preserve that
  -- access by reducing the Supervisor-created project_manager role to contributor.
  if previous_supervisor_id is distinct from target_supervisor_id
     and previous_supervisor_id is not null
     and previous_access_membership_id is not null then
    select membership.user_id
      into previous_access_user_id
    from public.project_user_memberships membership
    where membership.id = previous_access_membership_id
      and membership.project_id = target_project_id
      and membership.status = 'active';

    if previous_access_user_id = previous_supervisor_id then
      if assigned_user_id = previous_supervisor_id then
        update public.project_user_memberships membership
        set access_role = 'contributor'::project_access_role,
            status = 'active'::membership_status,
            updated_at = now()
        where membership.id = previous_access_membership_id
          and membership.project_id = target_project_id;
      else
        update public.project_user_memberships membership
        set status = 'inactive'::membership_status,
            updated_at = now()
        where membership.id = previous_access_membership_id
          and membership.project_id = target_project_id;
      end if;
    end if;
  end if;

  update public.projects project
  set assigned_supervisor_id = target_supervisor_id,
      updated_at = now()
  where project.id = target_project_id;

  -- Legacy duplicate Supervisor participant rows no longer grant or represent
  -- the canonical assignment after it changes.
  if previous_supervisor_id is not null then
    update public.project_participants participant
    set status = 'inactive',
        updated_at = now()
    where participant.project_id = target_project_id
      and participant.source_key <> 'consultant'
      and participant.key_contact_user_id = previous_supervisor_id
      and participant.status = 'active'
      and lower(btrim(coalesce(participant.participant_role_label, ''))) in ('supervisor', 'project supervisor');
  end if;

  if target_supervisor_id is null then
    update public.project_participants participant
    set access_membership_id = null,
        key_contact_user_id = null,
        key_contact_name = null,
        key_contact_email = null,
        participant_role_label = null,
        updated_at = now()
    where participant.project_id = target_project_id
      and participant.source_key = 'consultant';
    return null;
  end if;

  -- An existing active membership may represent separate legitimate project
  -- access, so reuse it without marking it as Supervisor-owned. Only a newly
  -- created membership is linked to the consultant mirror for later cleanup.
  -- Re-selecting the same Supervisor preserves an already-linked access row.
  if previous_supervisor_id = target_supervisor_id then
    new_access_membership_id := previous_access_membership_id;
  else
    select membership.id
      into existing_access_membership_id
    from public.project_user_memberships membership
    where membership.project_id = target_project_id
      and membership.user_id = target_supervisor_id
      and membership.organization_id = target_supervising_organization_id
      and membership.status = 'active'
    order by membership.created_at asc
    limit 1;

    if existing_access_membership_id is null then
      insert into public.project_user_memberships (
        project_id,
        user_id,
        organization_id,
        access_role,
        status,
        created_by
      ) values (
        target_project_id,
        target_supervisor_id,
        target_supervising_organization_id,
        'project_manager'::project_access_role,
        'active'::membership_status,
        actor_id
      )
      returning id into new_access_membership_id;
    end if;
  end if;

  insert into public.project_participants (
    project_id,
    organization_id,
    organization_name,
    participant_type,
    project_role,
    participant_role_label,
    access_membership_id,
    key_contact_user_id,
    key_contact_name,
    key_contact_email,
    status,
    source_key,
    sort_order,
    created_by
  ) values (
    target_project_id,
    target_supervising_organization_id,
    target_organization_name,
    'consultancy',
    'consultant'::project_org_role,
    'Supervisor',
    new_access_membership_id,
    target_supervisor_id,
    supervisor_name,
    supervisor_email,
    'active'::membership_status,
    'consultant',
    10,
    actor_id
  )
  on conflict (project_id, source_key) do update set
    organization_id = excluded.organization_id,
    organization_name = excluded.organization_name,
    participant_type = excluded.participant_type,
    project_role = excluded.project_role,
    participant_role_label = excluded.participant_role_label,
    access_membership_id = excluded.access_membership_id,
    key_contact_user_id = excluded.key_contact_user_id,
    key_contact_name = excluded.key_contact_name,
    key_contact_email = excluded.key_contact_email,
    status = excluded.status,
    sort_order = excluded.sort_order,
    updated_at = now();

  -- Retire a redundant legacy Supervisor participant row for the newly selected
  -- user, if one exists. The consultant row above is now the display mirror.
  update public.project_participants participant
  set status = 'inactive',
      updated_at = now()
  where participant.project_id = target_project_id
    and participant.source_key <> 'consultant'
    and participant.key_contact_user_id = target_supervisor_id
    and participant.status = 'active'
    and lower(btrim(coalesce(participant.participant_role_label, ''))) in ('supervisor', 'project supervisor');

  return target_supervisor_id;
end;
$$;

revoke all on function public.set_project_supervisor_assignment(uuid, uuid, uuid) from public;
grant execute on function public.set_project_supervisor_assignment(uuid, uuid, uuid) to service_role;

-- The direct Project Supervisor field is authoritative for Supervisor authority.
-- Preserve legitimate manager/site-engineer access while removing participant
-- labels "Supervisor" / "Project Supervisor" as a second Supervisor definition.
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
