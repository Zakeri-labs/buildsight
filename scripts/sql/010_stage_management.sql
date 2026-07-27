-- ============================================================
-- Stage management templates
-- Creates organization-scoped construction stages and report terms,
-- RLS policies, ordering support, and the default stage library.
-- ============================================================

create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stages_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists stages_org_name_unique
  on public.stages (organization_id, lower(name));
create index if not exists stages_org_order_idx
  on public.stages (organization_id, sort_order, created_at);

create table if not exists public.stage_terms (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  report_name text not null,
  is_required boolean not null default true,
  responsible_organization_id uuid references public.organizations(id) on delete set null,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  due_date_rule text not null default 'none',
  approval_required boolean not null default false,
  template_reference text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_terms_report_name_not_blank check (length(btrim(report_name)) > 0),
  constraint stage_terms_status_check check (status in ('active', 'disabled')),
  constraint stage_terms_due_date_rule_check check (
    due_date_rule in (
      'none',
      'stage_start',
      'within_3_days',
      'within_7_days',
      'within_14_days',
      'before_stage_completion',
      'project_milestone'
    )
  )
);

create unique index if not exists stage_terms_stage_name_unique
  on public.stage_terms (stage_id, lower(report_name));
create index if not exists stage_terms_stage_order_idx
  on public.stage_terms (stage_id, sort_order, created_at);
create index if not exists stage_terms_responsible_org_idx
  on public.stage_terms (responsible_organization_id)
  where responsible_organization_id is not null;
create index if not exists stage_terms_responsible_user_idx
  on public.stage_terms (responsible_user_id)
  where responsible_user_id is not null;

-- Keep responsibility assignments inside the supervising organization's
-- project scope even when writes are made directly through the API.
create or replace function public.validate_stage_term_responsibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_organization_id uuid;
begin
  select stage.organization_id
    into owner_organization_id
  from public.stages stage
  where stage.id = new.stage_id;

  if owner_organization_id is null then
    raise exception 'Stage not found for report term';
  end if;

  if new.responsible_organization_id is not null
     and new.responsible_organization_id <> owner_organization_id
     and not exists (
       select 1
       from public.project_organization_memberships membership
       join public.projects project on project.id = membership.project_id
       where project.supervising_organization_id = owner_organization_id
         and membership.organization_id = new.responsible_organization_id
         and membership.status = 'active'
     ) then
    raise exception 'Responsible organization is outside the stage template scope';
  end if;

  if new.responsible_user_id is not null then
    if new.responsible_organization_id is not null then
      if not exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = new.responsible_organization_id
          and membership.user_id = new.responsible_user_id
          and membership.status = 'active'
      ) and not exists (
        select 1
        from public.project_user_memberships membership
        join public.projects project on project.id = membership.project_id
        where project.supervising_organization_id = owner_organization_id
          and membership.organization_id = new.responsible_organization_id
          and membership.user_id = new.responsible_user_id
          and membership.status = 'active'
      ) then
        raise exception 'Responsible user does not belong to the selected organization';
      end if;
    elsif not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = owner_organization_id
        and membership.user_id = new.responsible_user_id
        and membership.status = 'active'
    ) and not exists (
      select 1
      from public.project_user_memberships membership
      join public.projects project on project.id = membership.project_id
      where project.supervising_organization_id = owner_organization_id
        and membership.user_id = new.responsible_user_id
        and membership.status = 'active'
    ) then
      raise exception 'Responsible user is outside the stage template scope';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists stage_terms_validate_responsibility on public.stage_terms;
create trigger stage_terms_validate_responsibility
  before insert or update of stage_id, responsible_organization_id, responsible_user_id
  on public.stage_terms
  for each row execute function public.validate_stage_term_responsibility();

-- Organization admins/managers and project admins/managers belonging to a
-- project supervised by the organization can manage stage templates.
create or replace function public.can_manage_stage_templates(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  );
$$;

alter table public.stages enable row level security;
alter table public.stage_terms enable row level security;

