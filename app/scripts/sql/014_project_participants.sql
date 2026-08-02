-- ============================================================
-- Project participant records created from the Add Project wizard
-- ============================================================

create table if not exists public.project_participants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text not null,
  participant_type text not null,
  project_role project_org_role not null,
  key_contact_user_id uuid references public.profiles(id) on delete set null,
  key_contact_name text,
  key_contact_email text,
  key_contact_phone text,
  status membership_status not null default 'active',
  source_key text not null,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_participants_organization_name_not_blank
    check (length(btrim(organization_name)) > 0),
  constraint project_participants_source_key_not_blank
    check (length(btrim(source_key)) > 0),
  constraint project_participants_type_check
    check (participant_type in ('client', 'contractor', 'consultancy', 'subcontractor', 'government', 'supplier', 'third_party')),
  constraint project_participants_project_source_unique unique (project_id, source_key)
);

create index if not exists project_participants_project_idx
  on public.project_participants (project_id, sort_order, created_at);
create index if not exists project_participants_organization_idx
  on public.project_participants (organization_id)
  where organization_id is not null;
create index if not exists project_participants_contact_user_idx
  on public.project_participants (key_contact_user_id)
  where key_contact_user_id is not null;

create or replace function public.touch_project_participant_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_participants_touch_updated_at on public.project_participants;
create trigger project_participants_touch_updated_at
  before update on public.project_participants
  for each row execute function public.touch_project_participant_updated_at();

alter table public.project_participants enable row level security;

drop policy if exists project_participants_select on public.project_participants;
create policy project_participants_select on public.project_participants for select
  using (
    public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists project_participants_insert on public.project_participants;
create policy project_participants_insert on public.project_participants for insert
  with check (public.is_project_admin(project_id));

drop policy if exists project_participants_update on public.project_participants;
create policy project_participants_update on public.project_participants for update
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

drop policy if exists project_participants_delete on public.project_participants;
create policy project_participants_delete on public.project_participants for delete
  using (public.is_project_admin(project_id));

-- Backfill the supervising consultant for existing projects.
insert into public.project_participants (
  project_id,
  organization_id,
  organization_name,
  participant_type,
  project_role,
  key_contact_user_id,
  key_contact_name,
  key_contact_email,
  status,
  source_key,
  sort_order,
  created_by,
  created_at,
  updated_at
)
select
  p.id,
  p.supervising_organization_id,
  o.name,
  'consultancy',
  'consultant'::project_org_role,
  p.assigned_supervisor_id,
  coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.email), '')),
  pr.email,
  'active'::membership_status,
  'consultant',
  10,
  p.created_by,
  p.created_at,
  p.updated_at
from public.projects p
join public.organizations o on o.id = p.supervising_organization_id
left join public.profiles pr on pr.id = p.assigned_supervisor_id
on conflict (project_id, source_key) do update set
  organization_id = excluded.organization_id,
  organization_name = excluded.organization_name,
  participant_type = excluded.participant_type,
  project_role = excluded.project_role,
  key_contact_user_id = excluded.key_contact_user_id,
  key_contact_name = excluded.key_contact_name,
  key_contact_email = excluded.key_contact_email,
  status = excluded.status,
  sort_order = excluded.sort_order;

-- Backfill all owner/client records captured by the project wizard.
insert into public.project_participants (
  project_id,
  organization_name,
  participant_type,
  project_role,
  key_contact_name,
  key_contact_email,
  key_contact_phone,
  status,
  source_key,
  sort_order,
  created_by,
  created_at,
  updated_at
)
select
  po.project_id,
  po.name,
  'client',
  'client'::project_org_role,
  po.contact_name,
  po.contact_email,
  po.contact_phone,
  'active'::membership_status,
  'owner:' || po.id::text,
  20 + po.owner_order,
  p.created_by,
  po.created_at,
  po.updated_at
from public.project_owners po
join public.projects p on p.id = po.project_id
on conflict (project_id, source_key) do update set
  organization_name = excluded.organization_name,
  participant_type = excluded.participant_type,
  project_role = excluded.project_role,
  key_contact_name = excluded.key_contact_name,
  key_contact_email = excluded.key_contact_email,
  key_contact_phone = excluded.key_contact_phone,
  status = excluded.status,
  sort_order = excluded.sort_order;

-- Backfill contractor details when a contractor was provided during project creation.
insert into public.project_participants (
  project_id,
  organization_id,
  organization_name,
  participant_type,
  project_role,
  key_contact_phone,
  status,
  source_key,
  sort_order,
  created_by,
  created_at,
  updated_at
)
select
  p.id,
  p.contractor_organization_id,
  btrim(p.contractor),
  'contractor',
  'contractor'::project_org_role,
  p.contractor_phone,
  'active'::membership_status,
  'contractor',
  40,
  p.created_by,
  p.created_at,
  p.updated_at
from public.projects p
where nullif(btrim(p.contractor), '') is not null
on conflict (project_id, source_key) do update set
  organization_id = excluded.organization_id,
  organization_name = excluded.organization_name,
  participant_type = excluded.participant_type,
  project_role = excluded.project_role,
  key_contact_phone = excluded.key_contact_phone,
  status = excluded.status,
  sort_order = excluded.sort_order;

-- Keep the project summary consultant label aligned with the supervising organization.
update public.projects p
set consultant = o.name
from public.organizations o
where o.id = p.supervising_organization_id
  and (p.consultant is null or btrim(p.consultant) = '');

-- Keep the project summary consultant label aligned with the supervising organization.
update public.projects p
set consultant = o.name
from public.organizations o
where o.id = p.supervising_organization_id
  and (p.consultant is null or btrim(p.consultant) = '');

comment on table public.project_participants is
  'Project-specific owner, contractor, consultant, and other participant display records. Access permissions remain in project organization/user memberships.';
comment on column public.project_participants.source_key is
  'Stable project-local source identifier such as consultant, contractor, or owner:<project_owner_id>.';