drop policy if exists stages_select on public.stages;
create policy stages_select on public.stages for select
  using (
    public.is_org_member(organization_id)
    or public.can_manage_stage_templates(organization_id)
  );

drop policy if exists stages_insert on public.stages;
create policy stages_insert on public.stages for insert
  with check (public.can_manage_stage_templates(organization_id));

drop policy if exists stages_update on public.stages;
create policy stages_update on public.stages for update
  using (public.can_manage_stage_templates(organization_id))
  with check (public.can_manage_stage_templates(organization_id));

drop policy if exists stages_delete on public.stages;
create policy stages_delete on public.stages for delete
  using (public.can_manage_stage_templates(organization_id));

drop policy if exists stage_terms_select on public.stage_terms;
create policy stage_terms_select on public.stage_terms for select
  using (
    exists (
      select 1
      from public.stages stage
      where stage.id = stage_terms.stage_id
        and (
          public.is_org_member(stage.organization_id)
          or public.can_manage_stage_templates(stage.organization_id)
        )
    )
  );

drop policy if exists stage_terms_insert on public.stage_terms;
create policy stage_terms_insert on public.stage_terms for insert
  with check (
    exists (
      select 1
      from public.stages stage
      where stage.id = stage_terms.stage_id
        and public.can_manage_stage_templates(stage.organization_id)
    )
  );

drop policy if exists stage_terms_update on public.stage_terms;
create policy stage_terms_update on public.stage_terms for update
  using (
    exists (
      select 1
      from public.stages stage
      where stage.id = stage_terms.stage_id
        and public.can_manage_stage_templates(stage.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.stages stage
      where stage.id = stage_terms.stage_id
        and public.can_manage_stage_templates(stage.organization_id)
    )
  );

drop policy if exists stage_terms_delete on public.stage_terms;
create policy stage_terms_delete on public.stage_terms for delete
  using (
    exists (
      select 1
      from public.stages stage
      where stage.id = stage_terms.stage_id
        and public.can_manage_stage_templates(stage.organization_id)
    )
  );

create or replace function public.touch_stage_management_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stages_touch_updated_at on public.stages;
create trigger stages_touch_updated_at
  before update on public.stages
  for each row execute function public.touch_stage_management_updated_at();

drop trigger if exists stage_terms_touch_updated_at on public.stage_terms;
create trigger stage_terms_touch_updated_at
  before update on public.stage_terms
  for each row execute function public.touch_stage_management_updated_at();

-- Seed the default construction lifecycle for one supervising organization.
create or replace function public.seed_default_stage_templates(target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stages (organization_id, name, sort_order, is_active)
  values
    (target_organization_id, 'Project Initiation & Mobilization', 1, true),
    (target_organization_id, 'Preliminary Works & Earthworks', 2, true),
    (target_organization_id, 'Foundation Works', 3, true),
    (target_organization_id, 'Substructure & Ground Floor', 4, true),
    (target_organization_id, 'Superstructure', 5, true),
    (target_organization_id, 'Masonry & MEP Rough-In', 6, true),
    (target_organization_id, 'Finishes & External Works', 7, true),
    (target_organization_id, 'Testing & Commissioning', 8, true),
    (target_organization_id, 'Handover & Closeout', 9, true)
  on conflict do nothing;

  insert into public.stage_terms (stage_id, report_name, sort_order, is_required, status)
  select stage.id, seed.report_name, seed.term_order, true, 'active'
  from (
    values
      ('Project Initiation & Mobilization', 'Site Handover Report', 1),
      ('Project Initiation & Mobilization', 'Mobilization Status Report', 2),
      ('Project Initiation & Mobilization', 'Baseline Programme Review Report', 3),
      ('Project Initiation & Mobilization', 'Permits and Approvals Status Report', 4),

      ('Preliminary Works & Earthworks', 'Preliminary Works Progress Report', 1),
      ('Preliminary Works & Earthworks', 'Excavation Inspection Report', 2),
      ('Preliminary Works & Earthworks', 'Survey and Formation Level Report', 3),
      ('Preliminary Works & Earthworks', 'Soil Compaction Test Summary', 4),
      ('Preliminary Works & Earthworks', 'Backfilling Inspection Report', 5),

      ('Foundation Works', 'Foundation Inspection Report', 1),
      ('Foundation Works', 'Reinforcement and Formwork Inspection Report', 2),
      ('Foundation Works', 'Concrete Pour Report', 3),
      ('Foundation Works', 'Concrete Test Results Summary', 4),
      ('Foundation Works', 'Foundation Waterproofing Report', 5),

      ('Substructure & Ground Floor', 'Substructure Progress Report', 1),
      ('Substructure & Ground Floor', 'Ground Slab Inspection Report', 2),
      ('Substructure & Ground Floor', 'Basement Waterproofing Report', 3),
      ('Substructure & Ground Floor', 'Underground MEP Services Report', 4),
      ('Substructure & Ground Floor', 'Underground Drainage Test Report', 5),

      ('Superstructure', 'Structural Progress Report', 1),
      ('Superstructure', 'Rebar and Formwork Inspection Report', 2),
      ('Superstructure', 'Concrete Works Report', 3),
      ('Superstructure', 'Structural Steel Inspection Report', 4),
      ('Superstructure', 'Survey and Verticality Report', 5),

      ('Masonry & MEP Rough-In', 'Blockwork Inspection Report', 1),
      ('Masonry & MEP Rough-In', 'MEP Rough-In Inspection Report', 2),
      ('Masonry & MEP Rough-In', 'MEP Coordination Report', 3),
      ('Masonry & MEP Rough-In', 'Pressure and Leakage Test Summary', 4),
      ('Masonry & MEP Rough-In', 'Fire Protection Installation Report', 5),

      ('Finishes & External Works', 'Finishes Progress Report', 1),
      ('Finishes & External Works', 'Wet Area Waterproofing and Flood Test Report', 2),
      ('Finishes & External Works', 'Façade, Door and Window Inspection Report', 3),
      ('Finishes & External Works', 'External Works and Landscape Report', 4),
      ('Finishes & External Works', 'Preliminary Snagging Report', 5),

      ('Testing & Commissioning', 'Testing and Commissioning Progress Report', 1),
      ('Testing & Commissioning', 'Equipment Start-Up Report', 2),
      ('Testing & Commissioning', 'MEP Systems Test Summary', 3),
      ('Testing & Commissioning', 'Integrated Systems Testing Report', 4),
      ('Testing & Commissioning', 'Commissioning Completion Report', 5),

      ('Handover & Closeout', 'Final Inspection Report', 1),
      ('Handover & Closeout', 'Snag List Report', 2),
      ('Handover & Closeout', 'Snag Closure Report', 3),
      ('Handover & Closeout', 'Handover Readiness Report', 4),
      ('Handover & Closeout', 'Project Handover Report', 5),
      ('Handover & Closeout', 'Project Closeout Report', 6)
  ) as seed(stage_name, report_name, term_order)
  join public.stages stage
    on stage.organization_id = target_organization_id
   and stage.name = seed.stage_name
  on conflict do nothing;
end;
$$;

-- Seed all existing supervising organizations.
do $$
declare
  organization_record record;
begin
  for organization_record in
    select id from public.organizations where type = 'supervising'
  loop
    perform public.seed_default_stage_templates(organization_record.id);
  end loop;
end;
$$;

-- Future supervising organizations receive the same defaults automatically.
create or replace function public.seed_stage_templates_for_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'supervising' then
    perform public.seed_default_stage_templates(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_seed_stage_templates on public.organizations;
create trigger organizations_seed_stage_templates
  after insert or update of type on public.organizations
  for each row
  when (new.type = 'supervising')
  execute function public.seed_stage_templates_for_new_organization();

-- Seeding helpers are internal migration/trigger functions and must not be
-- callable directly by client roles.
revoke all on function public.validate_stage_term_responsibility() from public;
revoke all on function public.seed_default_stage_templates(uuid) from public;
revoke all on function public.seed_stage_templates_for_new_organization() from public;
